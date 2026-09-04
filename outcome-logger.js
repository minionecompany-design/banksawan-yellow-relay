"use strict";

// Lightweight telemetry for shadow mode.  Railway logs are the durable
// output in v0; a database is deliberately out of scope for this patch.

const DEFAULT_HORIZONS_MINUTES = Object.freeze([
    1,
    3,
    5,
    10,
    15,
    30,
    60
]);

function finite(value) {
    return typeof value === "number" &&
        Number.isFinite(value);
}

function toNumber(value) {
    const number = Number(value);
    return finite(number) ? number : null;
}

function percentChange(current, entry) {
    if (!finite(current) || !finite(entry) || entry <= 0) return null;
    return (current / entry - 1) * 100;
}

function eventAtFrom(input) {
    const value = toNumber(input);
    return finite(value) && value > 0 ? value : null;
}

function maxFinite(values) {
    const valid = values.filter(finite);
    return valid.length ? Math.max(...valid) : null;
}

function minFinite(values) {
    const valid = values.filter(finite);
    return valid.length ? Math.min(...valid) : null;
}

class OutcomeLogger {
    constructor({
        log = line => console.log(line),
        horizons = DEFAULT_HORIZONS_MINUTES,
        maxPending = 5_000
    } = {}) {
        this.log = log;
        this.horizons = [...new Set(horizons)]
            .map(Number)
            .filter(value => finite(value) && value > 0)
            .sort((a, b) => a - b);
        this.maxPending = maxPending;
        this.pending = new Map();
    }

    emit(type, payload) {
        this.log(JSON.stringify({
            telemetry: "banksawan-yellow",
            type,
            ...payload
        }));
    }

    recordSignal({
        eventId,
        symbol,
        tf,
        eventAt,
        entryPrice,
        quality
    }) {
        const normalizedEventAt = eventAtFrom(eventAt);
        const normalizedEntry = toNumber(entryPrice);

        if (
            !eventId ||
            !symbol ||
            !normalizedEventAt ||
            !finite(normalizedEntry) ||
            normalizedEntry <= 0
        ) {
            return false;
        }

        if (this.pending.has(eventId)) return false;

        while (this.pending.size >= this.maxPending) {
            const oldest = this.pending.keys().next().value;
            this.pending.delete(oldest);
            this.emit("quality_pending_evicted", {
                event_id: oldest,
                reason: "MAX_PENDING"
            });
        }

        const record = {
            eventId: String(eventId),
            symbol: String(symbol).toUpperCase(),
            tf: String(tf).toUpperCase(),
            eventAt: normalizedEventAt,
            entryPrice: normalizedEntry,
            quality: quality
                ? {
                    decision: quality.decision,
                    phase: quality.phase,
                    score: quality.score,
                    reasonCodes: quality.reasonCodes
                }
                : null,
            outcomes: new Map()
        };

        this.pending.set(record.eventId, record);

        this.emit("quality_signal", {
            event_id: record.eventId,
            symbol: record.symbol,
            tf: record.tf,
            event_at: record.eventAt,
            entry_price: record.entryPrice,
            decision: record.quality?.decision || null,
            phase: record.quality?.phase || null,
            quality_score: record.quality?.score ?? null,
            reason_codes: record.quality?.reasonCodes || []
        });

        return true;
    }

    observeSnapshot({
        symbol,
        oneMinuteCandles,
        now = Date.now()
    }) {
        if (!symbol || !Array.isArray(oneMinuteCandles)) return 0;

        const normalizedSymbol = String(symbol).toUpperCase();
        const relevant = [...this.pending.values()]
            .filter(record => record.symbol === normalizedSymbol);
        let completed = 0;

        for (const record of relevant) {
            const maxHorizonMs = this.horizons.at(-1) * 60_000;
            const future = oneMinuteCandles
                .filter(candle =>
                    finite(candle?.openTime) &&
                    candle.openTime > record.eventAt &&
                    candle.openTime <= record.eventAt + maxHorizonMs
                )
                .sort((a, b) => a.openTime - b.openTime);

            for (const minutes of this.horizons) {
                if (record.outcomes.has(minutes)) continue;

                const horizonMs = minutes * 60_000;
                const window = future.filter(candle =>
                    candle.openTime <= record.eventAt + horizonMs
                );
                const last = window[window.length - 1];

                if (
                    !last ||
                    !finite(last.closeTime) ||
                    last.closeTime < record.eventAt + horizonMs
                ) {
                    continue;
                }

                const high = maxFinite(window.map(candle => candle.high));
                const low = minFinite(window.map(candle => candle.low));
                const close = toNumber(last.close);

                record.outcomes.set(minutes, {
                    mfePct: percentChange(high, record.entryPrice),
                    maePct: percentChange(low, record.entryPrice),
                    closeReturnPct: percentChange(close, record.entryPrice)
                });

                this.emit("quality_outcome", {
                    event_id: record.eventId,
                    symbol: record.symbol,
                    tf: record.tf,
                    event_at: record.eventAt,
                    entry_price: record.entryPrice,
                    horizon_min: minutes,
                    outcome: record.outcomes.get(minutes),
                    observed_at: now
                });
            }

            if (record.outcomes.size === this.horizons.length) {
                this.pending.delete(record.eventId);
                completed++;
            }
        }

        return completed;
    }

    pendingCount() {
        return this.pending.size;
    }
}

function createOutcomeLogger(options) {
    return new OutcomeLogger(options);
}

module.exports = {
    DEFAULT_HORIZONS_MINUTES,
    OutcomeLogger,
    createOutcomeLogger
};


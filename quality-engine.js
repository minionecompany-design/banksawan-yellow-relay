"use strict";

// Quality Gate v0 is intentionally downstream of LONG A.  It never changes
// the Pine-parity formula; it only classifies a raw Yellow event.

const DEFAULT_QUALITY_CONFIG = Object.freeze({
    mode: "shadow",
    minScore: 78,
    maxLatencyMs: 45_000,
    lateRsi: 69,
    lateRunupPct: 6,
    lateRoomPct: 1,
    lateExtensionAtr: 3,
    maxSpreadBps: 25,
    requireSpread: false,
    allowLateBreakout: false
});

function finite(value) {
    return typeof value === "number" &&
        Number.isFinite(value);
}

function numberOrNull(value) {
    const number = Number(value);
    return finite(number) ? number : null;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function envNumber(env, key, fallback, min, max) {
    const value = Number(env?.[key]);
    if (!finite(value)) return fallback;
    return clamp(value, min, max);
}

function envBoolean(env, key, fallback) {
    if (env?.[key] == null) return fallback;
    return ["1", "true", "yes", "on"].includes(
        String(env[key]).trim().toLowerCase()
    );
}

function createQualityConfig(env = process.env) {
    const mode = String(
        env?.QUALITY_GATE_MODE ?? DEFAULT_QUALITY_CONFIG.mode
    ).trim().toLowerCase();

    return {
        mode: ["shadow", "enforce", "off"].includes(mode)
            ? mode
            : DEFAULT_QUALITY_CONFIG.mode,
        minScore: envNumber(
            env,
            "QUALITY_MIN_SCORE",
            DEFAULT_QUALITY_CONFIG.minScore,
            0,
            100
        ),
        maxLatencyMs: envNumber(
            env,
            "QUALITY_MAX_LATENCY_MS",
            DEFAULT_QUALITY_CONFIG.maxLatencyMs,
            1_000,
            300_000
        ),
        lateRsi: envNumber(
            env,
            "QUALITY_LATE_RSI",
            DEFAULT_QUALITY_CONFIG.lateRsi,
            50,
            95
        ),
        lateRunupPct: envNumber(
            env,
            "QUALITY_LATE_RUNUP_PCT",
            DEFAULT_QUALITY_CONFIG.lateRunupPct,
            0,
            100
        ),
        lateRoomPct: envNumber(
            env,
            "QUALITY_LATE_ROOM_PCT",
            DEFAULT_QUALITY_CONFIG.lateRoomPct,
            0,
            100
        ),
        lateExtensionAtr: envNumber(
            env,
            "QUALITY_LATE_EXTENSION_ATR",
            DEFAULT_QUALITY_CONFIG.lateExtensionAtr,
            0,
            20
        ),
        maxSpreadBps: envNumber(
            env,
            "QUALITY_MAX_SPREAD_BPS",
            DEFAULT_QUALITY_CONFIG.maxSpreadBps,
            0.1,
            500
        ),
        requireSpread: envBoolean(
            env,
            "QUALITY_REQUIRE_SPREAD",
            DEFAULT_QUALITY_CONFIG.requireSpread
        ),
        allowLateBreakout: envBoolean(
            env,
            "QUALITY_ALLOW_LATE_BREAKOUT",
            DEFAULT_QUALITY_CONFIG.allowLateBreakout
        )
    };
}

function valuesAround(values, index, lookback, includeCurrent = false) {
    if (!Array.isArray(values)) return [];

    const end = includeCurrent ? index + 1 : index;
    return values
        .slice(Math.max(0, end - lookback), end)
        .filter(finite);
}

function median(values) {
    const sorted = values
        .filter(finite)
        .sort((a, b) => a - b);

    if (!sorted.length) return null;

    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
    const valid = values.filter(finite);
    if (!valid.length) return null;
    return valid.reduce((sum, value) => sum + value, 0) /
        valid.length;
}

function minValue(values) {
    const valid = values.filter(finite);
    return valid.length ? Math.min(...valid) : null;
}

function maxValue(values) {
    const valid = values.filter(finite);
    return valid.length ? Math.max(...valid) : null;
}

function percentChange(current, previous) {
    if (!finite(current) || !finite(previous) || previous === 0) {
        return null;
    }

    return (current / previous - 1) * 100;
}

function ratio(numerator, denominator) {
    if (!finite(numerator) || !finite(denominator) || denominator === 0) {
        return null;
    }

    return numerator / denominator;
}

function trueRange(candle, previousClose) {
    if (!candle || !finite(candle.high) || !finite(candle.low)) {
        return null;
    }

    const close = finite(previousClose)
        ? previousClose
        : candle.open;

    return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - close),
        Math.abs(candle.low - close)
    );
}

function atrAt(candles, index, length = 14) {
    if (!Array.isArray(candles) || !candles[index]) return null;

    const ranges = [];

    for (
        let i = Math.max(0, index - length + 1);
        i <= index;
        i++
    ) {
        const previousClose = candles[i - 1]?.close ?? candles[i].open;
        const range = trueRange(candles[i], previousClose);
        if (finite(range)) ranges.push(range);
    }

    return ranges.length >= Math.min(length, 2)
        ? mean(ranges)
        : null;
}

function resolveBookTicker(snapshot) {
    const symbol = snapshot?.symbol;
    return snapshot?.bookTicker ||
        snapshot?.book ||
        snapshot?.bookTickers?.[symbol] ||
        snapshot?.bookTickerBySymbol?.[symbol] ||
        null;
}

function spreadFromBookTicker(snapshot, now) {
    const book = resolveBookTicker(snapshot);
    if (!book) {
        return {
            bid: null,
            ask: null,
            spreadBps: null,
            bookAgeMs: null
        };
    }

    const bid = numberOrNull(book.bidPrice ?? book.b);
    const ask = numberOrNull(book.askPrice ?? book.a);
    const midpoint = finite(bid) && finite(ask)
        ? (bid + ask) / 2
        : null;
    const spreadBps = finite(midpoint) && midpoint > 0
        ? ((ask - bid) / midpoint) * 10_000
        : null;
    const bookTime = numberOrNull(
        book.eventTime ?? book.E ?? book.time ?? book.timestamp
    );

    return {
        bid,
        ask,
        spreadBps: finite(spreadBps) && spreadBps >= 0
            ? spreadBps
            : null,
        bookAgeMs: finite(bookTime)
            ? Math.max(0, now - bookTime)
            : null
    };
}

function countOne(values) {
    return values.filter(Boolean).length;
}

function detectOneMinuteGap(snapshot) {
    const candles = snapshot?.tf?.["1m"];
    if (!Array.isArray(candles) || candles.length < 2) return false;

    const start = Math.max(1, candles.length - 60);
    for (let i = start; i < candles.length; i++) {
        const previous = candles[i - 1];
        const current = candles[i];
        if (
            finite(previous?.openTime) &&
            finite(current?.openTime) &&
            current.openTime - previous.openTime !== 60_000
        ) {
            return true;
        }
    }

    return false;
}

function computeFeatures({
    snapshot,
    indicators,
    signal,
    tf,
    index,
    now = Date.now()
}) {
    const candles = snapshot?.tf?.[tf];
    const candle = candles?.[index];
    const ma = indicators?.[tf] || {};
    const diagnostics = signal?.diagnostics || {};

    if (!candle || !Array.isArray(candles)) {
        return {
            valid: false,
            tf,
            index,
            latencyMs: null,
            reasonCodes: ["DATA_INVALID"]
        };
    }

    const previous20 = candles
        .slice(Math.max(0, index - 20), index);
    const recent30 = candles
        .slice(Math.max(0, index - 29), index + 1);
    const previous100 = candles
        .slice(Math.max(0, index - 100), index);
    const range = candle.high - candle.low;
    const atr14 = atrAt(candles, index, 14);
    const spread = spreadFromBookTicker(snapshot, now);
    const ma7 = numberOrNull(ma.ma7?.[index]);
    const ma25 = numberOrNull(ma.ma25?.[index]);
    const ma99 = numberOrNull(ma.ma99?.[index]);
    const previousMa7 = numberOrNull(ma.ma7?.[Math.max(0, index - 3)]);
    const previousMa25 = numberOrNull(ma.ma25?.[Math.max(0, index - 3)]);
    const previousMa99 = numberOrNull(ma.ma99?.[Math.max(0, index - 3)]);
    const quoteMedian = median(
        previous20.map(item => numberOrNull(item.quoteVolume))
    );
    const tradeMedian = median(
        previous20.map(item => numberOrNull(item.trades))
    );
    const priorHigh = maxValue(
        previous100.map(item => numberOrNull(item.high))
    );
    const recentLow = minValue(
        recent30.map(item => numberOrNull(item.low))
    );
    const closeLocation = ratio(
        candle.close - candle.low,
        range
    );
    const upperWick = candle.high - Math.max(candle.open, candle.close);

    const features = {
        valid: [
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            signal?.closeTime
        ].every(finite),
        tf,
        index,
        eventAt: numberOrNull(signal?.closeTime),
        detectedAt: now,
        latencyMs: finite(signal?.closeTime)
            ? Math.max(0, now - signal.closeTime)
            : null,
        rsi: numberOrNull(diagnostics.rsiValue),
        rsiAverage: numberOrNull(diagnostics.rsiAverage),
        volumeRatio: numberOrNull(diagnostics.volumeRatio),
        distanceMA7Pct: numberOrNull(diagnostics.distanceFromMA7),
        distanceMA25Pct: percentChange(candle.close, ma25),
        distanceMA99Pct: percentChange(candle.close, ma99),
        ma7SlopePct: percentChange(ma7, previousMa7),
        ma25SlopePct: percentChange(ma25, previousMa25),
        ma99SlopePct: percentChange(ma99, previousMa99),
        quoteVolume: numberOrNull(candle.quoteVolume),
        quoteVolumeRatio: ratio(
            numberOrNull(candle.quoteVolume),
            quoteMedian
        ),
        trades: numberOrNull(candle.trades),
        tradeCountRatio: ratio(
            numberOrNull(candle.trades),
            tradeMedian
        ),
        takerBuyQuote: numberOrNull(candle.takerBuyQuote),
        takerBuyShare: ratio(
            numberOrNull(candle.takerBuyQuote),
            numberOrNull(candle.quoteVolume)
        ),
        candleReturnPct: percentChange(candle.close, candle.open),
        closeLocation,
        upperWickRatio: ratio(upperWick, range),
        bodyToAtr: ratio(Math.abs(candle.close - candle.open), atr14),
        atr14,
        atrPct: finite(ratio(atr14, candle.close))
            ? ratio(atr14, candle.close) * 100
            : null,
        rangeToAtr14: ratio(range, atr14),
        extensionAtr: ratio(candle.close - ma7, atr14),
        runupFrom30BarLowPct:
            percentChange(candle.close, recentLow),
        roomToPrior100HighPct:
            percentChange(priorHigh, candle.close),
        spreadBps: spread.spreadBps,
        bid: spread.bid,
        ask: spread.ask,
        bookAgeMs: spread.bookAgeMs,
        dataGap1m: detectOneMinuteGap(snapshot),
        mtfSupportCount: countOne([
            diagnostics.oneHourPermission,
            diagnostics.fifteenMinuteSupport,
            diagnostics.fiveMinuteMomentum,
            diagnostics.currentTfTrigger
        ]),
        rawHealthScore: numberOrNull(signal?.healthScore),
        rawHealth: signal?.health || null
    };

    return features;
}

function classifyPhase(features, config = DEFAULT_QUALITY_CONFIG) {
    if (!features?.valid) return "DATA_INVALID";

    const late = (
        finite(features.rsi) &&
        features.rsi >= config.lateRsi
    ) || (
        finite(features.runupFrom30BarLowPct) &&
        features.runupFrom30BarLowPct >= config.lateRunupPct
    ) || (
        finite(features.roomToPrior100HighPct) &&
        features.roomToPrior100HighPct < config.lateRoomPct
    ) || (
        finite(features.extensionAtr) &&
        features.extensionAtr >= config.lateExtensionAtr
    );

    if (late) return "LATE_EXHAUSTION";

    const early = (
        finite(features.rsi) &&
        features.rsi <= 62 &&
        finite(features.distanceMA7Pct) &&
        features.distanceMA7Pct <= 0.8 &&
        finite(features.runupFrom30BarLowPct) &&
        features.runupFrom30BarLowPct <= 4 &&
        finite(features.roomToPrior100HighPct) &&
        features.roomToPrior100HighPct >= 1.5
    );

    return early
        ? "EARLY_BASE"
        : "CONFIRMED_CONTINUATION";
}

function scoreFeatures(features, phase, config = DEFAULT_QUALITY_CONFIG) {
    if (!features?.valid) {
        return {
            score: 0,
            components: {
                structure: 0,
                trend: 0,
                participation: 0,
                context: 0,
                execution: 0
            }
        };
    }

    let structure = phase === "EARLY_BASE"
        ? 25
        : phase === "LATE_EXHAUSTION"
            ? 5
            : 20;

    if (features.roomToPrior100HighPct >= 2) structure += 10;
    else if (features.roomToPrior100HighPct >= 1) structure += 6;
    else if (features.roomToPrior100HighPct >= config.lateRoomPct) structure += 2;

    const trend = clamp(
        features.mtfSupportCount * 3 +
            (features.ma7SlopePct > 0 ? 3 : 0) +
            (features.ma25SlopePct > 0 ? 3 : 0),
        0,
        20
    );

    let participation = 0;
    if (features.quoteVolumeRatio >= 1.5) participation += 7;
    else if (features.quoteVolumeRatio >= 1) participation += 5;
    else if (features.quoteVolumeRatio >= 0.75) participation += 2;

    if (features.tradeCountRatio >= 1.5) participation += 5;
    else if (features.tradeCountRatio >= 1) participation += 3;
    else if (features.tradeCountRatio >= 0.75) participation += 1;

    // Taker flow is supporting evidence only.  A value below 50% is not a
    // veto because absorption/pullback entries can legitimately be red.
    if (features.takerBuyShare >= 0.55) participation += 4;
    else if (features.takerBuyShare >= 0.45) participation += 3;
    else if (finite(features.takerBuyShare)) participation += 1;

    if (
        features.closeLocation >= 0.65 &&
        features.upperWickRatio <= 0.35
    ) {
        participation += 4;
    } else if (features.closeLocation >= 0.5) {
        participation += 2;
    }

    participation = clamp(participation, 0, 20);

    // OI/funding are candidate-enrichment fields and are intentionally
    // neutral in v0 when they are not present.
    const context = 5;

    let execution = 3; // unknown spread is neutral, not a false pass
    if (features.latencyMs <= 15_000) execution += 8;
    else if (features.latencyMs <= config.maxLatencyMs) execution += 5;

    if (finite(features.spreadBps)) {
        if (features.spreadBps <= config.maxSpreadBps) execution += 4;
        else if (features.spreadBps <= config.maxSpreadBps * 2) execution += 2;
    }

    execution = clamp(execution, 0, 15);

    const components = {
        structure: clamp(structure, 0, 35),
        trend,
        participation,
        context,
        execution
    };

    return {
        score: clamp(
            Math.round(
                Object.values(components)
                    .reduce((sum, value) => sum + value, 0)
            ),
            0,
            100
        ),
        components
    };
}

function evaluateQuality({
    snapshot,
    indicators,
    signal,
    tf,
    index,
    now = Date.now(),
    config = createQualityConfig()
}) {
    const features = computeFeatures({
        snapshot,
        indicators,
        signal,
        tf,
        index,
        now
    });
    const phase = classifyPhase(features, config);
    const scored = scoreFeatures(features, phase, config);
    const hardVetoes = [];
    const reasonCodes = [];

    if (!features.valid) hardVetoes.push("DATA_INVALID");
    if (features.dataGap1m) hardVetoes.push("DATA_GAP_1M");
    if (
        finite(features.latencyMs) &&
        features.latencyMs > config.maxLatencyMs
    ) {
        hardVetoes.push("STALE_EVENT");
    }
    if (
        finite(features.spreadBps) &&
        features.spreadBps > config.maxSpreadBps * 2
    ) {
        hardVetoes.push("SPREAD_TOO_WIDE");
    }
    if (config.requireSpread && !finite(features.spreadBps)) {
        hardVetoes.push("SPREAD_UNAVAILABLE");
    }

    if (phase === "EARLY_BASE") reasonCodes.push("PHASE_EARLY_BASE");
    if (phase === "CONFIRMED_CONTINUATION") {
        reasonCodes.push("PHASE_CONFIRMED");
    }
    if (phase === "LATE_EXHAUSTION") {
        reasonCodes.push("LATE_EXHAUSTION");
    }
    if (features.roomToPrior100HighPct >= 1.5) reasonCodes.push("ROOM_OK");
    else if (finite(features.roomToPrior100HighPct)) reasonCodes.push("ROOM_LOW");
    if (features.mtfSupportCount >= 4) reasonCodes.push("MTF_ALIGNED");
    if (features.quoteVolumeRatio >= 1) reasonCodes.push("QUOTE_VOLUME_SUPPORT");
    if (features.tradeCountRatio >= 1) reasonCodes.push("TRADE_COUNT_SUPPORT");
    if (finite(features.spreadBps)) reasonCodes.push("SPREAD_OBSERVED");
    else reasonCodes.push("SPREAD_NOT_LOADED");
    if (hardVetoes.length) reasonCodes.push(...hardVetoes);

    const softBlock =
        phase === "LATE_EXHAUSTION" &&
        !config.allowLateBreakout;

    let decision = "READY";
    if (hardVetoes.length) decision = "REJECTED";
    else if (softBlock || scored.score < config.minScore) decision = "WATCH";

    return {
        decision,
        phase,
        score: scored.score,
        components: scored.components,
        reasonCodes: [...new Set(reasonCodes)],
        hardVetoes,
        features,
        config: {
            mode: config.mode,
            minScore: config.minScore,
            maxLatencyMs: config.maxLatencyMs
        }
    };
}

module.exports = {
    DEFAULT_QUALITY_CONFIG,
    createQualityConfig,
    computeFeatures,
    classifyPhase,
    scoreFeatures,
    evaluateQuality,
    atrAt,
    median
};

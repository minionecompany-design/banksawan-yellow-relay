"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createQualityConfig,
    evaluateQuality
} = require("../quality-engine");

function fixture({
    rsi = 55,
    roomPct = 2.5,
    runupPct = 1,
    close = 101,
    open = 101,
    takerShare = 0.5,
    nowOffsetMs = 1_000,
    withBook = true
} = {}) {
    const candles = [];
    const ma7 = [];
    const ma25 = [];
    const ma99 = [];
    const lastIndex = 119;
    const start = 1_700_000_000_000;

    for (let i = 0; i <= lastIndex; i++) {
        const openTime = start + i * 60_000;
        const isLast = i === lastIndex;
        const base = isLast ? close : 100;
        candles.push({
            openTime,
            open: isLast ? open : 100,
            high: isLast ? Math.max(open, close) + 0.2 : 100.2,
            low: isLast ? Math.min(open, close) - 0.2 : 99.8,
            close: base,
            volume: isLast ? 120 : 100,
            quoteVolume: isLast ? 1_200 : 1_000,
            trades: isLast ? 120 : 100,
            takerBuyQuote: isLast ? 1_200 * takerShare : 500,
            closeTime: openTime + 59_999
        });

        ma7.push(isLast ? 100.8 : 100);
        ma25.push(isLast ? 100.5 : 100);
        ma99.push(isLast ? 100.1 : 100);
    }

    // Shape the prior high/low independently of the current candle so the
    // phase fixture tests room and run-up without changing the formula.
    candles[lastIndex - 2].high = close * (1 + roomPct / 100);
    candles[lastIndex - 2].low = close / (1 + runupPct / 100);

    const signal = {
        yellow: true,
        price: close,
        closeTime: candles[lastIndex].closeTime,
        health: "STRONG",
        healthScore: 95,
        diagnostics: {
            rsiValue: rsi,
            rsiAverage: 52,
            volumeRatio: 1.2,
            distanceFromMA7: 0.2,
            oneHourPermission: true,
            fifteenMinuteSupport: true,
            fiveMinuteMomentum: true,
            currentTfTrigger: true
        }
    };

    const snapshot = {
        symbol: "TESTUSDT",
        tf: {
            "1m": candles,
            "5m": candles,
            "15m": candles,
            "1h": candles
        }
    };

    if (withBook) {
        snapshot.bookTicker = {
            bidPrice: String(close - 0.01),
            askPrice: String(close + 0.01),
            eventTime: signal.closeTime + nowOffsetMs
        };
    }

    return {
        snapshot,
        indicators: {
            "1m": { ma7, ma25, ma99 },
            "5m": { ma7, ma25, ma99 },
            "15m": { ma7, ma25, ma99 },
            "1h": { ma7, ma25, ma99 }
        },
        signal,
        tf: "1m",
        index: lastIndex,
        now: signal.closeTime + nowOffsetMs
    };
}

test("defaults quality gate to shadow mode", () => {
    const config = createQualityConfig({});
    assert.equal(config.mode, "shadow");
    assert.equal(config.minScore, 78);
    assert.equal(config.maxLatencyMs, 45_000);
});

test("early base with red or neutral taker flow is not hard rejected", () => {
    const input = fixture({
        open: 101.1,
        takerShare: 0.42
    });
    const result = evaluateQuality(input);

    assert.equal(result.phase, "EARLY_BASE");
    assert.notEqual(result.decision, "REJECTED");
    assert.ok(!result.hardVetoes.includes("LATE_EXHAUSTION"));
});

test("late extension is held for review instead of becoming READY", () => {
    const input = fixture({
        rsi: 72,
        roomPct: 0.6,
        runupPct: 8
    });
    const result = evaluateQuality(input);

    assert.equal(result.phase, "LATE_EXHAUSTION");
    assert.equal(result.decision, "WATCH");
    assert.ok(result.reasonCodes.includes("LATE_EXHAUSTION"));
});

test("stale event is rejected by the freshness veto", () => {
    const input = fixture({
        nowOffsetMs: 60_000
    });
    const result = evaluateQuality(input);

    assert.equal(result.decision, "REJECTED");
    assert.ok(result.hardVetoes.includes("STALE_EVENT"));
});

test("missing book data stays neutral in v0 unless explicitly required", () => {
    const input = fixture({ withBook: false });
    const result = evaluateQuality(input);

    assert.ok(result.reasonCodes.includes("SPREAD_NOT_LOADED"));
    assert.notEqual(result.decision, "REJECTED");
});


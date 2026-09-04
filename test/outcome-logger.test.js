"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createOutcomeLogger
} = require("../outcome-logger");

function candle(openTime, close, high, low) {
    return {
        openTime,
        closeTime: openTime + 59_999,
        open: close,
        close,
        high,
        low
    };
}

test("records a signal once and labels completed forward horizons", () => {
    const lines = [];
    const logger = createOutcomeLogger({
        log: line => lines.push(JSON.parse(line)),
        horizons: [1, 3]
    });
    const eventAt = 1_700_000_059_999;
    const start = 1_700_000_060_000;

    assert.equal(logger.recordSignal({
        eventId: "TESTUSDT-1M-1",
        symbol: "TESTUSDT",
        tf: "1M",
        eventAt,
        entryPrice: 100,
        quality: {
            decision: "READY",
            phase: "EARLY_BASE",
            score: 84,
            reasonCodes: ["ROOM_OK"]
        }
    }), true);

    assert.equal(logger.recordSignal({
        eventId: "TESTUSDT-1M-1",
        symbol: "TESTUSDT",
        tf: "1M",
        eventAt,
        entryPrice: 100
    }), false);

    const candles = [
        candle(start, 101, 102, 99),
        candle(start + 60_000, 99, 101, 98),
        candle(start + 120_000, 102, 103, 100)
    ];

    assert.equal(logger.observeSnapshot({
        symbol: "TESTUSDT",
        oneMinuteCandles: candles,
        now: start + 180_000
    }), 1);
    assert.equal(logger.pendingCount(), 0);

    const outcomes = lines.filter(line => line.type === "quality_outcome");
    assert.equal(outcomes.length, 2);
    assert.equal(outcomes[0].horizon_min, 1);
    assert.ok(Math.abs(outcomes[0].outcome.mfePct - 2) < 1e-9);
    assert.ok(Math.abs(outcomes[0].outcome.maePct + 1) < 1e-9);
    assert.equal(outcomes[1].horizon_min, 3);
    assert.ok(Math.abs(outcomes[1].outcome.closeReturnPct - 2) < 1e-9);
});

test("keeps a pending signal when the horizon is not complete", () => {
    const logger = createOutcomeLogger({
        log: () => {},
        horizons: [5]
    });
    const eventAt = 1_700_000_059_999;

    logger.recordSignal({
        eventId: "TESTUSDT-5M-1",
        symbol: "TESTUSDT",
        tf: "5M",
        eventAt,
        entryPrice: 100
    });

    logger.observeSnapshot({
        symbol: "TESTUSDT",
        oneMinuteCandles: [
            candle(1_700_000_060_000, 101, 101, 100)
        ]
    });

    assert.equal(logger.pendingCount(), 1);
});


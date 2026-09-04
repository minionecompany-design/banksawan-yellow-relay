"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    mergeCandles,
    aggregateOneMinuteCandles,
    klineRequestWeight,
    hasRecentOneMinuteGap,
    hasOneMinuteBridgeGap,
    updateCacheFromOneMinute,
    snapshotFromCache
} = require("../scanner");

function minuteCandle(index, overrides = {}) {
    const openTime = index * 60_000;
    const open = 100 + index;

    return {
        openTime,
        open,
        high: open + 2,
        low: open - 1,
        close: open + 1,
        volume: 10 + index,
        closeTime: openTime + 59_999,
        quoteVolume: 100 + index,
        trades: 2 + index,
        takerBuyBase: 4 + index,
        takerBuyQuote: 40 + index,
        ...overrides
    };
}

function emptyState() {
    return {
        candleCache: {
            "1m": [],
            "5m": [],
            "15m": [],
            "1h": []
        }
    };
}

test("uses low request weight for cached bootstrap and live windows", () => {
    assert.equal(klineRequestWeight(70), 1);
    assert.equal(klineRequestWeight(499), 2);
    assert.equal(klineRequestWeight(1000), 5);
});

test("aggregates complete 1M candles into exact closed 5M OHLCV", () => {
    const candles = Array.from({ length: 5 }, (_, index) =>
        minuteCandle(index)
    );

    const [bar] = aggregateOneMinuteCandles(candles, "5m");

    assert.deepEqual(bar, {
        openTime: 0,
        open: 100,
        high: 106,
        low: 99,
        close: 105,
        volume: 60,
        closeTime: 299_999,
        quoteVolume: 510,
        trades: 20,
        takerBuyBase: 30,
        takerBuyQuote: 210
    });
});

test("never fabricates a higher-timeframe candle from an incomplete minute bucket", () => {
    const incomplete = [
        minuteCandle(0),
        minuteCandle(1),
        minuteCandle(3),
        minuteCandle(4)
    ];

    assert.deepEqual(
        aggregateOneMinuteCandles(incomplete, "5m"),
        []
    );
    assert.equal(hasRecentOneMinuteGap(incomplete), true);
});

test("merge replaces duplicate open times and keeps chronological cache", () => {
    const existing = [minuteCandle(0), minuteCandle(1)];
    const replacement = minuteCandle(1, { close: 999 });
    const merged = mergeCandles(
        existing,
        [replacement, minuteCandle(2)],
        2
    );

    assert.deepEqual(merged.map(candle => candle.openTime), [60_000, 120_000]);
    assert.equal(merged[0].close, 999);
});

test("detects an outage longer than the live lookback window", () => {
    const cached = [minuteCandle(0), minuteCandle(1)];
    const overlapping = [minuteCandle(1), minuteCandle(2)];
    const detached = [minuteCandle(80), minuteCandle(81)];

    assert.equal(hasOneMinuteBridgeGap(cached, overlapping), false);
    assert.equal(hasOneMinuteBridgeGap(cached, detached), true);
});

test("live cache derives 5M, 15M, and 1H candles from one lightweight 1M feed", () => {
    const state = emptyState();
    const minuteBars = Array.from({ length: 60 }, (_, index) =>
        minuteCandle(index)
    );

    updateCacheFromOneMinute(state, minuteBars);

    assert.equal(state.candleCache["1m"].length, 60);
    assert.equal(state.candleCache["5m"].length, 12);
    assert.equal(state.candleCache["15m"].length, 4);
    assert.equal(state.candleCache["1h"].length, 1);
    assert.equal(hasRecentOneMinuteGap(state.candleCache["1m"]), false);

    const snapshot = snapshotFromCache(
        { symbol: "TESTUSDT", price: 1, change24h: 2 },
        state
    );

    assert.equal(snapshot.symbol, "TESTUSDT");
    assert.equal(snapshot.tf["1h"].length, 1);
});


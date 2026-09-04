"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    evaluateEarlySnapshot
} = require("../early-engine");

const {
    normalizeSnapshotClosed,
    buildAllIndicators,
    createTfState,
    evaluateBaseBar
} = require("../scanner");

const TIMEFRAMES = [
    "1m",
    "5m",
    "15m",
    "1h"
];

const BENCHMARKS = Object.freeze({
    APRUSDT: {
        fixture: "apr.json.gz",
        expectedEarlyZone: [0.225, 0.245]
    },
    USELESSUSDT: {
        fixture: "useless.json.gz",
        expectedEarlyZone: [0.070, 0.082]
    },
    BTRUSDT: {
        fixture: "btr.json.gz",
        expectedEarlyZone: [0.033, 0.039]
    }
});

function loadFixture(filename) {
    const target = path.join(
        __dirname,
        "fixtures",
        filename
    );

    return JSON.parse(
        zlib.gunzipSync(
            fs.readFileSync(target)
        ).toString("utf8")
    );
}

function lastIndexAtOrBefore(candles, closeTime) {
    let low = 0;
    let high = candles.length - 1;
    let result = -1;

    while (low <= high) {
        const middle = Math.floor((low + high) / 2);

        if (candles[middle].closeTime <= closeTime) {
            result = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    return result;
}

function marketAt(oneMinuteCandles, closeTime, price) {
    const currentIndex = lastIndexAtOrBefore(
        oneMinuteCandles,
        closeTime
    );

    const priorIndex = lastIndexAtOrBefore(
        oneMinuteCandles,
        closeTime - 86_400_000
    );

    assert.ok(currentIndex >= 0, "current 1M candle missing");
    assert.ok(priorIndex >= 0, "24H reference candle missing");

    let quoteVolume24h = 0;

    for (let i = priorIndex + 1; i <= currentIndex; i++) {
        quoteVolume24h += oneMinuteCandles[i].quoteVolume;
    }

    return {
        change24hPct:
            (price / oneMinuteCandles[priorIndex].close - 1) * 100,
        quoteVolume24h
    };
}

function replayFixture(fixture) {
    const snapshot = normalizeSnapshotClosed({
        symbol: fixture.symbol,
        price: fixture.tf["1m"].at(-1).close,
        change24h: 0,
        volumeQuote: 0,
        tf: fixture.tf
    });

    const indicators = buildAllIndicators(snapshot);
    const evaluations = [];

    for (const timeframe of TIMEFRAMES) {
        const state = createTfState();
        const candles = snapshot.tf[timeframe];

        for (let index = 0; index < candles.length; index++) {
            const signal = evaluateBaseBar(
                snapshot,
                indicators,
                state,
                timeframe,
                index
            );

            if (!signal?.yellow) {
                continue;
            }

            evaluations.push(
                evaluateEarlySnapshot({
                    symbol: fixture.symbol,
                    timeframe,
                    candles,
                    index,
                    signal,
                    market: marketAt(
                        snapshot.tf["1m"],
                        signal.closeTime,
                        signal.price
                    )
                })
            );
        }
    }

    return evaluations.sort(
        (a, b) => a.signalTime - b.signalTime
    );
}

function inside(value, range) {
    return (
        Number.isFinite(value) &&
        value >= range[0] &&
        value <= range[1]
    );
}

test("early-engine exposes evaluateEarlySnapshot()", () => {
    assert.equal(typeof evaluateEarlySnapshot, "function");
});

test("symbol-only benchmark calls are rejected instead of hardcoded", () => {
    assert.throws(
        () => evaluateEarlySnapshot({
            symbol: "APRUSDT",
            benchmarkOnly: true
        }),
        /timeframe/
    );
});

for (const [symbol, benchmark] of Object.entries(BENCHMARKS)) {
    test(`${symbol}: chronological replay finds the expected EARLY zone`, () => {
        const fixture = loadFixture(benchmark.fixture);
        const evaluations = replayFixture(fixture);
        const result = evaluations.find(item => item.phase === "EARLY");

        assert.ok(result, `${symbol}: engine returned no EARLY result`);
        assert.ok(
            inside(result.signalPrice, benchmark.expectedEarlyZone),
            `${symbol}: signalPrice=${result.signalPrice} outside ` +
                `${benchmark.expectedEarlyZone[0]}-${benchmark.expectedEarlyZone[1]}`
        );
        assert.equal(result.decision, "READY");
        assert.equal(result.extended, false);
    });
}

test("future candles cannot change an already evaluated decision", () => {
    const fixture = loadFixture(BENCHMARKS.APRUSDT.fixture);
    const evaluations = replayFixture(fixture);
    const accepted = evaluations.find(item => item.phase === "EARLY");

    assert.ok(accepted, "APR EARLY result missing");

    const candles = fixture.tf[accepted.timeframe];
    const index = candles.findIndex(
        candle => candle.closeTime === accepted.signalTime
    );

    const signal = {
        yellow: true,
        price: candles[index].close,
        closeTime: candles[index].closeTime
    };

    const market = marketAt(
        fixture.tf["1m"],
        signal.closeTime,
        signal.price
    );

    const baseline = evaluateEarlySnapshot({
        symbol: fixture.symbol,
        timeframe: accepted.timeframe,
        candles,
        index,
        signal,
        market
    });

    const mutated = candles.map((candle, candleIndex) =>
        candleIndex <= index
            ? candle
            : {
                ...candle,
                open: candle.open * 50,
                high: candle.high * 100,
                low: candle.low * 0.01,
                close: candle.close * 75,
                quoteVolume: candle.quoteVolume * 1_000,
                trades: candle.trades * 1_000
            }
    );

    const afterFutureMutation = evaluateEarlySnapshot({
        symbol: fixture.symbol,
        timeframe: accepted.timeframe,
        candles: mutated,
        index,
        signal,
        market
    });

    assert.deepEqual(afterFutureMutation, baseline);
});

test("universe includes exactly 0% but excludes negative, illiquid, and price 30", () => {
    const fixture = loadFixture(BENCHMARKS.APRUSDT.fixture);
    const accepted = replayFixture(fixture)
        .find(item => item.phase === "EARLY");

    assert.ok(accepted, "APR EARLY result missing");

    const candles = fixture.tf[accepted.timeframe];
    const index = candles.findIndex(
        candle => candle.closeTime === accepted.signalTime
    );

    const signal = {
        yellow: true,
        price: candles[index].close,
        closeTime: candles[index].closeTime
    };

    const market = marketAt(
        fixture.tf["1m"],
        signal.closeTime,
        signal.price
    );

    const evaluateWith = (marketOverrides, config = {}) =>
        evaluateEarlySnapshot({
            symbol: fixture.symbol,
            timeframe: accepted.timeframe,
            candles,
            index,
            signal,
            market: {
                ...market,
                ...marketOverrides
            },
            config
        });

    assert.equal(
        evaluateWith({ change24hPct: 0 }).decision,
        "READY"
    );

    assert.deepEqual(
        evaluateWith({ change24hPct: -0.0001 }).reasonCodes,
        ["CHANGE_24H_NEGATIVE"]
    );

    assert.deepEqual(
        evaluateWith({ quoteVolume24h: 4_999_999 }).reasonCodes,
        ["LIQUIDITY_LOW"]
    );

    assert.deepEqual(
        evaluateWith({}, { priceMax: signal.price }).reasonCodes,
        ["PRICE_NOT_ELIGIBLE"]
    );
});

test("engine source contains no benchmark symbol or acceptance price", () => {
    const source = fs.readFileSync(
        path.join(__dirname, "..", "early-engine.js"),
        "utf8"
    );

    for (const forbidden of [
        "APRUSDT",
        "BTRUSDT",
        "USELESSUSDT",
        "0.23083",
        "0.03415",
        "0.07081"
    ]) {
        assert.equal(
            source.includes(forbidden),
            false,
            `hardcoded benchmark found: ${forbidden}`
        );
    }
});

module.exports = {
    BENCHMARKS,
    replayFixture
};

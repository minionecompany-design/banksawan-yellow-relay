"use strict";

// BANKSAWAN YELLOW — EARLY ENGINE V2
//
// This module evaluates an already-confirmed raw Yellow LONG A event. It does
// not recreate or modify the LONG A formula. Every feature is calculated from
// the signal candle and candles that closed before it; future candles are never
// read.

const DEFAULT_CONFIG = Object.freeze({
    priceMax: 30,
    minChange24hPct: 0,
    minQuoteVolume24h: 5_000_000,
    maxSpreadBps: 25,
    featureLookback: 20,
    breakoutLookback: 12,
    atrLength: 14,
    maLength: 7,
    baseMaxExtensionAtr: 0.75,
    breakoutMaxExtensionAtr: 2,
    minQuoteRatio: 1.5,
    minTradeRatio: 1.25,
    minTakerShare: 0.52,
    minBaseCloseLocation: 0.65,
    minBreakoutCloseLocation: 0.55
});

const SUPPORTED_TIMEFRAMES = new Set([
    "1m",
    "5m",
    "15m",
    "1h"
]);

function finite(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function positive(value) {
    return finite(value) && value > 0;
}

function median(values) {
    const valid = values
        .filter(finite)
        .sort((a, b) => a - b);

    if (!valid.length) {
        return null;
    }

    const middle = Math.floor(valid.length / 2);

    return valid.length % 2
        ? valid[middle]
        : (valid[middle - 1] + valid[middle]) / 2;
}

function meanAt(candles, index, length, field) {
    if (index < length - 1) {
        return null;
    }

    let total = 0;

    for (let i = index - length + 1; i <= index; i++) {
        const value = candles[i]?.[field];

        if (!finite(value)) {
            return null;
        }

        total += value;
    }

    return total / length;
}

function atrAt(candles, index, length) {
    if (index < length) {
        return null;
    }

    let total = 0;

    for (let i = index - length + 1; i <= index; i++) {
        const candle = candles[i];
        const previous = candles[i - 1];

        if (
            !candle ||
            !previous ||
            !positive(candle.high) ||
            !positive(candle.low) ||
            !positive(previous.close)
        ) {
            return null;
        }

        total += Math.max(
            candle.high - candle.low,
            Math.abs(candle.high - previous.close),
            Math.abs(candle.low - previous.close)
        );
    }

    return total / length;
}

function safeRatio(value, baseline) {
    return finite(value) && positive(baseline)
        ? value / baseline
        : null;
}

function createEarlyConfig(overrides = {}) {
    return Object.freeze({
        ...DEFAULT_CONFIG,
        ...overrides
    });
}

function rejectedResult({
    symbol,
    timeframe,
    signalPrice = null,
    signalTime = null,
    reason,
    features = null
}) {
    return {
        symbol: symbol || null,
        timeframe: timeframe || null,
        decision: "REJECTED",
        phase: "REJECTED",
        path: null,
        signalPrice,
        signalTime,
        extended: false,
        reasonCodes: [reason],
        features
    };
}

function evaluateEarlySnapshot(input = {}) {
    const {
        symbol,
        timeframe,
        candles,
        signal,
        market = {},
        config: configOverrides = {}
    } = input;

    if (!SUPPORTED_TIMEFRAMES.has(timeframe)) {
        throw new TypeError("timeframe must be 1m, 5m, 15m, or 1h");
    }

    if (!Array.isArray(candles) || !candles.length) {
        throw new TypeError("candles must contain chronological closed candles");
    }

    const config = createEarlyConfig(configOverrides);
    const requestedIndex = input.index ?? candles.length - 1;

    if (
        !Number.isInteger(requestedIndex) ||
        requestedIndex < 0 ||
        requestedIndex >= candles.length
    ) {
        throw new RangeError("index is outside candles");
    }

    const candle = candles[requestedIndex];
    const signalPrice = finite(candle?.close) ? candle.close : null;
    const signalTime = finite(candle?.closeTime) ? candle.closeTime : null;

    if (
        signal?.yellow !== true ||
        signal?.closeTime !== signalTime
    ) {
        return rejectedResult({
            symbol,
            timeframe,
            signalPrice,
            signalTime,
            reason: "RAW_YELLOW_REQUIRED"
        });
    }

    if (!positive(signalPrice) || signalPrice >= config.priceMax) {
        return rejectedResult({
            symbol,
            timeframe,
            signalPrice,
            signalTime,
            reason: "PRICE_NOT_ELIGIBLE"
        });
    }

    if (!finite(market.change24hPct)) {
        return rejectedResult({
            symbol,
            timeframe,
            signalPrice,
            signalTime,
            reason: "CHANGE_24H_MISSING"
        });
    }

    if (market.change24hPct < config.minChange24hPct) {
        return rejectedResult({
            symbol,
            timeframe,
            signalPrice,
            signalTime,
            reason: "CHANGE_24H_NEGATIVE"
        });
    }

    if (!finite(market.quoteVolume24h)) {
        return rejectedResult({
            symbol,
            timeframe,
            signalPrice,
            signalTime,
            reason: "LIQUIDITY_MISSING"
        });
    }

    if (market.quoteVolume24h < config.minQuoteVolume24h) {
        return rejectedResult({
            symbol,
            timeframe,
            signalPrice,
            signalTime,
            reason: "LIQUIDITY_LOW"
        });
    }

    if (
        finite(market.spreadBps) &&
        market.spreadBps > config.maxSpreadBps
    ) {
        return rejectedResult({
            symbol,
            timeframe,
            signalPrice,
            signalTime,
            reason: "SPREAD_WIDE"
        });
    }

    const minimumIndex = Math.max(
        config.featureLookback,
        config.breakoutLookback,
        config.atrLength,
        config.maLength - 1
    );

    if (requestedIndex < minimumIndex) {
        return rejectedResult({
            symbol,
            timeframe,
            signalPrice,
            signalTime,
            reason: "HISTORY_INSUFFICIENT"
        });
    }

    const priorFeatureCandles = candles.slice(
        requestedIndex - config.featureLookback,
        requestedIndex
    );

    const priorBreakoutCandles = candles.slice(
        requestedIndex - config.breakoutLookback,
        requestedIndex
    );

    const quoteMedian = median(
        priorFeatureCandles.map(item => item.quoteVolume)
    );

    const tradeMedian = median(
        priorFeatureCandles.map(item => item.trades)
    );

    const quoteRatio = safeRatio(candle.quoteVolume, quoteMedian);
    const tradeRatio = safeRatio(candle.trades, tradeMedian);
    const takerShare = safeRatio(
        candle.takerBuyQuote,
        candle.quoteVolume
    );

    const range = candle.high - candle.low;
    const closeLocation = positive(range)
        ? (candle.close - candle.low) / range
        : 0.5;

    const ma = meanAt(
        candles,
        requestedIndex,
        config.maLength,
        "close"
    );

    const atr = atrAt(
        candles,
        requestedIndex,
        config.atrLength
    );

    const extensionAtr = positive(atr) && positive(ma)
        ? Math.max(0, (candle.close - ma) / atr)
        : null;

    const priorHigh = Math.max(
        ...priorBreakoutCandles.map(item => item.high)
    );

    const breakout =
        finite(priorHigh) &&
        candle.close > priorHigh;

    const greenClose = candle.close > candle.open;
    const quoteExpansion =
        finite(quoteRatio) &&
        quoteRatio >= config.minQuoteRatio;

    const tradeExpansion =
        finite(tradeRatio) &&
        tradeRatio >= config.minTradeRatio;

    const takerSupport =
        finite(takerShare) &&
        takerShare >= config.minTakerShare;

    const baseCloseStrong =
        finite(closeLocation) &&
        closeLocation >= config.minBaseCloseLocation;

    const breakoutCloseStrong =
        finite(closeLocation) &&
        closeLocation >= config.minBreakoutCloseLocation;

    const baseConfirmation =
        greenClose &&
        finite(extensionAtr) &&
        extensionAtr <= config.baseMaxExtensionAtr &&
        quoteExpansion &&
        tradeExpansion &&
        baseCloseStrong;

    const breakoutConfirmation =
        greenClose &&
        breakout &&
        finite(extensionAtr) &&
        extensionAtr <= config.breakoutMaxExtensionAtr &&
        quoteExpansion &&
        tradeExpansion &&
        takerSupport &&
        breakoutCloseStrong;

    const extended =
        finite(extensionAtr) &&
        extensionAtr > config.breakoutMaxExtensionAtr;

    const path = baseConfirmation
        ? "EARLY_BASE"
        : breakoutConfirmation
            ? "BREAKOUT_CONFIRMATION"
            : null;

    const phase = path
        ? "EARLY"
        : extended
            ? "EXTENDED"
            : "WATCH";

    const reasonCodes = [];

    if (path) reasonCodes.push(path);
    if (breakout) reasonCodes.push("BREAKOUT");
    if (quoteExpansion) reasonCodes.push("QUOTE_EXPANSION");
    if (tradeExpansion) reasonCodes.push("TRADE_EXPANSION");
    if (takerSupport) reasonCodes.push("TAKER_SUPPORT");
    if (baseCloseStrong) reasonCodes.push("CLOSE_STRONG");
    if (extended) reasonCodes.push("EXTENDED");

    if (!path && !extended) {
        reasonCodes.push("CONFIRMATION_PENDING");
    }

    return {
        symbol: symbol || null,
        timeframe,
        decision: path ? "READY" : "WATCH",
        phase,
        path,
        signalPrice,
        signalTime,
        extended,
        reasonCodes,
        features: {
            change24hPct: market.change24hPct,
            quoteVolume24h: market.quoteVolume24h,
            spreadBps: finite(market.spreadBps)
                ? market.spreadBps
                : null,
            quoteRatio,
            tradeRatio,
            takerShare,
            closeLocation,
            extensionAtr,
            priorHigh,
            breakout,
            greenClose
        }
    };
}

module.exports = {
    DEFAULT_CONFIG,
    createEarlyConfig,
    evaluateEarlySnapshot
};

const BASE = "https://fapi.binance.com";

const {
    createQualityConfig,
    evaluateQuality
} = require("./quality-engine");

const {
    createOutcomeLogger
} = require("./outcome-logger");

const {
    createEarlyConfig,
    evaluateEarlySnapshot
} = require("./early-engine");

// ==================================================
// BANKSAWAN YELLOW SCANNER v1.5 — CACHED 1M LIVE DATA
//
// Rules locked:
// - Binance USDⓈ-M PERPETUAL
// - price < 30 USDT
// - Universe scanner >= 0% 24H
// - 1M signal requires 24H change >= +1%
// - 5M / 15M / 1H signals require 24H change >= 0%
// - LONG A signal on 1M / 5M / 15M / 1H
// - closed-candle only
// - catch every missed closed candle
// - independent Pine-like state per symbol + TF
// - state counters use elapsed bars, NOT local array indexes
// - no historical notification during bootstrap
// - dedup by symbol + TF + candle close time
// - diagnostics + non-gating health score
// ==================================================

const PRICE_MAX = 30;

// ==================================================
// TF ELIGIBILITY
//
// 1M tetap >= +1% untuk menekan noise.
// 5M / 15M / 1H mulai dipantau sejak >= 0%.
// ==================================================

const TF_CHANGE_MIN = {
    "1m": 1,
    "5m": 0,
    "15m": 0,
    "1h": 0
};

// Universe mengambil threshold terendah.
// Coin 0%–1% tetap tersedia untuk 5M/15M/1H.
const UNIVERSE_CHANGE_MIN = 0;

const SCAN_MS = 60_000;
const LIVE_1M_LIMIT = 70;
const BOOTSTRAP_LIMIT = 499;
const CANDLE_CACHE_LIMIT = 300;
const BOOTSTRAP_CATCHUP_MS = 5 * 60 * 1000;

const WORKER_CONCURRENCY = 4;
const REQUEST_PAUSE_MS = 60;
const MAX_RETRIES = 4;

// Stay below Binance's rolling request-weight ceiling even during a full
// cold bootstrap.  Live scans use one lightweight 1M request per symbol.
const REQUEST_WEIGHT_BUDGET = 1800;
const REQUEST_WEIGHT_WINDOW_MS = 60_000;
const requestWeightHistory = [];

const QUALITY_CONFIG = createQualityConfig();
const OUTCOME_LOGGER = createOutcomeLogger();
const EARLY_CONFIG = createEarlyConfig();

// Early Engine cannot gate delivery in this wave. Any value except "off"
// resolves to shadow, including an accidental "enforce" value.
function resolveEarlyEngineMode(value) {
    return String(value || "shadow")
        .trim()
        .toLowerCase() === "off"
        ? "off"
        : "shadow";
}

const EARLY_ENGINE_MODE = resolveEarlyEngineMode(
    process.env.EARLY_ENGINE_MODE
);

const PORT = process.env.PORT || 10000;

const RELAY_URL =
    process.env.YELLOW_RELAY_URL ||
    `http://127.0.0.1:${PORT}/yellow`;

const DATA_TIMEFRAMES = [
    "1m",
    "5m",
    "15m",
    "1h"
];

const SIGNAL_TIMEFRAMES = [
    "1m",
    "5m",
    "15m",
    "1h"
];

const TF_LABEL = {
    "1m": "1M",
    "5m": "5M",
    "15m": "15M",
    "1h": "1H"
};

// ==================================================
// TF ELIGIBILITY HELPERS
// ==================================================

function minChangeForTf(tf) {
    return TF_CHANGE_MIN[tf] ?? 0;
}

function isTfEligible(coin, tf) {
    return (
        Number.isFinite(coin.change24h) &&
        coin.change24h >= minChangeForTf(tf)
    );
}

function shouldDeliverQuality(config, quality) {
    return config?.mode !== "enforce" ||
        quality?.decision === "READY";
}

function evaluateEarlySignal({
    snapshot,
    tf,
    candles,
    index,
    signal,
    mode = EARLY_ENGINE_MODE
}) {
    if (mode === "off") {
        return null;
    }

    return evaluateEarlySnapshot({
        symbol: snapshot.symbol,
        timeframe: tf,
        candles,
        index,
        signal,
        market: {
            change24hPct: snapshot.change24h,
            quoteVolume24h: snapshot.volumeQuote,
            spreadBps: Number.isFinite(snapshot.spreadBps)
                ? snapshot.spreadBps
                : null
        },
        config: EARLY_CONFIG
    });
}

// symbol -> SymbolState
const symbolStates = new Map();

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// ==================================================
// HTTP
// ==================================================

function pruneRequestWeightHistory(now = Date.now()) {
    while (
        requestWeightHistory.length &&
        now - requestWeightHistory[0].at >= REQUEST_WEIGHT_WINDOW_MS
    ) {
        requestWeightHistory.shift();
    }
}

function usedRequestWeight(now = Date.now()) {
    pruneRequestWeightHistory(now);
    return requestWeightHistory.reduce(
        (sum, item) => sum + item.weight,
        0
    );
}

async function reserveRequestWeight(weight = 1) {
    const safeWeight = Math.max(1, Number(weight) || 1);

    while (true) {
        const now = Date.now();
        const used = usedRequestWeight(now);

        if (used + safeWeight <= REQUEST_WEIGHT_BUDGET) {
            requestWeightHistory.push({
                at: now,
                weight: safeWeight
            });
            return;
        }

        const oldest = requestWeightHistory[0];
        const waitMs = Math.max(
            50,
            REQUEST_WEIGHT_WINDOW_MS - (now - oldest.at) + 50
        );

        console.log(
            `[WEIGHT LIMIT] used=${used}/${REQUEST_WEIGHT_BUDGET} ` +
            `waitMs=${waitMs}`
        );

        await sleep(waitMs);
    }
}

function klineRequestWeight(limit) {
    if (limit < 100) return 1;
    if (limit < 500) return 2;
    if (limit <= 1000) return 5;
    return 10;
}

async function getJson(url, requestWeight = 1) {
    let lastError = null;

    for (
        let attempt = 1;
        attempt <= MAX_RETRIES;
        attempt++
    ) {
        try {
            await reserveRequestWeight(requestWeight);

            const r = await fetch(url, {
                headers: {
                    "User-Agent":
                        "banksawan-yellow-scanner/1.5-cached-live"
                }
            });

            if (r.ok) {
                return await r.json();
            }

            const body =
                await r
                    .text()
                    .catch(() => "");

            const error =
                new Error(
                    `${r.status} ${r.statusText} ${body}`.trim()
                );

            lastError = error;

            if (
                r.status === 429 ||
                r.status === 418
            ) {
                const retryAfterSeconds =
                    Number(
                        r.headers.get(
                            "retry-after"
                        )
                    ) ||
                    attempt * 3;

                console.warn(
                    `[RATE LIMIT] ${r.status} ` +
                    `wait=${retryAfterSeconds}s ` +
                    `attempt=${attempt}/${MAX_RETRIES}`
                );

                await sleep(
                    retryAfterSeconds *
                    1000
                );

                continue;
            }

            if (
                r.status >= 500 &&
                attempt < MAX_RETRIES
            ) {
                await sleep(
                    attempt * 1000
                );

                continue;
            }

            throw error;

        } catch (e) {
            lastError = e;

            if (
                attempt >=
                MAX_RETRIES
            ) {
                break;
            }

            console.warn(
                `[HTTP RETRY] ` +
                `attempt=${attempt}/${MAX_RETRIES} ` +
                `${e.message}`
            );

            await sleep(
                attempt * 1000
            );
        }
    }

    throw (
        lastError ||
        new Error(
            `Request failed: ${url}`
        )
    );
}

async function postJson(url, body) {
    let lastError = null;

    for (
        let attempt = 1;
        attempt <= MAX_RETRIES;
        attempt++
    ) {
        try {
            const r = await fetch(url, {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "User-Agent":
                        "banksawan-yellow-scanner/1.5-cached-live"
                },

                body:
                    JSON.stringify(body)
            });

            const text =
                await r.text();

            if (r.ok) {
                try {
                    return JSON.parse(
                        text
                    );

                } catch {
                    return {
                        raw: text
                    };
                }
            }

            const error =
                new Error(
                    `${r.status} ${r.statusText} ${text}`.trim()
                );

            lastError = error;

            if (
                (
                    r.status === 429 ||
                    r.status >= 500
                ) &&
                attempt < MAX_RETRIES
            ) {
                const retryAfterSeconds =
                    Number(
                        r.headers.get(
                            "retry-after"
                        )
                    ) ||
                    attempt * 2;

                await sleep(
                    retryAfterSeconds *
                    1000
                );

                continue;
            }

            throw error;

        } catch (e) {
            lastError = e;

            if (
                attempt >=
                MAX_RETRIES
            ) {
                break;
            }

            await sleep(
                attempt * 1000
            );
        }
    }

    throw (
        lastError ||
        new Error(
            `POST failed: ${url}`
        )
    );
}

// ==================================================
// UNIVERSE
// ==================================================

async function loadUniverse() {
    const [
        exchangeInfo,
        tickers
    ] = await Promise.all([
        getJson(
            `${BASE}/fapi/v1/exchangeInfo`,
            1
        ),

        getJson(
            `${BASE}/fapi/v1/ticker/24hr`,
            40
        )
    ]);

    const perpetual =
        new Set(
            exchangeInfo.symbols
                .filter(s =>
                    s.status ===
                        "TRADING" &&

                    s.contractType ===
                        "PERPETUAL" &&

                    s.quoteAsset ===
                        "USDT"
                )
                .map(s =>
                    s.symbol
                )
        );

    return tickers

        .filter(t =>
            perpetual.has(
                t.symbol
            )
        )

        .map(t => ({
            symbol:
                t.symbol,

            price:
                Number(
                    t.lastPrice
                ),

            change24h:
                Number(
                    t.priceChangePercent
                ),

            volumeQuote:
                Number(
                    t.quoteVolume
                )
        }))

        .filter(x =>
            Number.isFinite(
                x.price
            ) &&

            x.price > 0 &&

            x.price <
                PRICE_MAX &&

            Number.isFinite(
                x.change24h
            ) &&

            x.change24h >=
                UNIVERSE_CHANGE_MIN
        )

        .sort(
            (a, b) =>
                b.change24h -
                a.change24h
        );
}

// ==================================================
// MARKET DATA
// ==================================================

async function loadKlines(
    symbol,
    interval,
    limit
) {
    const q =
        new URLSearchParams({
            symbol,
            interval,
            limit:
                String(limit)
        });

    const rows =
        await getJson(
            `${BASE}/fapi/v1/klines?${q}`,
            klineRequestWeight(limit)
        );

    return rows.map(k => ({
        openTime:
            Number(k[0]),

        open:
            Number(k[1]),

        high:
            Number(k[2]),

        low:
            Number(k[3]),

        close:
            Number(k[4]),

        volume:
            Number(k[5]),

        closeTime:
            Number(k[6]),

        quoteVolume:
            Number(k[7]),

        trades:
            Number(k[8]),

        takerBuyBase:
            Number(k[9]),

        takerBuyQuote:
            Number(k[10])
    }));
}

async function inspectCoin(
    coin,
    limit
) {
    const tf = {};

    // Sequential inside one symbol
    // keeps Binance request bursts low.

    for (
        const interval of
        DATA_TIMEFRAMES
    ) {
        tf[interval] =
            await loadKlines(
                coin.symbol,
                interval,
                limit
            );
    }

    return {
        ...coin,
        tf
    };
}

function mergeCandles(
    existing,
    incoming,
    limit = CANDLE_CACHE_LIMIT
) {
    const byOpenTime = new Map();

    for (const candle of [
        ...(Array.isArray(existing) ? existing : []),
        ...(Array.isArray(incoming) ? incoming : [])
    ]) {
        if (Number.isFinite(candle?.openTime)) {
            byOpenTime.set(candle.openTime, candle);
        }
    }

    return [...byOpenTime.values()]
        .sort((a, b) => a.openTime - b.openTime)
        .slice(-limit);
}

function aggregateOneMinuteCandles(
    oneMinuteCandles,
    interval
) {
    const intervalMs = {
        "5m": 5 * 60_000,
        "15m": 15 * 60_000,
        "1h": 60 * 60_000
    }[interval];

    if (!intervalMs) {
        throw new Error(`Unsupported aggregate interval: ${interval}`);
    }

    const expectedCount = intervalMs / 60_000;
    const groups = new Map();

    for (const candle of oneMinuteCandles || []) {
        if (!Number.isFinite(candle?.openTime)) continue;

        const bucketOpen = Math.floor(candle.openTime / intervalMs) * intervalMs;
        const group = groups.get(bucketOpen) || [];
        group.push(candle);
        groups.set(bucketOpen, group);
    }

    const aggregated = [];

    for (const [bucketOpen, rawGroup] of groups) {
        const group = rawGroup.sort((a, b) => a.openTime - b.openTime);
        if (group.length !== expectedCount) continue;

        const contiguous = group.every(
            (candle, index) =>
                candle.openTime === bucketOpen + index * 60_000
        );

        if (!contiguous) continue;

        const first = group[0];
        const last = group.at(-1);

        aggregated.push({
            openTime: bucketOpen,
            open: first.open,
            high: Math.max(...group.map(candle => candle.high)),
            low: Math.min(...group.map(candle => candle.low)),
            close: last.close,
            volume: group.reduce((sum, candle) => sum + candle.volume, 0),
            closeTime: bucketOpen + intervalMs - 1,
            quoteVolume: group.reduce(
                (sum, candle) => sum + candle.quoteVolume,
                0
            ),
            trades: group.reduce((sum, candle) => sum + candle.trades, 0),
            takerBuyBase: group.reduce(
                (sum, candle) => sum + candle.takerBuyBase,
                0
            ),
            takerBuyQuote: group.reduce(
                (sum, candle) => sum + candle.takerBuyQuote,
                0
            )
        });
    }

    return aggregated.sort((a, b) => a.openTime - b.openTime);
}

function hasRecentOneMinuteGap(candles) {
    if (!Array.isArray(candles) || candles.length < 2) return true;

    for (let i = 1; i < candles.length; i++) {
        if (candles[i].openTime - candles[i - 1].openTime !== 60_000) {
            return true;
        }
    }

    return false;
}

function hasOneMinuteBridgeGap(
    cachedCandles,
    recentCandles
) {
    const cachedLast = cachedCandles?.at?.(-1);
    const recentFirst = recentCandles?.[0];

    if (!cachedLast || !recentFirst) return false;

    return recentFirst.openTime > cachedLast.openTime + 60_000;
}

function saveSnapshotToCache(symbolState, snapshot) {
    for (const tf of DATA_TIMEFRAMES) {
        symbolState.candleCache[tf] = mergeCandles(
            [],
            snapshot.tf[tf],
            CANDLE_CACHE_LIMIT
        );
    }
}

function updateCacheFromOneMinute(
    symbolState,
    oneMinuteCandles
) {
    symbolState.candleCache["1m"] = mergeCandles(
        symbolState.candleCache["1m"],
        oneMinuteCandles,
        CANDLE_CACHE_LIMIT
    );

    for (const tf of ["5m", "15m", "1h"]) {
        const aggregated = aggregateOneMinuteCandles(
            symbolState.candleCache["1m"],
            tf
        );

        symbolState.candleCache[tf] = mergeCandles(
            symbolState.candleCache[tf],
            aggregated,
            CANDLE_CACHE_LIMIT
        );
    }
}

function snapshotFromCache(coin, symbolState) {
    const tf = {};

    for (const interval of DATA_TIMEFRAMES) {
        tf[interval] = symbolState.candleCache[interval].slice();
    }

    return {
        ...coin,
        tf
    };
}

function closedCandles(
    candles,
    now = Date.now()
) {
    return candles.filter(
        c =>
            c.closeTime <
            now
    );
}

function normalizeSnapshotClosed(
    snapshot
) {
    const now =
        Date.now();

    for (
        const tf of
        DATA_TIMEFRAMES
    ) {
        snapshot.tf[tf] =
            closedCandles(
                snapshot.tf[tf],
                now
            );
    }

    return snapshot;
}

// ==================================================
// INDICATORS
// Pine-compatible SMA + Wilder RSI
// ==================================================

function sma(
    values,
    length
) {
    const out =
        new Array(
            values.length
        ).fill(null);

    let sum = 0;
    let invalidCount = 0;

    for (
        let i = 0;
        i < values.length;
        i++
    ) {
        const add =
            values[i];

        if (
            Number.isFinite(add)
        ) {
            sum += add;

        } else {
            invalidCount++;
        }

        if (
            i >= length
        ) {
            const remove =
                values[
                    i - length
                ];

            if (
                Number.isFinite(
                    remove
                )
            ) {
                sum -= remove;

            } else {
                invalidCount--;
            }
        }

        if (
            i >=
                length - 1 &&

            invalidCount === 0
        ) {
            out[i] =
                sum / length;
        }
    }

    return out;
}

function rsiFromAverages(
    avgGain,
    avgLoss
) {
    if (
        avgGain === 0 &&
        avgLoss === 0
    ) {
        return 50;
    }

    if (
        avgLoss === 0
    ) {
        return 100;
    }

    if (
        avgGain === 0
    ) {
        return 0;
    }

    return (
        100 -
        100 /
        (
            1 +
            avgGain /
            avgLoss
        )
    );
}

function rsi(
    values,
    length = 14
) {
    const out =
        new Array(
            values.length
        ).fill(null);

    if (
        values.length <=
        length
    ) {
        return out;
    }

    let gainSum = 0;
    let lossSum = 0;

    for (
        let i = 1;
        i <= length;
        i++
    ) {
        const change =
            values[i] -
            values[i - 1];

        gainSum +=
            Math.max(
                change,
                0
            );

        lossSum +=
            Math.max(
                -change,
                0
            );
    }

    let avgGain =
        gainSum /
        length;

    let avgLoss =
        lossSum /
        length;

    out[length] =
        rsiFromAverages(
            avgGain,
            avgLoss
        );

    for (
        let i =
            length + 1;
        i < values.length;
        i++
    ) {
        const change =
            values[i] -
            values[i - 1];

        const gain =
            Math.max(
                change,
                0
            );

        const loss =
            Math.max(
                -change,
                0
            );

        avgGain =
            (
                avgGain *
                (length - 1) +
                gain
            ) /
            length;

        avgLoss =
            (
                avgLoss *
                (length - 1) +
                loss
            ) /
            length;

        out[i] =
            rsiFromAverages(
                avgGain,
                avgLoss
            );
    }

    return out;
}

function buildIndicators(
    candles
) {
    const closes =
        candles.map(
            c =>
                c.close
        );

    const volumes =
        candles.map(
            c =>
                c.volume
        );

    const rsi14 =
        rsi(
            closes,
            14
        );

    return {
        ma7:
            sma(
                closes,
                7
            ),

        ma25:
            sma(
                closes,
                25
            ),

        ma99:
            sma(
                closes,
                99
            ),

        rsi14,

        rsiAvg:
            sma(
                rsi14,
                14
            ),

        volumeAvg:
            sma(
                volumes,
                20
            )
    };
}

function buildAllIndicators(
    snapshot
) {
    const out = {};

    for (
        const tf of
        DATA_TIMEFRAMES
    ) {
        out[tf] =
            buildIndicators(
                snapshot.tf[tf]
            );
    }

    return out;
}

function validNumber(
    ...values
) {
    return values.every(
        v =>
            typeof v ===
                "number" &&
            Number.isFinite(v)
    );
}

// Pine semantics used by
// deterministic companion script.
//
// Equal/Higher TF:
// request.security(..., close[1], lookahead_on)
//
// Lower TF:
// request.security(..., close[1], lookahead_off)
//
// Both resolve to most recent requested-TF
// candle whose closeTime is STRICTLY earlier
// than base candle closeTime.

function lastCompletedIndexBefore(
    candles,
    timestamp
) {
    let lo = 0;

    let hi =
        candles.length - 1;

    let result = -1;

    while (
        lo <= hi
    ) {
        const mid =
            Math.floor(
                (lo + hi) /
                2
            );

        if (
            candles[mid]
                .closeTime <
            timestamp
        ) {
            result = mid;
            lo = mid + 1;

        } else {
            hi = mid - 1;
        }
    }

    return result;
}

// ==================================================
// STATE
//
// IMPORTANT:
// Never save local array indexes across scans.
//
// Candle-cache windows change array origin
// whenever old bars are trimmed.
//
// Pullback/protect windows therefore use
// ELAPSED BARS.
// ==================================================

function createTfState() {
    return {
        lastProcessedCloseTime:
            0,

        tradeState:
            0,

        // 0 = waiting
        // 1 = LONG active
        // 2 = protected

        countDown:
            0,

        barsSincePullback:
            null,

        protectBarsElapsed:
            null,

        lastEventId:
            null
    };
}

function createSymbolState() {
    const tfStates =
        new Map();

    for (
        const tf of
        SIGNAL_TIMEFRAMES
    ) {
        tfStates.set(
            tf,
            createTfState()
        );
    }

    return {
        initialized:
            false,

        tfStates,

        candleCache:
            Object.fromEntries(
                DATA_TIMEFRAMES.map(
                    tf => [tf, []]
                )
            )
    };
}

// ==================================================
// QUALITY
//
// Diagnostic only.
// NEVER blocks valid YELLOW.
//
// YELLOW remains formula-parity
// with TradingView.
// ==================================================

function healthScore(
    diagnostics
) {
    let score = 70;

    if (
        diagnostics
            .volumeRatio >=
        1.0
    ) {
        score += 8;
    }

    if (
        diagnostics
            .volumeRatio >=
        1.5
    ) {
        score += 5;
    }

    if (
        diagnostics
            .distanceFromMA7 <=
        1.5
    ) {
        score += 7;
    }

    if (
        diagnostics
            .distanceFromMA7 <=
        0.8
    ) {
        score += 4;
    }

    if (
        diagnostics
            .rsiValue <=
        68
    ) {
        score += 6;
    }

    return Math.max(
        0,
        Math.min(
            100,
            score
        )
    );
}

function healthLabel(
    score
) {
    if (
        score >= 92
    ) {
        return "STRONG";
    }

    if (
        score >= 84
    ) {
        return "HEALTHY";
    }

    return "VALID";
}

// ==================================================
// BANKSAWAN LONG v1.3 DETERMINISTIC
// GENERIC 4TF
//
// Formula intentionally unchanged.
// ==================================================

function evaluateBaseBar(
    snapshot,
    indicators,
    tfState,
    baseTf,
    i
) {
    const base =
        snapshot.tf[baseTf];

    const candle =
        base[i];

    if (!candle) {
        return null;
    }

    // Advance cross-scan windows
    // by one real processed bar.

    if (
        tfState
            .barsSincePullback !=
        null
    ) {
        tfState
            .barsSincePullback++;
    }

    if (
        tfState.tradeState ===
            2 &&

        tfState
            .protectBarsElapsed !=
            null
    ) {
        tfState
            .protectBarsElapsed++;
    }

    // Pine:
    // priceDown = close < close[4]

    const priceDown =
        i >= 4 &&

        candle.close <
        base[
            i - 4
        ].close;

    tfState.countDown =
        priceDown
            ? tfState.countDown + 1
            : 0;

    const pullbackCount =
        tfState.countDown ===
            9 ||

        tfState.countDown ===
            13 ||

        tfState.countDown ===
            14 ||

        tfState.countDown ===
            15 ||

        tfState.countDown ===
            16;

    if (
        pullbackCount
    ) {
        tfState
            .barsSincePullback =
            0;
    }

    const pullbackWindowActive =
        tfState
            .barsSincePullback !=
            null &&

        tfState
            .barsSincePullback <=
            30;

    const mBase =
        indicators[baseTf];

    const ma7 =
        mBase.ma7[i];

    const ma25 =
        mBase.ma25[i];

    const ma99 =
        mBase.ma99[i];

    const rsiValue =
        mBase.rsi14[i];

    const rsiAverage =
        mBase.rsiAvg[i];

    const avgVolume =
        mBase.volumeAvg[i];

    const five =
        snapshot.tf["5m"];

    const fifteen =
        snapshot.tf["15m"];

    const hour =
        snapshot.tf["1h"];

    const i5 =
        lastCompletedIndexBefore(
            five,
            candle.closeTime
        );

    const i15 =
        lastCompletedIndexBefore(
            fifteen,
            candle.closeTime
        );

    const i60 =
        lastCompletedIndexBefore(
            hour,
            candle.closeTime
        );

    if (
        i5 < 0 ||
        i15 < 0 ||
        i60 < 0
    ) {
        return null;
    }

    const m5 =
        indicators["5m"];

    const m15 =
        indicators["15m"];

    const m60 =
        indicators["1h"];

    const close5 =
        five[i5].close;

    const close15 =
        fifteen[i15].close;

    const close60 =
        hour[i60].close;

    const ma7Five =
        m5.ma7[i5];

    const ma25Five =
        m5.ma25[i5];

    const ma99Five =
        m5.ma99[i5];

    const rsiFive =
        m5.rsi14[i5];

    const rsiAverageFive =
        m5.rsiAvg[i5];

    const ma7Fifteen =
        m15.ma7[i15];

    const ma25Fifteen =
        m15.ma25[i15];

    const ma99Fifteen =
        m15.ma99[i15];

    const rsiFifteen =
        m15.rsi14[i15];

    const ma7Sixty =
        m60.ma7[i60];

    const ma25Sixty =
        m60.ma25[i60];

    const ma99Sixty =
        m60.ma99[i60];

    const rsiSixty =
        m60.rsi14[i60];

    if (
        !validNumber(
            candle.close,

            ma7,
            ma25,
            ma99,

            rsiValue,
            rsiAverage,
            avgVolume,

            close5,
            ma7Five,
            ma25Five,
            ma99Five,
            rsiFive,
            rsiAverageFive,

            close15,
            ma7Fifteen,
            ma25Fifteen,
            ma99Fifteen,
            rsiFifteen,

            close60,
            ma7Sixty,
            ma25Sixty,
            ma99Sixty,
            rsiSixty
        )
    ) {
        return null;
    }

    if (
        avgVolume <= 0 ||
        ma7 <= 0
    ) {
        return null;
    }

    const volumeRatio =
        candle.volume /
        avgVolume;

    const distanceFromMA7 =
        Math.abs(
            candle.close -
            ma7
        ) /
        ma7 *
        100;

    // ==================================================
    // 1H PERMISSION
    // ==================================================

    const oneHourPermission =
        close60 >
            ma99Sixty &&

        ma7Sixty >=
            ma25Sixty &&

        rsiSixty >=
            48;

    // ==================================================
    // 15M SUPPORT
    // ==================================================

    const fifteenMinuteSupport =
        close15 >
            ma99Fifteen &&

        ma7Fifteen >=
            ma25Fifteen &&

        rsiFifteen >=
            48;

    // ==================================================
    // 5M MOMENTUM
    // ==================================================

    const fiveMinuteMomentum =
        close5 >
            ma7Five &&

        close5 >
            ma25Five &&

        ma7Five >=
            ma25Five &&

        rsiFive >
            50 &&

        rsiFive >=
            rsiAverageFive;

    // ==================================================
    // CURRENT TF TRIGGER
    //
    // Same formula for:
    // 1M / 5M / 15M / 1H
    // ==================================================

    const currentTfTrigger =
        candle.close >
            ma7 &&

        candle.close >
            ma25 &&

        candle.close >
            ma99 &&

        ma7 >
            ma25 &&

        rsiValue >
            50 &&

        rsiValue >
            rsiAverage &&

        rsiValue <
            75 &&

        volumeRatio >=
            0.75 &&

        distanceFromMA7 <=
            2.5 &&

        candle.close <
            PRICE_MAX;

    // ==================================================
    // LONG A
    // ==================================================

    const longASetup =
        pullbackWindowActive &&
        oneHourPermission &&
        fifteenMinuteSupport &&
        fiveMinuteMomentum &&
        currentTfTrigger;

    // ==================================================
    // PROTECT
    // ==================================================

    const currentTfWeak =
        candle.close <
            ma7 &&

        rsiValue <
            rsiAverage &&

        rsiValue <
            50;

    const fiveMinuteWeak =
        close5 <
            ma7Five &&

        rsiFive <
            rsiAverageFive;

    const protectCondition =
        currentTfWeak &&
        fiveMinuteWeak;

    // ==================================================
    // FINAL FAILURE
    // ==================================================

    const fifteenMinuteFailure =
        close15 <
            ma25Fifteen &&

        ma7Fifteen <
            ma25Fifteen &&

        rsiFifteen <
            45;

    const fiveMinuteMajorFailure =
        close5 <
            ma99Five &&

        ma7Five <
            ma25Five &&

        rsiFive <
            45;

    const hardFailure =
        candle.close <
            ma99 &&

        close5 <
            ma99Five &&

        rsiFive <
            45;

    const finalExitCondition =
        fifteenMinuteFailure ||
        fiveMinuteMajorFailure ||
        hardFailure;

    let yellow = false;

    // ==================================================
    // POSITION STATE
    //
    // Same order as Pine v1.3
    // ==================================================

    if (
        tfState.tradeState !==
            0 &&

        finalExitCondition
    ) {
        tfState.tradeState =
            0;

        tfState.protectBarsElapsed =
            null;

    } else if (
        tfState.tradeState ===
            0 &&

        longASetup
    ) {
        yellow = true;

        tfState.tradeState =
            1;

    } else if (
        tfState.tradeState ===
            1 &&

        protectCondition
    ) {
        tfState.tradeState =
            2;

        tfState.protectBarsElapsed =
            0;

    } else if (
        tfState.tradeState ===
        2
    ) {
        const reclaimWindowActive =
            tfState
                .protectBarsElapsed !=
                null &&

            tfState
                .protectBarsElapsed <=
                90;

        const currentTfReclaim =
            candle.close >
                ma7 &&

            candle.close >
                ma25 &&

            candle.close >
                ma99 &&

            ma7 >
                ma25 &&

            rsiValue >
                50 &&

            rsiValue >
                rsiAverage &&

            rsiValue <
                75 &&

            volumeRatio >=
                0.75 &&

            distanceFromMA7 <=
                2.5;

        const fiveMinuteReclaim =
            close5 >
                ma7Five &&

            close5 >
                ma25Five &&

            ma7Five >=
                ma25Five &&

            rsiFive >
                50;

        if (
            reclaimWindowActive &&
            oneHourPermission &&
            fifteenMinuteSupport &&
            fiveMinuteReclaim &&
            currentTfReclaim
        ) {
            tfState.tradeState =
                1;

            tfState.protectBarsElapsed =
                null;
        }
    }

    const diagnostics = {
        pullbackWindowActive,
        oneHourPermission,
        fifteenMinuteSupport,
        fiveMinuteMomentum,
        currentTfTrigger,
        volumeRatio,
        distanceFromMA7,
        rsiValue,
        rsiAverage,

        tradeStateAfter:
            tfState.tradeState
    };

    const score =
        healthScore(
            diagnostics
        );

    return {
        yellow,

        price:
            candle.close,

        closeTime:
            candle.closeTime,

        diagnostics,

        healthScore:
            score,

        health:
            healthLabel(
                score
            )
    };
}

// ==================================================
// DELIVERY
// ==================================================

async function sendYellow(
    coin,
    tf,
    signal,
    tfState,
    quality
) {
    const label =
        TF_LABEL[tf];

    const eventId =
        `${coin.symbol}_${label}_${signal.closeTime}`;

    if (
        tfState.lastEventId ===
        eventId
    ) {
        return;
    }

    const payload = {
        event:
            "YELLOW",

        symbol:
            coin.symbol,

        tf:
            label,

        price:
            String(
                signal.price
            ),

        binance_change:
            String(
                coin.change24h
            ),

        event_at:
            String(
                signal.closeTime
            ),

        event_id:
            eventId,

        // server/APK may ignore extras.
        // Used only for diagnostics.

        health:
            signal.health,

        health_score:
            String(
                signal.healthScore
            ),

        quality_stage:
            quality?.decision ||
            "UNKNOWN",

        quality_score:
            String(
                quality?.score ??
                ""
            ),

        quality_phase:
            quality?.phase ||
            "UNKNOWN",

        quality_reason_codes:
            JSON.stringify(
                quality?.reasonCodes ||
                []
            ),

        detected_at:
            String(
                quality?.features?.detectedAt ||
                Date.now()
            ),

        expires_at:
            String(
                signal.closeTime +
                5 * 60 * 1000
            )
    };

    const result =
        await postJson(
            RELAY_URL,
            payload
        );

    tfState.lastEventId =
        eventId;

    console.log(
        `[PUSH] ${coin.symbol} ${label} ` +
        `event=${eventId}`,
        result
    );
}

// ==================================================
// BOOTSTRAP / LIVE
// ==================================================

function needsRebootstrap(
    snapshot,
    symbolState
) {
    if (
        !symbolState ||
        !symbolState.initialized
    ) {
        return true;
    }

    for (
        const tf of
        SIGNAL_TIMEFRAMES
    ) {
        const candles =
            snapshot.tf[tf];

        const tfState =
            symbolState
                .tfStates
                .get(tf);

        if (
            !candles.length ||
            !tfState
        ) {
            return true;
        }

        const firstClose =
            candles[0]
                .closeTime;

        if (
            tfState
                .lastProcessedCloseTime >
                0 &&

            tfState
                .lastProcessedCloseTime <
                firstClose
        ) {
            return true;
        }
    }

    return false;
}

function bootstrapSymbol(
    snapshot,
    symbolState,
    now = Date.now()
) {
    const indicators =
        buildAllIndicators(
            snapshot
        );

    const catchupCutoff =
        now - BOOTSTRAP_CATCHUP_MS;

    for (
        const tf of
        SIGNAL_TIMEFRAMES
    ) {
        const state =
            createTfState();

        symbolState
            .tfStates
            .set(
                tf,
                state
            );

        const candles =
            snapshot.tf[tf];

        // Reconstruct historical state, but leave candles whose five-minute
        // product TTL is still alive for the normal live path.  This catches
        // a genuine Yellow that closed while the container was restarting
        // without replaying stale historical notifications.

        let lastReplayedCloseTime = 0;

        for (
            let i = 0;
            i < candles.length;
            i++
        ) {
            if (
                candles[i].closeTime >=
                catchupCutoff
            ) {
                break;
            }

            evaluateBaseBar(
                snapshot,
                indicators,
                state,
                tf,
                i
            );

            lastReplayedCloseTime =
                candles[i].closeTime;
        }

        state.lastProcessedCloseTime =
            lastReplayedCloseTime;

        const catchupPending =
            candles.filter(
                candle =>
                    candle.closeTime >
                    lastReplayedCloseTime
            ).length;

        console.log(
            `[BOOTSTRAP] ${snapshot.symbol} ${TF_LABEL[tf]} ` +
            `lastClosed=${state.lastProcessedCloseTime} ` +
            `state=${state.tradeState} ` +
            `PBbars=${state.barsSincePullback ?? "-"} ` +
            `ProtectBars=${state.protectBarsElapsed ?? "-"} ` +
            `Catchup=${catchupPending}`
        );
    }

    symbolState.initialized =
        true;
}

async function processLiveSymbol(
    snapshot,
    symbolState
) {
    const indicators =
        buildAllIndicators(
            snapshot
        );

    for (
        const tf of
        SIGNAL_TIMEFRAMES
    ) {
        const candles =
            snapshot.tf[tf];

        const state =
            symbolState
                .tfStates
                .get(tf);

        if (
            !state ||
            !candles.length
        ) {
            continue;
        }

        for (
            let i = 0;
            i < candles.length;
            i++
        ) {
            const candle =
                candles[i];

            if (
                candle.closeTime <=
                state
                    .lastProcessedCloseTime
            ) {
                continue;
            }

            const signal =
                evaluateBaseBar(
                    snapshot,
                    indicators,
                    state,
                    tf,
                    i
                );

            state.lastProcessedCloseTime =
                candle.closeTime;

            if (
                !signal?.yellow
            ) {
                continue;
            }

            const eventId =
                `${snapshot.symbol}_${TF_LABEL[tf]}_${signal.closeTime}`;

            // Early Engine is observation-only. It runs before the legacy
            // per-TF delivery threshold so the 0%–1% 1M cohort is measured,
            // but it never blocks or enables a push in this wave.
            try {
                const early = evaluateEarlySignal({
                    snapshot,
                    tf,
                    candles,
                    index: i,
                    signal
                });

                if (early) {
                    console.log(
                        JSON.stringify({
                            telemetry: "banksawan-yellow",
                            type: "early_decision",
                            mode: EARLY_ENGINE_MODE,
                            event_id: eventId,
                            symbol: snapshot.symbol,
                            tf: TF_LABEL[tf],
                            event_at: signal.closeTime,
                            signal_price: early.signalPrice,
                            decision: early.decision,
                            phase: early.phase,
                            path: early.path,
                            extended: early.extended,
                            reason_codes: early.reasonCodes,
                            features: early.features
                        })
                    );
                }

            } catch (error) {
                console.error(
                    `[EARLY ERROR] ${snapshot.symbol} ${TF_LABEL[tf]}:`,
                    error.message
                );
            }

            // ==================================================
            // PER-TF 24H ELIGIBILITY
            //
            // Formula/state tetap diproses.
            // Push hanya dikirim jika threshold TF terpenuhi.
            //
            // 1M  >= +1%
            // 5M  >=  0%
            // 15M >=  0%
            // 1H  >=  0%
            // ==================================================

            if (
                !isTfEligible(
                    snapshot,
                    tf
                )
            ) {
                console.log(
                    `[YELLOW SUPPRESSED] ` +
                    `${snapshot.symbol} ${TF_LABEL[tf]} ` +
                    `change=${snapshot.change24h.toFixed(2)}% ` +
                    `required>=${minChangeForTf(tf)}% ` +
                    `close=${signal.closeTime}`
                );

                continue;
            }

            const d =
                signal.diagnostics;

            const quality =
                evaluateQuality({
                    snapshot,
                    indicators,
                    signal,
                    tf,
                    index: i,
                    now: Date.now(),
                    config: QUALITY_CONFIG
                });

            OUTCOME_LOGGER.recordSignal({
                eventId,
                symbol: snapshot.symbol,
                tf: TF_LABEL[tf],
                eventAt: signal.closeTime,
                entryPrice: signal.price,
                quality
            });

            console.log(
                JSON.stringify({
                    telemetry: "banksawan-yellow",
                    type: "quality_decision",
                    event_id: eventId,
                    symbol: snapshot.symbol,
                    tf: TF_LABEL[tf],
                    event_at: signal.closeTime,
                    detected_at: quality.features.detectedAt,
                    latency_ms: quality.features.latencyMs,
                    decision: quality.decision,
                    phase: quality.phase,
                    score: quality.score,
                    components: quality.components,
                    reason_codes: quality.reasonCodes
                })
            );

            if (
                !shouldDeliverQuality(
                    QUALITY_CONFIG,
                    quality
                )
            ) {
                console.log(
                    `[QUALITY BLOCK] ${snapshot.symbol} ` +
                    `${TF_LABEL[tf]} decision=${quality.decision} ` +
                    `phase=${quality.phase} score=${quality.score} ` +
                    `reasons=${quality.reasonCodes.join(",")}`
                );

                continue;
            }

            console.log(
                `[YELLOW] ${snapshot.symbol} ${TF_LABEL[tf]} ` +
                `price=${signal.price} ` +
                `change=${snapshot.change24h.toFixed(2)}% ` +
                `close=${signal.closeTime} ` +
                `PB=${Number(d.pullbackWindowActive)} ` +
                `H1=${Number(d.oneHourPermission)} ` +
                `M15=${Number(d.fifteenMinuteSupport)} ` +
                `M5=${Number(d.fiveMinuteMomentum)} ` +
                `TRIG=${Number(d.currentTfTrigger)} ` +
                `RSI=${d.rsiValue.toFixed(2)} ` +
                `VR=${d.volumeRatio.toFixed(2)} ` +
                `DIST=${d.distanceFromMA7.toFixed(2)}% ` +
                `HEALTH=${signal.health}:${signal.healthScore}`
            );

            try {
                await sendYellow(
                    snapshot,
                    tf,
                    signal,
                    state,
                    quality
                );

            } catch (e) {
                console.error(
                    `[PUSH ERROR] ` +
                    `${snapshot.symbol} ${TF_LABEL[tf]}:`,
                    e.message
                );
            }
        }
    }
}

async function processCoin(
    coin
) {
    let symbolState =
        symbolStates.get(
            coin.symbol
        );

    let bootstrap =
        !symbolState ||
        !symbolState.initialized;

    if (
        !symbolState
    ) {
        symbolState =
            createSymbolState();

        symbolStates.set(
            coin.symbol,
            symbolState
        );
    }

    let snapshot;

    if (
        bootstrap
    ) {
        snapshot =
            normalizeSnapshotClosed(
                await inspectCoin(
                    coin,
                    BOOTSTRAP_LIMIT
                )
            );

        saveSnapshotToCache(
            symbolState,
            snapshot
        );

    } else {
        const recentOneMinute =
            closedCandles(
                await loadKlines(
                    coin.symbol,
                    "1m",
                    LIVE_1M_LIMIT
                )
            );

        if (
            hasRecentOneMinuteGap(
                recentOneMinute
            ) ||
            hasOneMinuteBridgeGap(
                symbolState.candleCache["1m"],
                recentOneMinute
            )
        ) {
            console.warn(
                `[LIVE GAP] ${coin.symbol} rebootstrap`
            );

            symbolState =
                createSymbolState();

            symbolStates.set(
                coin.symbol,
                symbolState
            );

            snapshot =
                normalizeSnapshotClosed(
                    await inspectCoin(
                        coin,
                        BOOTSTRAP_LIMIT
                    )
                );

            saveSnapshotToCache(
                symbolState,
                snapshot
            );

            bootstrap = true;

        } else {
            updateCacheFromOneMinute(
                symbolState,
                recentOneMinute
            );

            snapshot =
                snapshotFromCache(
                    coin,
                    symbolState
                );
        }
    }

    if (
        !bootstrap &&
        needsRebootstrap(
            snapshot,
            symbolState
        )
    ) {
        console.log(
            `[REBOOTSTRAP] ${coin.symbol} gap detected`
        );

        symbolState =
            createSymbolState();

        symbolStates.set(
            coin.symbol,
            symbolState
        );

        snapshot =
            normalizeSnapshotClosed(
                await inspectCoin(
                    coin,
                    BOOTSTRAP_LIMIT
                )
            );

        saveSnapshotToCache(
            symbolState,
            snapshot
        );

        bootstrap = true;
    }

    OUTCOME_LOGGER.observeSnapshot({
        symbol: snapshot.symbol,
        oneMinuteCandles: snapshot.tf["1m"]
    });

    if (
        bootstrap
    ) {
        bootstrapSymbol(
            snapshot,
            symbolState
        );

        await processLiveSymbol(
            snapshot,
            symbolState
        );

        return;
    }

    await processLiveSymbol(
        snapshot,
        symbolState
    );
}

function pruneStatesToUniverse(
    universe
) {
    const active =
        new Set(
            universe.map(
                x =>
                    x.symbol
            )
        );

    for (
        const symbol of
        symbolStates.keys()
    ) {
        if (
            !active.has(
                symbol
            )
        ) {
            // Coin left >= 0% universe.
            //
            // Deliberately drop stale state.
            //
            // If coin later returns to >= 0%,
            // it will bootstrap silently.
            //
            // Prevent historical notification
            // from period while ineligible.

            symbolStates.delete(
                symbol
            );

            console.log(
                `[STATE DROP] ${symbol} left >=0% universe`
            );
        }
    }
}

// ==================================================
// CONCURRENT SCAN
// Small fixed worker pool
// ==================================================

async function scanUniverse(
    universe
) {
    let cursor = 0;

    async function worker(
        workerId
    ) {
        while (true) {
            const index =
                cursor++;

            if (
                index >=
                universe.length
            ) {
                return;
            }

            const coin =
                universe[index];

            try {
                console.log(
                    `[CHECK] ${coin.symbol} ` +
                    `${coin.change24h.toFixed(2)}% ` +
                    `worker=${workerId}`
                );

                await processCoin(
                    coin
                );

            } catch (e) {
                console.error(
                    `[ERROR] ${coin.symbol}:`,
                    e.message
                );
            }

            await sleep(
                REQUEST_PAUSE_MS
            );
        }
    }

    const workers = [];

    for (
        let i = 0;
        i < WORKER_CONCURRENCY;
        i++
    ) {
        workers.push(
            worker(
                i + 1
            )
        );
    }

    await Promise.all(
        workers
    );
}

// ==================================================
// LOOP
// ==================================================

async function scanOnce() {
    const started =
        new Date();

    console.log(
        `[SCANNER] start ${started.toISOString()}`
    );

    const universe =
        await loadUniverse();

    console.log(
        `[SCANNER] universe=${universe.length} ` +
        `price<${PRICE_MAX} ` +
        `eligibility=1M>=1% 5M/15M/1H>=0% ` +
        `TF=1M/5M/15M/1H`
    );

    pruneStatesToUniverse(
        universe
    );

    await scanUniverse(
        universe
    );

    console.log(
        `[SCANNER] done ${new Date().toISOString()}`
    );
}

let running = false;

async function loop() {
    if (
        running
    ) {
        console.log(
            "[SCANNER] skip overlapping tick"
        );

        return;
    }

    running = true;

    try {
        await scanOnce();

    } catch (e) {
        console.error(
            "[SCANNER FATAL]",
            e
        );

    } finally {
        running = false;
    }
}

async function runScheduler() {
    while (true) {
        const cycleStartedAt =
            Date.now();

        await loop();

        const elapsed =
            Date.now() - cycleStartedAt;

        const waitMs =
            Math.max(
                1_000,
                SCAN_MS - elapsed
            );

        console.log(
            `[SCHEDULER] elapsedMs=${elapsed} nextInMs=${waitMs}`
        );

        await sleep(waitMs);
    }
}

// ==================================================
// BOOT
// ==================================================

function boot() {
    console.log(
        "BANKSAWAN YELLOW SCANNER v1.5 CACHED 1M LIVE BOOT"
    );

    console.log(
        `Universe: >=${UNIVERSE_CHANGE_MIN}% | ` +
        `price < ${PRICE_MAX} | ` +
        `1M>=${TF_CHANGE_MIN["1m"]}% | ` +
        `5M>=${TF_CHANGE_MIN["5m"]}% | ` +
        `15M>=${TF_CHANGE_MIN["15m"]}% | ` +
        `1H>=${TF_CHANGE_MIN["1h"]}% | ` +
        `closed candle only`
    );

    console.log(
        `[DATA PLANE] bootstrap4TF=${BOOTSTRAP_LIMIT} ` +
        `live1M=${LIVE_1M_LIMIT} ` +
        `cache=${CANDLE_CACHE_LIMIT} ` +
        `workers=${WORKER_CONCURRENCY} ` +
        `weightBudget=${REQUEST_WEIGHT_BUDGET}/min ` +
        `catchupMs=${BOOTSTRAP_CATCHUP_MS}`
    );

    console.log(
        `[QUALITY] mode=${QUALITY_CONFIG.mode} ` +
        `minScore=${QUALITY_CONFIG.minScore} ` +
        `maxLatencyMs=${QUALITY_CONFIG.maxLatencyMs} ` +
        `lateRsi=${QUALITY_CONFIG.lateRsi} ` +
        `lateRunupPct=${QUALITY_CONFIG.lateRunupPct} ` +
            `lateRoomPct=${QUALITY_CONFIG.lateRoomPct}`
    );

    console.log(
        `[EARLY] mode=${EARLY_ENGINE_MODE} ` +
        `deliveryGate=false ` +
        `priceMax=${EARLY_CONFIG.priceMax} ` +
        `change24hMin=${EARLY_CONFIG.minChange24hPct}% ` +
        `quoteVolume24hMin=${EARLY_CONFIG.minQuoteVolume24h}`
    );

    return runScheduler();
}

if (require.main === module) {
    boot();
}

module.exports = {
    boot,
    runScheduler,
    scanOnce,
    scanUniverse,
    processCoin,
    processLiveSymbol,
    bootstrapSymbol,
    loadUniverse,
    loadKlines,
    klineRequestWeight,
    normalizeSnapshotClosed,
    mergeCandles,
    aggregateOneMinuteCandles,
    hasRecentOneMinuteGap,
    hasOneMinuteBridgeGap,
    saveSnapshotToCache,
    updateCacheFromOneMinute,
    snapshotFromCache,
    buildAllIndicators,
    createTfState,
    evaluateBaseBar,
    evaluateQuality,
    createQualityConfig,
    shouldDeliverQuality,
    evaluateEarlySignal,
    resolveEarlyEngineMode
};

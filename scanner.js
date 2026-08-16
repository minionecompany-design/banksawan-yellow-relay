const BASE = "https://fapi.binance.com";

const PRICE_MAX = 30;
const CHANGE_MIN = 1;
const SCAN_MS = 60_000;

const PORT = process.env.PORT || 10000;
const RELAY_URL =
    process.env.YELLOW_RELAY_URL ||
    `http://127.0.0.1:${PORT}/yellow`;

const TIMEFRAMES = ["1m", "5m", "15m", "1h"];

// State hanya hidup selama process Railway hidup.
// Setelah restart, scanner bootstrap ulang dari candle historis.
const symbolStates = new Map();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(url) {
    const r = await fetch(url, {
        headers: {
            "User-Agent": "banksawan-yellow-scanner/1.1"
        }
    });

    if (!r.ok) {
        throw new Error(
            `${r.status} ${r.statusText} ${url}`
        );
    }

    return r.json();
}

async function postJson(url, body) {
    const r = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "banksawan-yellow-scanner/1.1"
        },
        body: JSON.stringify(body)
    });

    const text = await r.text();

    if (!r.ok) {
        throw new Error(
            `${r.status} ${r.statusText} ${text}`
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

async function loadUniverse() {
    const [exchangeInfo, tickers] =
        await Promise.all([
            getJson(`${BASE}/fapi/v1/exchangeInfo`),
            getJson(`${BASE}/fapi/v1/ticker/24hr`)
        ]);

    const perpetual = new Set(
        exchangeInfo.symbols
            .filter(s =>
                s.status === "TRADING" &&
                s.contractType === "PERPETUAL" &&
                s.quoteAsset === "USDT"
            )
            .map(s => s.symbol)
    );

    return tickers
        .filter(t => perpetual.has(t.symbol))
        .map(t => ({
            symbol: t.symbol,
            price: Number(t.lastPrice),
            change24h:
                Number(t.priceChangePercent),
            volumeQuote:
                Number(t.quoteVolume)
        }))
        .filter(x =>
            Number.isFinite(x.price) &&
            x.price > 0 &&
            x.price < PRICE_MAX &&
            Number.isFinite(x.change24h) &&
            x.change24h >= CHANGE_MIN
        )
        .sort(
            (a, b) =>
                b.change24h - a.change24h
        );
}

async function loadKlines(
    symbol,
    interval,
    limit = 300
) {
    const q = new URLSearchParams({
        symbol,
        interval,
        limit: String(limit)
    });

    const rows =
        await getJson(
            `${BASE}/fapi/v1/klines?${q}`
        );

    return rows.map(k => ({
        openTime: Number(k[0]),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
        closeTime: Number(k[6]),
        quoteVolume: Number(k[7])
    }));
}

async function inspectCoin(coin) {
    const tf = {};

    for (const interval of TIMEFRAMES) {
        const limit =
            interval === "1m" ? 300 : 160;

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

// ==================================================
// INDICATORS
// TradingView-compatible basic SMA + Wilder RSI
// ==================================================

function sma(values, length) {
    const out =
        new Array(values.length).fill(null);

    let sum = 0;

    for (let i = 0; i < values.length; i++) {
        sum += values[i];

        if (i >= length) {
            sum -= values[i - length];
        }

        if (i >= length - 1) {
            out[i] = sum / length;
        }
    }

    return out;
}

function rsi(values, length = 14) {
    const out =
        new Array(values.length).fill(null);

    if (values.length <= length) {
        return out;
    }

    let gainSum = 0;
    let lossSum = 0;

    for (let i = 1; i <= length; i++) {
        const change =
            values[i] - values[i - 1];

        gainSum += Math.max(change, 0);
        lossSum += Math.max(-change, 0);
    }

    let avgGain = gainSum / length;
    let avgLoss = lossSum / length;

    out[length] =
        avgLoss === 0
            ? 100
            : 100 -
              100 /
                  (1 + avgGain / avgLoss);

    for (
        let i = length + 1;
        i < values.length;
        i++
    ) {
        const change =
            values[i] - values[i - 1];

        const gain =
            Math.max(change, 0);

        const loss =
            Math.max(-change, 0);

        avgGain =
            (
                avgGain * (length - 1) +
                gain
            ) / length;

        avgLoss =
            (
                avgLoss * (length - 1) +
                loss
            ) / length;

        out[i] =
            avgLoss === 0
                ? 100
                : 100 -
                  100 /
                      (
                          1 +
                          avgGain / avgLoss
                      );
    }

    return out;
}

function buildIndicators(candles) {
    const closes =
        candles.map(c => c.close);

    const volumes =
        candles.map(c => c.volume);

    const ma7 =
        sma(closes, 7);

    const ma25 =
        sma(closes, 25);

    const ma99 =
        sma(closes, 99);

    const rsi14 =
        rsi(closes, 14);

    const rsiAvg =
        sma(
            rsi14.map(v =>
                v == null ? 0 : v
            ),
            14
        );

    const volumeAvg =
        sma(volumes, 20);

    return {
        ma7,
        ma25,
        ma99,
        rsi14,
        rsiAvg,
        volumeAvg
    };
}

function lastCompletedIndexBefore(
    candles,
    timestamp
) {
    let result = -1;

    for (
        let i = 0;
        i < candles.length;
        i++
    ) {
        if (
            candles[i].closeTime <
            timestamp
        ) {
            result = i;
        } else {
            break;
        }
    }

    return result;
}

function validNumber(...values) {
    return values.every(
        v =>
            typeof v === "number" &&
            Number.isFinite(v)
    );
}

// ==================================================
// BANKSAWAN LONG v1.3 STATE ENGINE — TF1M
// ==================================================

function createState() {
    return {
        lastProcessedCloseTime: 0,

        tradeState: 0,
        protectBarIndex: null,

        countDown: 0,
        pullbackBarIndex: null,

        initialized: false
    };
}

function evaluateOneMinuteBar(
    snapshot,
    data,
    state,
    i
) {
    const one = snapshot.tf["1m"];
    const five = snapshot.tf["5m"];
    const fifteen = snapshot.tf["15m"];
    const hour = snapshot.tf["1h"];

    const candle = one[i];

    const m1 = data["1m"];
    const m5 = data["5m"];
    const m15 = data["15m"];
    const m60 = data["1h"];

    // Higher TF: gunakan candle yang SUDAH selesai
    // sebelum candle 1M ini tutup.
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
        i < 99 ||
        i5 < 99 ||
        i15 < 99 ||
        i60 < 99
    ) {
        return null;
    }

    const close = candle.close;

    const ma7 = m1.ma7[i];
    const ma25 = m1.ma25[i];
    const ma99 = m1.ma99[i];
    const rsiValue = m1.rsi14[i];
    const rsiAverage = m1.rsiAvg[i];
    const avgVolume = m1.volumeAvg[i];

    if (
        !validNumber(
            close,
            ma7,
            ma25,
            ma99,
            rsiValue,
            rsiAverage,
            avgVolume
        ) ||
        avgVolume <= 0
    ) {
        return null;
    }

    const volumeRatio =
        candle.volume / avgVolume;

    const distanceFromMA7 =
        Math.abs(close - ma7) /
        ma7 *
        100;

    // Pine:
    // priceDown = close < close[4]
    const priceDown =
        i >= 4 &&
        close < one[i - 4].close;

    state.countDown =
        priceDown
            ? state.countDown + 1
            : 0;

    const pullbackCount =
        state.countDown === 9 ||
        state.countDown === 13 ||
        state.countDown === 14 ||
        state.countDown === 15 ||
        state.countDown === 16;

    if (pullbackCount) {
        state.pullbackBarIndex = i;
    }

    const pullbackWindowActive =
        state.pullbackBarIndex != null &&
        i - state.pullbackBarIndex <= 30;

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
            close5,
            close15,
            close60,
            ma7Five,
            ma25Five,
            ma99Five,
            rsiFive,
            rsiAverageFive,
            ma7Fifteen,
            ma25Fifteen,
            ma99Fifteen,
            rsiFifteen,
            ma7Sixty,
            ma25Sixty,
            ma99Sixty,
            rsiSixty
        )
    ) {
        return null;
    }

    const oneHourPermission =
        close60 > ma99Sixty &&
        ma7Sixty >= ma25Sixty &&
        rsiSixty >= 48;

    const fifteenMinuteSupport =
        close15 > ma99Fifteen &&
        ma7Fifteen >= ma25Fifteen &&
        rsiFifteen >= 48;

    const fiveMinuteMomentum =
        close5 > ma7Five &&
        close5 > ma25Five &&
        ma7Five >= ma25Five &&
        rsiFive > 50 &&
        rsiFive >= rsiAverageFive;

    const oneMinuteTrigger =
        close > ma7 &&
        close > ma25 &&
        close > ma99 &&
        ma7 > ma25 &&
        rsiValue > 50 &&
        rsiValue > rsiAverage &&
        rsiValue < 75 &&
        volumeRatio >= 0.75 &&
        distanceFromMA7 <= 2.5 &&
        close < PRICE_MAX;

    const longASetup =
        pullbackWindowActive &&
        oneHourPermission &&
        fifteenMinuteSupport &&
        fiveMinuteMomentum &&
        oneMinuteTrigger;

    const oneMinuteWeak =
        close < ma7 &&
        rsiValue < rsiAverage &&
        rsiValue < 50;

    const fiveMinuteWeak =
        close5 < ma7Five &&
        rsiFive < rsiAverageFive;

    const protectCondition =
        oneMinuteWeak &&
        fiveMinuteWeak;

    const fifteenMinuteFailure =
        close15 < ma25Fifteen &&
        ma7Fifteen < ma25Fifteen &&
        rsiFifteen < 45;

    const fiveMinuteMajorFailure =
        close5 < ma99Five &&
        ma7Five < ma25Five &&
        rsiFive < 45;

    const hardFailure =
        close < ma99 &&
        close5 < ma99Five &&
        rsiFive < 45;

    const finalExitCondition =
        fifteenMinuteFailure ||
        fiveMinuteMajorFailure ||
        hardFailure;

    let yellow = false;

    // Sama dengan POSITION STATE Pine v1.3
    if (
        state.tradeState !== 0 &&
        finalExitCondition
    ) {
        state.tradeState = 0;
        state.protectBarIndex = null;
    } else if (
        state.tradeState === 0 &&
        longASetup
    ) {
        yellow = true;
        state.tradeState = 1;
    } else if (
        state.tradeState === 1 &&
        protectCondition
    ) {
        state.tradeState = 2;
        state.protectBarIndex = i;
    } else if (
        state.tradeState === 2
    ) {
        const reclaimWindowActive =
            state.protectBarIndex != null &&
            i - state.protectBarIndex <= 90;

        const oneMinuteReclaim =
            close > ma7 &&
            close > ma25 &&
            close > ma99 &&
            ma7 > ma25 &&
            rsiValue > 50 &&
            rsiValue > rsiAverage &&
            rsiValue < 75 &&
            volumeRatio >= 0.75 &&
            distanceFromMA7 <= 2.5;

        const fiveMinuteReclaim =
            close5 > ma7Five &&
            close5 > ma25Five &&
            ma7Five >= ma25Five &&
            rsiFive > 50;

        if (
            reclaimWindowActive &&
            oneHourPermission &&
            fifteenMinuteSupport &&
            fiveMinuteReclaim &&
            oneMinuteReclaim
        ) {
            state.tradeState = 1;
        }
    }

    return {
        yellow,
        price: close,
        closeTime: candle.closeTime
    };
}

async function sendYellow(
    coin,
    signal
) {
    const eventId =
        `${coin.symbol}_1M_${signal.closeTime}`;

    const payload = {
        event: "YELLOW",
        symbol: coin.symbol,
        tf: "1M",
        price: String(signal.price),
        binance_change:
            String(coin.change24h),
        event_at:
            String(signal.closeTime),
        event_id: eventId
    };

    const result =
        await postJson(
            RELAY_URL,
            payload
        );

    console.log(
        `[PUSH] ${coin.symbol} 1M event=${eventId}`,
        result
    );
}

async function processSnapshot(snapshot) {
    const now = Date.now();

    // Jangan evaluasi candle Binance yang masih forming.
    const closed1m =
        snapshot.tf["1m"].filter(
            c => c.closeTime < now
        );

    if (closed1m.length === 0) {
        return;
    }

    // pakai versi closed di snapshot
    snapshot.tf["1m"] = closed1m;

    const indicators = {
        "1m":
            buildIndicators(
                snapshot.tf["1m"]
            ),

        "5m":
            buildIndicators(
                snapshot.tf["5m"]
            ),

        "15m":
            buildIndicators(
                snapshot.tf["15m"]
            ),

        "1h":
            buildIndicators(
                snapshot.tf["1h"]
            )
    };

    let state =
        symbolStates.get(snapshot.symbol);

    if (!state) {
        state = createState();
        symbolStates.set(
            snapshot.symbol,
            state
        );
    }

    const candles =
        snapshot.tf["1m"];

    // BOOTSTRAP:
    // replay histori untuk membangun state Pine,
    // tetapi jangan kirim sinyal lama.
    if (!state.initialized) {
        for (
            let i = 0;
            i < candles.length;
            i++
        ) {
            evaluateOneMinuteBar(
                snapshot,
                indicators,
                state,
                i
            );
        }

        state.lastProcessedCloseTime =
            candles[
                candles.length - 1
            ].closeTime;

        state.initialized = true;

        console.log(
            `[BOOTSTRAP] ${snapshot.symbol} lastClosed=${state.lastProcessedCloseTime}`
        );

        return;
    }

    // FIX CANDLE GAP:
    // proses SEMUA closed candle yang belum pernah
    // diproses, bukan hanya candle terakhir.
    for (
        let i = 0;
        i < candles.length;
        i++
    ) {
        const candle = candles[i];

        if (
            candle.closeTime <=
            state.lastProcessedCloseTime
        ) {
            continue;
        }

        const signal =
            evaluateOneMinuteBar(
                snapshot,
                indicators,
                state,
                i
            );

        state.lastProcessedCloseTime =
            candle.closeTime;

        if (signal?.yellow) {
            console.log(
                `[YELLOW] ${snapshot.symbol} TF1M price=${signal.price} change=${snapshot.change24h.toFixed(2)}% candleClose=${signal.closeTime}`
            );

            try {
                await sendYellow(
                    snapshot,
                    signal
                );
            } catch (e) {
                console.error(
                    `[PUSH ERROR] ${snapshot.symbol}:`,
                    e.message
                );
            }
        }
    }
}

async function scanOnce() {
    const started = new Date();

    console.log(
        `[SCANNER] start ${started.toISOString()}`
    );

    const universe =
        await loadUniverse();

    console.log(
        `[SCANNER] universe=${universe.length}`
    );

    for (const coin of universe) {
        try {
            console.log(
                `[CHECK] ${coin.symbol} ${coin.change24h.toFixed(2)}%`
            );

            const snapshot =
                await inspectCoin(coin);

            await processSnapshot(snapshot);
        } catch (e) {
            console.error(
                `[ERROR] ${coin.symbol}:`,
                e.message
            );
        }

        // Hindari request burst.
        await sleep(120);
    }

    console.log(
        `[SCANNER] done ${new Date().toISOString()}`
    );
}

let running = false;

async function loop() {
    if (running) {
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

console.log(
    "BANKSAWAN YELLOW SCANNER v1.1 BOOT"
);

loop();
setInterval(loop, SCAN_MS);

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const BASE =
    "https://fapi.binance.com";

const OUTPUT_DIR =
    path.join(
        process.cwd(),
        "test",
        "fixtures"
    );

const LIMIT = 1500;
const REQUEST_PAUSE_MS = 180;
const MAX_RETRIES = 5;

const TIMEFRAMES = [
    "1m",
    "5m",
    "15m",
    "1h"
];

// ============================================================
// HISTORICAL WINDOWS
//
// IMPORTANT:
// - These windows only select historical market data.
// - Expected EARLY prices DO NOT live here.
// - Acceptance prices remain only inside regression tests.
// - 1H begins earlier to provide sufficient regime/base context.
// ============================================================

const FIXTURES = Object.freeze({
    APR: {
        symbol: "APRUSDT",

        windows: {
            "1m": [
                "2026-06-09T00:00:00Z",
                "2026-06-14T00:00:00Z"
            ],

            "5m": [
                "2026-06-09T00:00:00Z",
                "2026-06-14T00:00:00Z"
            ],

            "15m": [
                "2026-06-09T00:00:00Z",
                "2026-06-14T00:00:00Z"
            ],

            "1h": [
                "2026-06-02T00:00:00Z",
                "2026-06-14T00:00:00Z"
            ]
        }
    },

    BTR: {
        symbol: "BTRUSDT",

        windows: {
            "1m": [
                "2026-08-24T00:00:00Z",
                "2026-08-30T00:00:00Z"
            ],

            "5m": [
                "2026-08-24T00:00:00Z",
                "2026-08-30T00:00:00Z"
            ],

            "15m": [
                "2026-08-24T00:00:00Z",
                "2026-08-30T00:00:00Z"
            ],

            "1h": [
                "2026-08-12T00:00:00Z",
                "2026-08-30T00:00:00Z"
            ]
        }
    },

    USELESS: {
        symbol: "USELESSUSDT",

        windows: {
            "1m": [
                "2026-08-28T00:00:00Z",
                "2026-09-04T10:00:00Z"
            ],

            "5m": [
                "2026-08-28T00:00:00Z",
                "2026-09-04T10:00:00Z"
            ],

            "15m": [
                "2026-08-28T00:00:00Z",
                "2026-09-04T10:00:00Z"
            ],

            "1h": [
                "2026-08-06T00:00:00Z",
                "2026-09-04T10:00:00Z"
            ]
        }
    }
});

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

function toMs(value) {
    const ms = Date.parse(value);

    if (!Number.isFinite(ms)) {
        throw new Error(
            `Invalid timestamp: ${value}`
        );
    }

    return ms;
}

function intervalMs(interval) {
    const match =
        /^(\d+)(m|h)$/.exec(interval);

    if (!match) {
        throw new Error(
            `Unsupported interval: ${interval}`
        );
    }

    const amount =
        Number(match[1]);

    const unit =
        match[2];

    if (unit === "m") {
        return amount * 60_000;
    }

    if (unit === "h") {
        return amount * 60 * 60_000;
    }

    throw new Error(
        `Unsupported interval: ${interval}`
    );
}

async function getJson(url) {
    let lastError = null;

    for (
        let attempt = 1;
        attempt <= MAX_RETRIES;
        attempt++
    ) {
        try {
            const response =
                await fetch(url, {
                    headers: {
                        "User-Agent":
                            "banksawan-yellow-regression-fixture/1.0"
                    }
                });

            if (response.ok) {
                return await response.json();
            }

            const body =
                await response
                    .text()
                    .catch(() => "");

            lastError =
                new Error(
                    `${response.status} ` +
                    `${response.statusText} ` +
                    `${body}`.trim()
                );

            if (
                response.status === 429 ||
                response.status === 418 ||
                response.status >= 500
            ) {
                const retryAfter =
                    Number(
                        response.headers.get(
                            "retry-after"
                        )
                    );

                const waitMs =
                    Number.isFinite(retryAfter) &&
                    retryAfter > 0
                        ? retryAfter * 1000
                        : attempt * 1500;

                console.warn(
                    `[RETRY] status=${response.status} ` +
                    `attempt=${attempt}/${MAX_RETRIES} ` +
                    `wait=${waitMs}ms`
                );

                await sleep(waitMs);
                continue;
            }

            throw lastError;

        } catch (error) {
            lastError = error;

            if (attempt >= MAX_RETRIES) {
                break;
            }

            const waitMs =
                attempt * 1000;

            console.warn(
                `[HTTP RETRY] ` +
                `attempt=${attempt}/${MAX_RETRIES} ` +
                `${error.message}`
            );

            await sleep(waitMs);
        }
    }

    throw (
        lastError ||
        new Error(
            `Request failed: ${url}`
        )
    );
}

function mapKline(k) {
    return {
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
    };
}

function validateCandles(
    symbol,
    interval,
    candles
) {
    if (!candles.length) {
        throw new Error(
            `${symbol} ${interval}: no candles returned`
        );
    }

    const expectedStep =
        intervalMs(interval);

    for (
        let i = 0;
        i < candles.length;
        i++
    ) {
        const candle =
            candles[i];

        const numericFields = [
            candle.openTime,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume,
            candle.closeTime,
            candle.quoteVolume,
            candle.trades,
            candle.takerBuyBase,
            candle.takerBuyQuote
        ];

        if (
            !numericFields.every(
                Number.isFinite
            )
        ) {
            throw new Error(
                `${symbol} ${interval}: ` +
                `invalid numeric candle at index ${i}`
            );
        }

        if (
            candle.high <
            candle.low
        ) {
            throw new Error(
                `${symbol} ${interval}: ` +
                `high < low at index ${i}`
            );
        }

        if (i === 0) {
            continue;
        }

        const previous =
            candles[i - 1];

        if (
            candle.openTime <=
            previous.openTime
        ) {
            throw new Error(
                `${symbol} ${interval}: ` +
                `timestamps not ascending at index ${i}`
            );
        }

        const delta =
            candle.openTime -
            previous.openTime;

        if (
            delta !== expectedStep
        ) {
            console.warn(
                `[GAP] ${symbol} ${interval} ` +
                `previous=${new Date(
                    previous.openTime
                ).toISOString()} ` +
                `current=${new Date(
                    candle.openTime
                ).toISOString()} ` +
                `delta=${delta}`
            );
        }
    }
}

async function fetchKlinesRange({
    symbol,
    interval,
    start,
    end
}) {
    const startMs =
        toMs(start);

    const endMs =
        toMs(end);

    if (endMs <= startMs) {
        throw new Error(
            `${symbol} ${interval}: invalid time window`
        );
    }

    const candles = [];

    let cursor =
        startMs;

    while (cursor < endMs) {
        const params =
            new URLSearchParams({
                symbol,
                interval,
                startTime:
                    String(cursor),

                endTime:
                    String(
                        endMs - 1
                    ),

                limit:
                    String(LIMIT)
            });

        const url =
            `${BASE}/fapi/v1/klines?${params}`;

        const rows =
            await getJson(url);

        if (
            !Array.isArray(rows) ||
            rows.length === 0
        ) {
            break;
        }

        const page =
            rows.map(mapKline);

        for (
            const candle of page
        ) {
            if (
                candle.openTime >= startMs &&
                candle.openTime < endMs
            ) {
                candles.push(candle);
            }
        }

        const last =
            page[
                page.length - 1
            ];

        const nextCursor =
            last.openTime +
            intervalMs(interval);

        if (
            !Number.isFinite(nextCursor) ||
            nextCursor <= cursor
        ) {
            throw new Error(
                `${symbol} ${interval}: pagination stalled`
            );
        }

        cursor =
            nextCursor;

        console.log(
            `[FETCH] ${symbol} ${interval} ` +
            `page=${page.length} ` +
            `total=${candles.length} ` +
            `through=${new Date(
                last.openTime
            ).toISOString()}`
        );

        if (
            rows.length < LIMIT
        ) {
            break;
        }

        await sleep(
            REQUEST_PAUSE_MS
        );
    }

    // Protect against duplicate boundary candles.
    const unique =
        [
            ...new Map(
                candles.map(
                    candle => [
                        candle.openTime,
                        candle
                    ]
                )
            ).values()
        ].sort(
            (a, b) =>
                a.openTime -
                b.openTime
        );

    validateCandles(
        symbol,
        interval,
        unique
    );

    return unique;
}

function summarize(candles) {
    const lows =
        candles.map(
            candle =>
                candle.low
        );

    const highs =
        candles.map(
            candle =>
                candle.high
        );

    return {
        candles:
            candles.length,

        firstOpenTime:
            candles[0]
                ?.openTime ??
            null,

        firstOpenIso:
            candles[0]
                ? new Date(
                    candles[0].openTime
                ).toISOString()
                : null,

        lastOpenTime:
            candles[
                candles.length - 1
            ]?.openTime ??
            null,

        lastOpenIso:
            candles.length
                ? new Date(
                    candles[
                        candles.length - 1
                    ].openTime
                ).toISOString()
                : null,

        minLow:
            Math.min(...lows),

        maxHigh:
            Math.max(...highs)
    };
}

async function buildFixture(
    key,
    definition
) {
    const tf = {};
    const summaries = {};

    console.log(
        `\n=== ${key} ${definition.symbol} ===`
    );

    for (
        const interval of
        TIMEFRAMES
    ) {
        const window =
            definition
                .windows[
                    interval
                ];

        if (!window) {
            throw new Error(
                `${key}: missing ${interval} window`
            );
        }

        const [
            start,
            end
        ] = window;

        console.log(
            `[START] ${definition.symbol} ${interval} ` +
            `${start} -> ${end}`
        );

        tf[interval] =
            await fetchKlinesRange({
                symbol:
                    definition.symbol,

                interval,

                start,

                end
            });

        summaries[interval] =
            summarize(
                tf[interval]
            );

        console.log(
            `[DONE] ${definition.symbol} ${interval}`,
            summaries[interval]
        );
    }

    return {
        schemaVersion: 1,

        source:
            "Binance USD-M Futures /fapi/v1/klines",

        symbol:
            definition.symbol,

        timestamps:
            "Unix milliseconds UTC",

        windows:
            definition.windows,

        summary:
            summaries,

        tf
    };
}

async function writeFixture(
    key,
    fixture
) {
    await fs.mkdir(
        OUTPUT_DIR,
        {
            recursive: true
        }
    );

    const filename =
        `${key.toLowerCase()}.json`;

    const outputPath =
        path.join(
            OUTPUT_DIR,
            filename
        );

    await fs.writeFile(
        outputPath,
        JSON.stringify(
            fixture,
            null,
            2
        ) + "\n",
        "utf8"
    );

    console.log(
        `[WRITE] ${outputPath}`
    );
}

async function main() {
    const requested =
        process.argv[2]
            ?.trim()
            .toUpperCase();

    let entries =
        Object.entries(
            FIXTURES
        );

    if (requested) {
        if (
            !FIXTURES[
                requested
            ]
        ) {
            throw new Error(
                `Unknown fixture "${requested}". ` +
                `Use APR, BTR, USELESS, or omit for all.`
            );
        }

        entries = [
            [
                requested,
                FIXTURES[
                    requested
                ]
            ]
        ];
    }

    console.log(
        "BANKSAWAN YELLOW — regression fixture fetcher"
    );

    console.log(
        `targets=${entries
            .map(([key]) => key)
            .join(",")}`
    );

    for (
        const [
            key,
            definition
        ] of entries
    ) {
        const fixture =
            await buildFixture(
                key,
                definition
            );

        await writeFixture(
            key,
            fixture
        );
    }

    console.log(
        "\nFixture generation complete."
    );
}

if (require.main === module) {
    main().catch(error => {
        console.error(
            "[FIXTURE ERROR]",
            error
        );

        process.exitCode = 1;
    });
}

module.exports = {
    FIXTURES,
    TIMEFRAMES,
    fetchKlinesRange,
    buildFixture,
    validateCandles
};

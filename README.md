# banksawan-yellow-relay
BANKSAWAN YELLOW signal relay

## Scanner data plane v1.5

The BANKSAWAN LONG MTF v1.3 formula remains frozen. A cold start loads 499
closed candles for 1M/5M/15M/1H and reconstructs independent Pine-like state.
After bootstrap, each symbol makes only one lightweight 1M request. Complete
1M candles are cached and deterministically aggregated into 5M, 15M, and 1H.
This reduces live kline request count by 75% and request weight by 87.5%
relative to the previous `limit=300` four-timeframe poll.

Only complete and contiguous minute buckets may form a higher-timeframe bar.
A gap inside the fresh window, or a gap between the cache and fresh window,
forces a full rebootstrap instead of fabricating candles. A cold restart also
replays only events whose five-minute product TTL is still alive; older
historical Yellow events remain silent.

## Quality Gate v0

The LONG A detector remains the parity source. `quality-engine.js` runs after a
raw Yellow event and classifies it as `READY`, `WATCH`, or `REJECTED` using
phase, structure, participation, freshness, and execution diagnostics.

The default is intentionally non-breaking:

```text
QUALITY_GATE_MODE=shadow
QUALITY_MIN_SCORE=78
QUALITY_MAX_LATENCY_MS=45000
QUALITY_LATE_RSI=69
QUALITY_LATE_RUNUP_PCT=6
QUALITY_LATE_ROOM_PCT=1
QUALITY_LATE_EXTENSION_ATR=3
QUALITY_MAX_SPREAD_BPS=25
QUALITY_REQUIRE_SPREAD=false
QUALITY_ALLOW_LATE_BREAKOUT=false
RELAY_ENFORCE_EXPIRY=false
```

In `shadow`, all existing Yellow pushes continue, while structured
`quality_decision`, `quality_signal`, and `quality_outcome` records are written
to the Railway log. In `enforce`, only `READY` is sent to FCM. Do not enable
`enforce` until the shadow dataset has been reviewed per timeframe.

The outcome logger is intentionally in-memory in v0. It labels forward MFE,
MAE, and close return at 1/3/5/10/15/30/60 minutes. A durable store can be
added after the schema and thresholds have been validated.

Run the deterministic tests with:

```bash
node --test test/*.test.js
```

## Early Engine v2 regression foundation

`early-engine.js` evaluates a raw, closed-candle LONG A event without changing
the LONG A detector. It checks the requested `<30 USDT` and `24h >= 0%`
universe, rolling 24-hour quote liquidity, ATR-normalized extension, quote
volume, transaction count, taker-buy share, breakout structure, and candle
close strength.

The committed APR, BTR, and USELESS fixtures are chronological Binance USD-M
Futures candles. Regression replay currently produces the first `EARLY`
decision at:

```text
APRUSDT      1M   0.23083   EARLY_BASE
BTRUSDT     15M   0.03415   BREAKOUT_CONFIRMATION
USELESSUSDT  5M   0.07081   BREAKOUT_CONFIRMATION
```

Acceptance prices exist only in the regression test. The engine contains no
benchmark symbol or target price and reads no candle after the evaluated
signal. Refresh fixture artifacts manually with the `Refresh Early Engine
Fixtures` GitHub workflow or locally with:

```bash
npm run fixtures
```

Early Engine v2 is wired into the scanner as telemetry only. Its safe modes in
this wave are:

```text
EARLY_ENGINE_MODE=shadow
EARLY_ENGINE_MODE=off
```

Any other value, including `enforce`, resolves back to `shadow`. Every raw
Yellow event in the `>=0%` universe can therefore produce an `early_decision`
log, including the 1M 0%–1% observation cohort, while the existing notification
path remains unchanged. Early Engine must not gate live delivery until broader
positive and negative replay sets are labelled.

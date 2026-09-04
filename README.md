# banksawan-yellow-relay
BANKSAWAN YELLOW signal relay

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

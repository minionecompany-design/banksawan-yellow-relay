# BANKSAWAN YELLOW CLEAN — Pine v1.3 parity audit, stage 7
**Date:** 22 October 2026
**Reference source:** `docs/reference/BANKSAWAN-LONG-MTF-v1.3-user-supplied.pine`
**Status:** OFFLINE research **NOT yet TradingView Pine-certified**.

## Critical discrepancy identified (source-derived)

Original Pine script has:
```pine
var int tradeState = 0
if tradeState != 0 and finalExitCondition
    finalExitSignal := true
    tradeState := 0
else if tradeState == 0 and longASetup
    longASignal := true
    tradeState := 1
else if tradeState == 1 and protectCondition
    protectSignal := true
    tradeState := 2
else if tradeState == 2
    ...
```

The original `longASignal` fires **only in Waiting state 0** and is
suppressed on subsequent consecutive true `longASetup` bars. The current
clean scanner's `evaluateCausalLongA` checks LONG A setup but does **not**
yet implement this Pine position-state lifecycle. Therefore an identical
setup over successive candles could emit several alerts in the current
scanner even if Pine only emits one. THIS IS A RELEASE BLOCKER; not
a cosmetic issue.

## Completed on this branch

- `core/src/pine-v13-position-state.js`: source-aligned, no-network
  Pine conditions for LONG A, PROTECT, RECLAIM, OUT FINAL, with exact
  0→1→2→1 / final-exit→0 state precedence. ONLY LONG_A is a publishable
  event; other transitions are deliberately **internal**.
- `core/test/pine-v13-position-state.test.js`: confirms actual
  user-supplied source file and its default thresholds, repeated LONG A
  suppression, exit priority, protect/reclaim without alerts, 90-bar
  reclaim expiry and fail-closed discontinuous bars.
- `core/src/event-journal.js`: unique atomic write temp files +
  stale-temp cleanup, preventing previous process-ID `.tmp` crash
  artifacts from stopping future writes.
- `core/test/event-journal-crash-recovery.test.js`: concurrent
  durable accepts and prior stale-temp crash simulation.

## Intentional policy differences

- Original Pine default: `maximumPrice = 30`. YELLOW's separate
  product-universe policy **strictly** requires `0 < price < 10`.
  This is not a silent Pine change: it is the owner's outer eligibility
  rule. The new state metrics helper supports default Pine 30 and an
  explicit product override of 10 in tests.
- Pine `entryWindowBars=30` and `reclaimWindowBars=90` are described
  as 1M bars in their input labels; within a 5M/15M/1H chart Pine
  counts the **chart's own bars**, not always 1M. The new internal
  state model counts per target lane.

## Still blocked before LIVE

1. Integrate position-state progression with the **real**
   `OfflineYellowScanner` and the closed-candle lanes, rather than
   using raw `longASetup` alone. Persist or deterministically
   rebuild per-symbol, per-TF state across server restarts.
2. Prove source-historical state origin. Replaying an arbitrary
   112–185-candle suffix starts `tradeState=0` *by assumption* and
   does NOT establish prior Pine state. Require trusted start of
   symbol history or source-aligned durable checkpoint.
3. Verify `request.security(..., close[1], lookahead_on)` behavior
   on actual 1M, 5M, 15M, 1H candles; lower-timeframe security
   requested from higher chart timeframe has special semantics.
   Current causal realtime tests do NOT prove TradingView historical
   labels match the scanner.
4. Obtain user-authorized independent TradingView export or
   bar-by-bar signal evidence to compare exact LONG_A bars and
   gap/duplicate counts against real Binance USD-M market candles.
5. Do not activate FCM or LIVE from Railway on the basis of synthetic
   positive tests, static source checks or unit tests alone.
6. HOME and UNIVERSE final UI approved and frozen. LAB, BR and ONE
   out of scope; YELLOW V2 existing service/app unchanged.

**Acceptance gate:** no known mismatching bar, same symbol and timeframe,
fully confirmed candle times, same Pine settings, reproducible parity
in source-aligned historical and realtime modes, validated restart
behavior, authorized feed entitlement and isolated staging QA.

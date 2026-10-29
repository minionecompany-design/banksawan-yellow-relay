# YELLOW analysis companion — 26 October 2026

## Scope and release state

Implements the owner's accepted approach: one existing YELLOW APK, with an
optional analysis companion for an already accepted LONG A. First validate the
companion independently; enable natural observation before claiming any benefit.
No new application, signal lane or trading bot is created.

Base is PR #20 application/backend head
`904909ed647fd5563885744a28bd8d7e7900ab14`, not the older default `main`.
This is a separate review branch. PR #20 is not merged or rewritten.

The new switch `YELLOW_ANALYSIS_ENABLED` defaults OFF. This implementation does
not set a production variable, deploy/restart a service, make market requests,
send a real push, or distribute a signed APK. Existing package, versionCode 11,
Firebase/signing configuration, universe policy, 50-symbol cap, four LONG A lanes,
Pine v1.3 repair, ledger and TradingView route are retained. VersionCode 11 here
is source metadata, not a newly installable update; a later signed release must
increment it and pass the existing permanent-signer upgrade procedure.
LAB, BR, ONE and the abandoned clean rebuild are out of scope.

## Source and method

`analysis-companion.js` is newly written from standard public technical-analysis
concepts. It does not contain extracted APK code or LuxAlgo premium source, and
does not claim to reproduce LuxAlgo. Product references considered:

- https://www.luxalgo.com/library/indicator/support-and-resistance-signals-mtf/
- https://www.tradingview.com/pine-script-docs/concepts/strategies/

The frozen method identifier is `YELLOW_COMPANION_V1`:

1. Capture the evaluator's existing closed-candle snapshot, at an accepted
   event's signal close T. The snapshot was created before ledger/FCM awaits.
   Analysis processing is deferred until after the original FCM callback.
2. For each of 1m/5m/15m/1h, use only bars ending at or before T, at most the last
   190. Require at least 100 consecutive valid OHLCV bars and the expected latest
   completed boundary `floor(T / timeframe) * timeframe`. A context closing at T
   is included only if it was actually present in that snapshot. Missing or late
   context creates PARTIAL analysis; it is never filled retroactively.
3. Trend is UP when close > SMA99 and SMA7 > SMA25, DOWN when both comparisons
   are reversed, otherwise MIXED. These labels describe the snapshot; they are
   not calibrated probabilities, predictions or additional Pine conditions.
4. Relative volume is current candle volume / mean of the PREVIOUS 20 volumes,
   excluding the current candle. A zero baseline is null, not an invented ratio.
5. ATR14 uses Wilder smoothing of true range, seeded from 14 ranges in the
   retained history. Finite-history seed dependence is disclosed; this is not a
   TradingView runtime parity claim.
6. The previous 20 highs/lows form the range. Close above/below it is
   BREAKOUT/BREAKDOWN. Confirmed 2-left/2-right pivots provide nearby historical
   support/resistance. A pivot is usable only once its two right bars exist.
7. RETEST requires a prior closed breakout above a 20-bar base, within the
   previous five bars, followed by a signal candle touching a 0.25 ATR zone and
   closing back above the level. A close below the tolerance during the interval
   invalidates this classification. These are original, fixed research rules.
8. A scenario requires all four frames complete, the target close matching the
   event price and valid positive ATR/risk. Reference entry is the signal close;
   the zone is entry - 0.10 ATR through entry + 0.25 ATR. SL is the lowest of the
   latest five target candles minus 0.25 ATR. TP1/2/3 are 1R/2R/3R from reference
   entry. No leverage, orders, executable-price guarantee or calibrated score.
9. A falling TF and resistance before TP1 produce descriptive cautions. They
   NEVER suppress a LONG A. No overhead resistance in retained history is null;
   it does not imply unlimited upside. Invalid/incomplete inputs produce no plan.

Scenario entry expires at T + 15 minutes. Android labels older snapshots as
expired and explicitly displays the signal time. The displayed entry/SL/targets
are the frozen scenario, not current prices, exchange-rounded orders or a fresh
entry recommendation. Price rendering permits wrapping and ten significant digits
without collapsing tiny positive prices to zero;
exchange tick-size rounding would be required before any future order workflow.

## Forward observation and honest accounting

The companion accepts only subsequent CLOSED 1m bars from the existing candle
book; no REST request, subscription or live polling is added. Paper observation
is independent for every accepted symbol/timeframe/event ID.

- Earliest assumed entry is the open of the first full minute whose start is at
  or after `detectedAtMs`. For a notification detected at 12:00:04, this is the
  12:01 minute, observed only once that bar closes at 12:02. The 12:00 signal-close
  price is not treated as an executable fill.
- Only that first full-minute OPEN can enter. Outside the frozen zone, at/below
  SL or at/above TP1: NOT_ENTERED. No OHLC-based limit-fill assumption or later
  opportunistic entry is made.
- A position is followed up to 120 minutes. TP1_BEFORE_SL and SL_BEFORE_TP1 are
  distinct from TIMEOUT, AMBIGUOUS, INCOMPLETE_DATA, NOT_ENTERED and NO_PLAN.
- When one minute touches both levels and its open is between them, the order is
  AMBIGUOUS. It is not counted as a win/loss. A later gap through SL uses the
  worse opening price; a favorable gap through TP1 receives only the frozen TP1.
- Missing closed bars/restart gaps/expired observation without complete coverage
  become INCOMPLETE_DATA. No backfill requests or invented outcomes.
- Priced exits subtract a declared combined cost assumption of **14 basis
  points** (0.14 percentage points). This is an example combined fees/slippage
  assumption, NOT a current Binance fee quote. It excludes funding, market
  impact, leverage and human latency. Gross/net returns are unlevered model data.
- MFE/MAE are full-candle excursions up to the terminating bar, not proven
  pre-exit tick paths. TP2/TP3 are reference levels only; current outcome metrics
  evaluate TP1 versus SL and must not be described as TP3 performance.
- Summary reports every retained status, decisive sample size, ambiguous count,
  priced-exit sample size and mean modeled net return. TP1-first rate excludes
  timeout/ambiguous/no-entry/incomplete/no-plan records and is explicitly NOT a
  live win rate. Always disclose the denominator and exclusions.

Journal retention is 24h and 500 records, max 8 MiB; queue capacity is 128.
Completed records can be evicted before active records; when all slots are
active, a new capture is rejected. Eviction/rejection/dropped-job counters are
persisted and visible. Summary is a bounded retained sample, not an all-time
audit. Any sample loss must be disclosed during evaluation.

## Isolation and read contract

The companion has its own `yellow-analysis-companion-v1.json`, atomic replacement,
serialized writes, restore/schema checks, five-minute write spacing and a
graceful flush. The first save is scheduled immediately. An abrupt crash can
lose observations since the last save; later missing bars are not repaired by
guessing. File failure disables analysis alone. Existing HOME/checkpoint/circuit
files are never opened by this module. All capture/bar hooks are guarded.

The original ledger and original FCM callback still execute before any analysis
calculation. Deferred work uses a bounded queue on the same process; it adds
bounded CPU/memory/disk work and does not provide a hard real-time isolation
guarantee. Benchmark and watch scanner latency during a future shadow trial.

Read-only API, using existing market-readiness gates:

- `/api/home` adds optional `analysisAvailable` (false by default). Old clients
  ignore it; new clients hide the button when the field is absent/false. The
  per-event `analysisCaptured` flag hides buttons on old or uncaptured records.
- `/api/analysis?eventId=<encoded complete LONG_A ID>` returns an immutable
  analysis and latest paper observation for an actual, retained HOME event.
  Invalid ID: 400; absent event/capture: 404; disabled/fault/stale market: 503.
- `/api/analysis/summary` exposes bounded sample statistics and exclusions.
- `/api/status.analysisCompanion` exposes enabled state, bounded sizes and faults.

Android uses a separate on-demand executor, no additional polling loop. Both
HOME-to-request and reply-to-dialog verify the entire event ID, symbol,
timeframe, close time, method/schema and level ordering. Invalid or unavailable
analysis does not clear HOME or suppress notifications. The button is present
only on HOME; the existing two tabs and UNIVERSE behavior are retained.

## Reproducible checks

```sh
node --test scanner/test/analysis-companion*.test.js
node --test scanner/test/*.test.js
python3 -m unittest discover -s scripts -p 'test_verify_yellow*.py'
gradle -p android :app:assembleDebug :app:testDebugUnitTest --no-daemon
git diff --check
```

The Android fixture is generated by the actual Node engine and equality-tested
in Node, then consumed by six Robolectric tests. Existing CI runs the scoped
scanner command, Android compile/behavior tests and signer refusal checks on
this feature branch. The legacy unscoped `npm test` has pre-existing nested
V8/V9 assertions; passing scoped tests must not be mislabeled as an unqualified
`npm test` pass.

All new market data in tests is SYNTHETIC, including the chronological Pine
fixture. Mocked FCM callbacks and HTTP API tests are not real phone receipts.
No performance improvement, profitable strategy or percentage accuracy is
established by these functional checks.

### Local verification receipt

Verified locally on 26 October 2026, before remote publication:

| Check | Result |
| --- | --- |
| Scoped scanner regression | 223 passed, 0 failed; includes 16 new companion tests |
| Offline release/Firebase/upgrade Python checks | 15 passed |
| Android `assembleDebug` | BUILD SUCCESSFUL, demo mode, empty API URL, alerts off |
| Android Robolectric behavior | 23 passed, 0 failures/errors/skips; includes 6 new analysis tests |
| Permanent-signing refusal | `YELLOW_PERMANENT_SIGNING_REQUIRED` observed; no private key used |
| Whitespace/diff checks | Passed |

Build used Gradle 8.10.2, verified official Temurin JDK 17.0.21, compileSdk 35
and the repository's existing build configuration. The debug build is validation
only, not a signed upgrade for the owner. Existing 7 notifier, 4 TradingView,
4 universe and 2 Activity recovery tests all pass alongside the new 6 tests.

A 250-iteration synthetic calculation microbenchmark on this container measured
median 0.079ms, p95 0.366ms, maximum 2.494ms. This excludes delivery, queueing and
disk work and is not a production/phone latency guarantee. Remote CI has not run
for this branch at the time of this local receipt.

## Next evidence required

After source review, enable only in an agreed observation deployment using the
same feed and accepted LONG A events. Record complete status counts, data loss,
delivery/analysis latency and costs across new data and changing market regimes.
Compare with the frozen baseline and disclose missed/ambiguous/no-plan events.
Only after that evidence supports useful behavior should the same-package
signed APK update expose the feature for normal use. This document does not
authorize or claim that activation, release, merge or production deployment.

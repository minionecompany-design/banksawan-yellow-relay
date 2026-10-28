# BANKSAWAN YELLOW — SECOND SIGNAL 1M: ENGINEERING HANDOFF + RELEASE GATE
**28 Oktober 2026 WIB — status OFFLINE RESEARCH (NOT LIVE)**

## Tujuan
Menjawab permintaan pemilik: LONG A empat timeframe tetap jadi radar; sinyal kedua khusus LONG A TF1M membantu memilih PANTAU/ABAİKAN/ENTRY dengan dua jalur PULLBACK dan CONTINUATION tanpa ramalan palsu. Jangan membangun aplikasi lain. Jaga 1 APK YELLOW, 50-slot scanner, filter universe harga<10 USDT, CHG24H >=+1%, quote volume24H>10M, FCM LONG A 1M/5M/15M/1H, HOME tetap ringkas, TradingView dan ANALISIS terpisah.

## Source of truth dan perubahan yang sudah DIKERJAKAN
Repo: `minionecompany-design/banksawan-yellow-relay`.
Production v15 Railway tetap pada commit `112023d50ad297eba36b9acd539450fc53ce2de3`, branch `feat/yellow-v15-entry-watch-20261027`.
Penelitian berantai PR #26 -> #27 -> **PR #28** (branch `feat/yellow-v4-continuation-1m-offline-20261028`), semua draft. Jangan merge/deploy tanpa release review.
- `scanner/src/entry-continuation-v4.js` — pure optional research continuation 3-bar stair-step: native-closed candle gate, 1M only, risk stop 0.3–5%, overhead resistance room >=1.5R, 6h watch, 3min entry; quote fresh eligible for any GREEN. Stop invalidation correctly RED; target reached correctly OFF.
- `scanner/src/second-signal-1m.js` — second-signal V3 current structural breakdown (2 x 1M close below pre-A 20m support + strong bearish volume + native 5M/15M).
- **BARU** `scanner/src/second-signal-compositor-1m.js` — **ONE** research result combining v3 pullback, v4 continuation, structural invalidation. Strict event identity + engine-method validation, RED risk veto before GREEN, no fabricated quote, PANTAU PRIORITAS stays YELLOW (entryAllowed=false), no duplicate HOME lamps, no quote unless latest real ticker fresh.
- **BARU** `scanner/src/entry-v4-release-gate.js` — no irreversible integration from CI. For evidence sufficiency it requires forward-data cohort (e.g. 100 independent market episodes, at least 80 complete, 30 quote-verified setups, 20 completed paper fills) plus no-future, native arrival-order, cost/spread, false RED/missed winners and baseline audit; Android/FCM/persistence/signature QA. The sample thresholds are *review criteria*, **not a proof of probability**. It never authorizes deployment automatically, even after all criteria pass: owner approval always required.
- Archived comparison `scanner/scripts/lib/replay-continuation-v4.mjs` and `scanner/scripts/compare-continuation-v4.mjs`: all 46 archived cases SHA256 verified, 28 TF1M included and 18 others marked out-of-scope, 3 missing cases noted. Replays separate V3+V4+one-lamp decisions at actual closed candle times; no hindsight in decisions; future max high only computed later as diagnostic. No historical ticker, so NO historical GREEN invented.
- Unit tests include `scanner/test/entry-continuation-v4.test.js`, `scanner/test/second-signal-compositor-1m.test.js`, `scanner/test/entry-v4-release-gate.test.js`, plus all legacy Android/FCM scanner tests. Pure experimental modules are **NOT imported into LIVE source paths**.

## Actual offline results (DO NOT inflate into win-rate)
Fixed archived group: 46 cases, 28 1M, 18 5M/15M out-of-scope. Of 28 1M cases, 15 full six-hour windows, 13 censored.
- V3 baseline: 1 candle confirmation PULLBACK HUMA, paper NOT_ENTERED. 0 confirmed CONTINUATION. 0 filled trades, no performance estimate.
- V4 revised continuation: 3-bar structural pattern appeared at least once for 18 of 28, but entry confirmation **0**, filled paper trades **0**, scored TP1/SL **0**. Typical blockers: overhead resistance either unmeasured or too near and other risk/trend gates. **NO GO for entry LIVE.**
- Watch-only PRIORITY (a 1M structural clue, still YELLOW, not an order): EVAA +36m after A at +5.36% since A, later observed max +23.52% above marked price; AIN +112m after A at +11.11%, later max +18.94%; REZ +292m at +8.63%, later max +0.15% with censored window. Three post-selected archived examples are not win rate or predictive calibration.
- Unified compositor was executed across all 28 real archived 1M cases with **ticker=null**. At current runner version, **296/296 Node scanner tests pass**. Combined close-minute decisions: YELLOW 7,746 / RED 19 / OFF 15 / GREEN **0 by design**; any attempt to create historical GREEN from missing quote fails. Distinguish **GREEN not reconstructible** from **zero real opportunities**.
- CHG24H at initial LONG A missing from original 28-case manifest. Cannot estimate whether 24H % boosts accuracy. Numeric return since A from closed candle, NOT a live ticker reading.
- RED appeared for five archived events in prior PR27 replay, median ~153 minutes after LONG A, and JCT recovered +5.12% from its red close. RED is a current conditional risk, not a forecast the asset will never rally.
- 5M/15M/1H source and native arrival order in the historical archive remain assumptions; actual forward observer must log receive timestamps.

## CI, reproducibility and evidence
Full branch check:
```bash
node --test --test-concurrency=4 scanner/test/*.test.js
node scanner/scripts/compare-readiness-v3.mjs docs/evidence/entry-v3-20261028/manifest.json > /tmp/v3.json
node scanner/scripts/compare-second-signal-1m.mjs docs/evidence/entry-v3-20261028/manifest.json > /tmp/v3-second.json
node scanner/scripts/compare-continuation-v4.mjs docs/evidence/entry-v3-20261028/manifest.json > /tmp/v4.json
```
GitHub Actions workflow `.github/workflows/yellow-v2-scoped-qa.yml` executes scanner regression, SHA256 candle replay, Android compile + Robolectric, signing safety guards; signed production release job SKIPPED. Its continuation artifact contains:
- `v3-v4-full.json` per-case trace, summary `summary.json`;
- `release-gate.json` machine-readable state **NO_GO_LIVE** explaining missing prospective evidence and production QA.

## What REMAINS, cannot be completed retrospectively
1. **Forward quote capture and offline observation on NEW LONG A 1M**. Need immutable, time-stamped real 1M candle CLOSE/ARRIVAL, native 5M/15M/1H close/arrival, fresh Binance ticker observedAt, contemporaneous CHG24H and quote volume, original LONG A price and freeze metadata. Record both successful and failed candidates continuously, and no data contamination from future.
2. Record transition timing and status after each new closed 1M, plus valid price/quote and in-zone availability for each candidate. Test false RED, missed winners, initial 5–30min weakness, and watch priority <1h vs very late flags.
3. Compare pullback, continuation, red, watch priority vs baseline v15 and V3 on **same future** episode denominator, including fill, TP1/SL, fees/spread/slippage/expiry and realistic native data arrival timestamps; reject thresholds tailored only to AIN/EVAA.
4. Complete persistence/restart and Android display/FCM isolation QA on **a separate proposed integration**. Only after evidence-gate cleared and explicit owner approval may deploy; no new APK or Railway modifications until then.

**Decision:** code and archived research QA **complete**, quantitative LIVE performance **not established**. Correct release gate is NO-GO, not pretend success. Production YELLOW v15 must stay intact.

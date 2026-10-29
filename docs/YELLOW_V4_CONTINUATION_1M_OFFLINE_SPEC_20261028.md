# BANKSAWAN YELLOW V4 — CONTINUATION TF1M, ISOLATED OFFLINE RESEARCH
Date: 2026-10-28 WIB. Owner asked ChatGPT to continue directly to avoid losing Work context.

## Preservation and decision
- **One and only one YELLOW**. Production v15 commit `112023d50ad297eba36b9acd539450fc53ce2de3` remains LIVE on Railway; no deploy or signed APK from this branch.
- The original Pine LONG A must continue on 1M / 5M / 15M / 1H with FCM; no changes to 50-slot scanner, price/24h CHG/24h quote-volume universe, HOME, TradingView, Android, server, API, or original red/yellow/green lights.
- This new research engine **never imports into LIVE**. It processes only LONG A **1M** as independent V4 continuation hypothesis. Native 5M/15M/1H candles supply context, not new entry lanes.
- Baseline is *frozen* V3 in `scanner/src/entry-readiness-v3.js`, not rewritten. The production v15 ENTRY monitor is an additional unchanged historical reference.

## Before-data hypothesis (preserve unchanged while testing)
The previous V3 continuation requires 5 base candles and >=1.5x relative volume. V4 tests a **3-bar small stair-step base**: successive/mostly nondecreasing lows and improving closes; base range <=2.5 ATR1m; current 1M close breaches prior 3 highs, >MA7 and LONG A price; bullish candle body >=45% of range; range <=2.5 ATR; extension <=0.8 ATR past base high; relative volume >=1.2 (20 previous candles). This early *research hypothesis* is NOT a claim that 3 bars is superior or creates profit.

Mandatory gating remains: 100+ contiguous, already closed 1m/5m/15m/1h candles; 5m recovery and not DOWN, 15m/1h not BOTH DOWN; stop risk 0.3–5%; **visible resistance room >=1.5R**; frozen entry zone; 6h observation, 3min confirmation window; stop or target touch invalidates; quote fresh (<30s), 24h CHG>1%, 24h USD quote volume>10M for any GREEN, price within entry range. Pivots/HTF must be visible at decision time, no future candle; unverified quote never green.

V4 is intentionally **continuation-only**, with V3's pullback path untouched and separately measured.

## QA, artifacts and reproducibility
- `scanner/src/entry-continuation-v4.js`: pure optional strategy and live-quote gate in RESEARCH_ONLY mode.
- `scanner/test/entry-continuation-v4.test.js`: synthetic cause/quote safety, 1M-only, future-candle protection, missing context, volume, expired plan and V3 isolation.
- `scanner/scripts/lib/replay-continuation-v4.mjs`: deterministic no-network candle replay per event, V3 vs V4 simultaneous. Next-full-minute-open paper entry/SL/TP1 (14bps assumed), no claim of live fills.
- `scanner/scripts/compare-continuation-v4.mjs`: all **46** eligible archived events (28 1M, 18 non1M out-of-scope), SHA256 verified. Missing cases (NOM/INJ) explicitly reported. Every 1M event reports V3 and V4 confirmation, MFE, MAE, time-to-confirm, fill status and win/loss, plus V4 rejection reasons and earliest structural breakout for diagnosis.
- GitHub Actions scoped QA runs scanner, Python release guard, Android compile/Robolectric and offline replay. Signed-release job must remain SKIPPED. Artifacts `yellow-continuation-v4-research-comparison` and prior baseline evidence are retained for Work.
- No ticker stream archived: no historical quote eligibility/price, so **do not manufacture a historic GREEN** or infer real order execution.
- Archived winners AIN / EVAA are known; any future threshold tuning on this group is **in-sample**, and cannot certify win-rate. Use independent future cases for genuine performance.

## Release gate (NOT satisfied)
Proceed to LIVE only on explicit owner approval after: 1) evidence of confirmations before gains (not after), 2) actual enterable prices and net TP1/SL outcome versus baseline, 3) false RED and missed continuation audited on new cases, 4) time-ordered native HTF proof, 5) no contradictory HOME color decisions, state persistence across restart/gap, Android/FCM invariants and signer retention. If no measurable improvement, **NO-GO** is the correct result.

## Work handoff
Work can audit this entire independent PR directly; do not ask owner to re-explain requirements. Continue from the last documented CI run, inspect raw comparison artifact and missing data. Do not create additional separate APKs, reintroduce LAB/BR/ONE, or deploy a speculative heuristic.

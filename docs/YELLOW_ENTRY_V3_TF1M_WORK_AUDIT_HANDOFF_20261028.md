# Audit handoff for ChatGPT Work — YELLOW ENTRY V3 TF1M (2026-10-28 WIB)

## Fixed mandate
Owner asked to **test only, do not deploy**. Work should audit when resumed. This file and PR #26 are durable records of the offline experiment; no async job or future delivery is implied.

### Isolation
- Original LIVE YELLOW v15 LONG A, 1M/5M/15M/1H FCM, scanner 50 symbols, Android, Pine, TradingView links, existing production lamp watch and Railway remain **unchanged**.
- Only the OFFLINE/RESEARCH V3 two-path ENTRY engine is gated to LONG A 1M. Higher native TF (5M/15M/1H) candle histories remain required **context** for confirming a 1M setup, not independent V3 signal lanes.
- `newReadinessWatch` fails closed for all other TF; offline replay reports excluded cases rather than deleting or relabeling them. V3 is **NOT IMPORTED BY LIVE**. No APK was signed or installed; no Railway changes were staged or accepted.

## Verification performed
- GitHub Actions full branch scope and Android debug/signing guards on code SHA `ebd359f74bf26f7ee79caa071047c29948181276`: [run 40603688846](https://github.com/minionecompany-design/banksawan-yellow-relay/actions/runs/40603688846), SUCCESS.
- Follow-on ARCHIVED 1M candle replay added to scanner CI on SHA `2560f448f87b81fd0fdd768d6938a132d2d53ab3`: [run 40605045949](https://github.com/minionecompany-design/banksawan-yellow-relay/actions/runs/40605045949), scanner SUCCESS, 266/266 Node tests (plus 6/6 source contract, 15/15 Python release guards). Android job results should be checked from GitHub Actions; status at the time of writing may still be pending.
- Offline artifact: `yellow-entry-v3-1m-research-evidence`, artifact ID `12780232553`, contains `replay.json` full event-by-event outputs and `summary.json` independent counts. Workflow artifacts may expire; the conclusions and replay command remain here.
- Re-run offline (NO market/network request): `node scanner/scripts/compare-readiness-v3.mjs docs/evidence/entry-v3-20261028/manifest.json > replay.json`; script validates SHA256 of saved source candles before each replay.

## Genuine saved-candle cohort (NOT prospective or complete market history)
- 46 archived usable event cases; **28 LONG A 1M** evaluated; **16 5M and 2 15M** labeled `OUT_OF_SCOPE_NON_1M`. These 18 still appear in full raw report.
- Three additional unavailable cases: `NOMUSDT 1M`, `NOMUSDT 5M`, `INJUSDT 5M`; missing candle buffers, not counted as success/failure.
- Of 28 1M cases, **15 complete observation windows** and **13 censored/incomplete**.
- Old baseline entry engine on same 28 1M cases: **zero candle confirmations**, 15 complete no-confirmations and 13 censored.
- V3 candidate on same 28: **one PULLBACK confirmation**, 14 complete no-confirmations, 13 censored, one `NOT_ENTERED`.
- Single V3 confirmation `HUMAUSDT:1m:1793093820000:LONG_A` at minute ~73 after LONG A; confirmed reference price `0.027397`, risk 2.8475%, relative volume 2.31x, room to resistance 1.6126R. Frozen plan; next-full-minute-open paper model did **not** fill (`NOT_ENTERED`). This is diagnostic, NOT an entry recommendation or tradable level today.
- **0 completed TP1 wins, 0 priced SL losses, 0 filled trades** in the 1M-only cohort. No percentage accuracy/profit is estimable; absence of priced exits is not proof of safety.
- The continuation path remains covered synthetically but **did not confirm** on the 28 actual 1M archived cases. Historical GREEN was not reconstructed (no eligible quote stream).
- Cost assumption is 14bps, next-full-minute open. No real slippage, time-of-quote, exchange tick rounding, execution, fees-to-account data or unbiased unseen validation included.

## Work next audit, not deployment
1. Re-read PR #26 and compare V1 baseline vs V3 using identical **1M-only denominator** and original raw SHA256 hashes; inspect `replay.json` including every censored case, rather than reporting a win rate.
2. Audit causal/same-candle pivot, HTF close ordering, 90-second maximum lag, data gaps, market eligibility at GREEN, stop and TP order ambiguity, no backfilled signals, 3-minute entry validity, and 6-hour observation window.
3. Assess new **prospective unseen** 1M cases (including losers and never-confirmed events). For LIVE integration later, explicitly review backend persistence, Android OFF/RED/YELLOW/GREEN semantics, timezone and stale quote handling, FCM isolation and one APK compatibility.
4. **Do not merge/deploy/release this research without a new explicit owner decision** after audit. Preserve production v15 until research provides evidence of better real-world entries.

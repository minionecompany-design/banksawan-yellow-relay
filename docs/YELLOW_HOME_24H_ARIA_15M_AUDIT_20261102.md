# YELLOW V2 HOME 24H / ARIA 15M — audit & release gate (2026-11-02)

Production source when audited: `51992acaa9190c5d49026d5340f33ece68777301`, Railway `yellow-live-shadow-yc94`, branch `feat/yellow-v16-forward-native-20261031`. No production deploy or APK change is authorized by this audit.

## Change scope and migration
The LIVE `scanner/src/live-home-ledger.js` originally uses `HOME_TTL=10h`. Android already honors `homeExpiresMs`; no APK rebuild needed. This branch sets `HOME_TTL=24h` for **new** accepted LONG A, anchored at each event's `firstSeenMs`.

The existing prune clamp `min(existingExpiry, firstSeenMs+24h)` remains. Previously saved 10-hour records therefore **keep their old 10-hour expiry**, and expired/missing records must not reappear. No historical FCM replays. 24-hour claims, five-minute polling-event validity, filters, four TF evaluators, FCM, WS/REST, journal, Android UI, status, Binance guard and deployment config stay unchanged. HOME becomes historical visibility, **not** entry authorization; WATCH_ONLY validity is not extended.

No extra Binance calls or paid services. HOME list/persistent ledger may grow ~2.4 times under comparable signal load; measure operational impact.

## ARIA 15M evidence (unresolved)
Owner's Nov 2 TradingView screenshot of ARIAUSDT.P, 15M shows a yellow 'A' around the Nov 1–2 boundary. A historical plotted marker does not prove the exact realtime close timestamp or as-of market filters.

Read-only Railway logs for 2026-11-01 21:00 through 2026-11-02 08:00 WIB show **no ARIA LONG A 15M** and no other ARIA log. They do show prior ARIA 1M `1793297460000` on **Oct 30 01:11 WIB** and ARIA 5M `1793297700000` on **Oct 30 01:15 WIB** (both `YELLOW_FCM ... SENT`). Nov 2 15:38 WIB ARIA recovery log is not LONG A.

Hypotheses: ARIA absent from up-to-50 tracked subset, 24-hour ticker eligibility, MTF context/clock/closed-candle availability, or TradingView historical-vs-live Pine parity. Available logs do not preserve past per-symbol eligibility, covered state or each 15M decision reason. **Root cause unproven.** Retention change does NOT fix missed detection. Separate read-only candle-aligned 15M coverage/decision diagnostics and offline replay needed before touching filters or core strategy.

## Offline QA and production gate
New branch workflow: `.github/workflows/yellow-home-24h-qa.yml`. On branch push, run syntax, `node --test --test-concurrency=4 scanner/test/*.test.js` and existing Python integrity tests; NO deploy, APK build or actual Firebase send. Regression must prove: fresh per-TF HOME expiry at 24h with restart; legacy 10h never revived; 5-minute event window and 24-hour dedupe untouched; no phantom events on disk fault; four-TF path preserved. Require green exact-head CI before production consideration.

Production rollout, **only after owner explicitly confirms exact tested SHA**: pin the reviewed source on the SAME Railway service, region and existing `/data`; do not modify variables or resources. Compare source diff for Android/FCM/market/request guard parity. Verify healthy sockets, FCM, guard, 50 tracked cap and `/api/home` via read-only checks. For a genuinely NEW LONG A verify `homeExpiresMs-firstSeenMs=86400000`, while polling validity remains 300000ms. Confirm no duplicate after restart and inspect device list. Wait for a real 24h boundary to prove expiry; no synthetic live alert. Monitor storage, CPU, RAM, FCM failures. Rollback source: `51992acaa9190c5d49026d5340f33ece68777301`; rollback shortens new 24h cards to 10h, not a loss of persistent volume.

**Status: CODE PREPARED, QA PENDING, NOT DEPLOYED; ARIA DIAGNOSIS OPEN.**

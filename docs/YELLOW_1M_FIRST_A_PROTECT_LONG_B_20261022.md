# BANKSAWAN YELLOW GOLD v0.13 — silent 1M FIRST A → PROTECT → selected LONG B

**Source review only**, based on user decision 22 Oct 2026. Not YELLOW LAB, BR, ONE. No Railway changes, merger, live market polling, Binance requests, FCM credentials, or APK installation.

## Product contract

- **Operator, not APK, makes trading decisions**: APK detects and reports Pine-like patterns. Do not claim price will rise/fall, automatic entry, ranking based on predicted profit, or trigger trades.
- Existing USD-M Perpetual YELLOW universe: `0 < lastPrice < 10 USDT`, rolling 24-hour `P >= +1.00%`, rolling **USDT quote** volume `q > 10,000,000 USDT`. Use as-of A quote volume at FIRST A discovery, not Binance base `v`. Missing q or source identity fail closed. The new 1M episode pins this q so subsequent volume drops do not erase an active episode.
- All four timeframe candle/state lanes **1m, 5m, 15m, 1h** are still evaluated. The 1m FIRST LONG A and PROTECT remain **silent**; only selected 1m `LONG_B` can enter HOME / foreground events / FCM. LONG A notifications 5m, 15m, 1h stay unchanged.
- The time window starts at the **first closed 1m LONG A candle** in the episode; expiry = that candle close + 120 minutes inclusive. Repeated LONG A events during the episode do not reset or extend the 2h deadline. Subsequent PROTECT must be an actual 1m pattern event, after FIRST A and before window expiry. B must be after PROTECT and **no more than 90 closed 1m bars** (=90 event-time minutes) after latest PROTECT, and also **no later than FIRST A+120m**. No PROTECT → no B. `OUT_FINAL` cancels the episode.
- Pine-like 1m evaluator still requires **fresh source ticker and actual closed-candle 1m/MTF confirmation**. For an active A-verified 1m episode only, new-admission thresholds P>=+1%, price<10 and q>10M are **pinned at FIRST A**, not re-tested at B; B may show the genuine later ticker P below +1% or later price >=10. Its own Pine-like candle/RSI/MA criteria, actual PROTECT, 90-bar and A+120-minute windows MUST still hold. This is not permission to invent a B or predict profits. B carries A candle close, PROTECT close and first-A price/change/quote turnover for independent Android validation.
- Up to **one B selection** and one HOME/event per pinned episode. Durable journal `/data/yellow-one-minute-b-episodes.json`; atomically persisted before ledger dispatch; selected/DELIVERED tombstones survive restarts. A signal event must be no older than existing five-minute delivery TTL; HOME uses existing ten-hour TTL and client claim uses existing idempotent notification id. Fail closed if journal unreadable, critical 1m+MTF continuity cannot be restored, candle gap, or timeout. If ledger persisted but FCM send failed/crashed, at-most-once publication can mean a missed push; don't misrepresent as exactly-once confirmed delivery.
- **Episode protection within existing tracked capacity**: a pinned symbol is not de-subscribed merely because its rolling 24h volume falls below 10M or its P exits the admission filter, until episode expiry / cancellation. A reconnect bootstraps any active pinned symbol **before new eligible admissions**. A true candle gap or unverified cold resume cancels it; never fabricate LONG B.
- No extra REST host, websocket connection or per-symbol kline subscription added solely for 1M B. Market-data authorization remains a **separate hard dependency**; no workaround for provider HTTP 451, no region/IP move, no GOLD/LAB bridge. The 1M episode feature defaults **OFF** and requires separate `YELLOW_1M_LONG_B_ENABLED=true` decision in a future authorized release. Existing `YELLOW_ALERT_TIMEFRAMES=5m,15m,1h` remains the regular LONG A alert selector.

## Code touchpoints

- `scanner/src/one-minute-b-episodes.js`: journal, A/PROTECT/B/OUT_FINAL reducer, 120m/90m boundaries, pinned initial q, restart replays.
- `scanner/src/live-market.js`: opt-in 1m handling, pinned coverage, trusted checkpoints and B delivery to existing HOME/FCM.
- `scanner/src/live-home-ledger.js`: validated LONG B id and source metadata; LONG A paths unchanged.
- `scanner/src/live-fcm.js`: first-A-anchored LONG B 1m payload, existing LONG A 5m/15m/1h payloads; no 1m LONG A.
- `android/app/src/main/java/id/banksawan/yellow/` MainActivity, YellowNotifier, YellowFirebaseService: B-specific validation in foreground/background and labeled HOME.
- New APK version **0.13.0**, `versionCode 9`, same package id `id.banksawan.yellow`, existing permanent signer required. CI artifact is a **DEBUG OFFLINE smoke APK only**, not installable over the signed version.
- `scanner/test/one-minute-b-episodes.test.js` covers strict A thresholds, B 90/120 limits, first-A pinning, duplicate after restart, no PROTECT, cancelled/gapped episodes, durable HOME and FCM negative tests.

## Operational go/no-go

1. GitHub scanner regression + Android compiler + secure-signing tests GREEN at the **exact final head SHA**.
2. Validate provider permissions for YELLOW's data origin/operator **before any live changes**; do not use Singapore/GOLD operation alone as entitlement evidence.
3. Through an explicitly approved, separate release: retain existing volume and guarded Binance circuit, create protected permanently signed APK **with exact reviewed SHA**, verify signer against old installed APK; coordinate source deployment with the APK. Do not install CI debug, deploy, modify FCM, change region, or enable 1M B by default.
4. Natural-market QA must confirm coverage/gaps, event-time anchors, duplicates and delivery after actual eligible signals. Offline passing tests are **not** proof of genuine market-signal frequency or end-to-end phone notification success.

**Unchanged**: 5m/15m/1h LONG A, 1m LONG A is not notified, product q filter, 10h HOME TTL, original timeout/retry guard, TradingView mobile routing bug remains a separate issue.

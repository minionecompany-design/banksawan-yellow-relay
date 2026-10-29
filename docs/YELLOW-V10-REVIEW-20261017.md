# YELLOW V10 review — 17 October 2026

Status: implementation and offline tests pass; production release approval is withheld. Production remains CRASHED on e2a62c4. No Railway mutation, credential access, BR operation, or Binance request was performed.

## Diagnosis and scope

Production branch: yellow-long-a-v2-20261015; baseline e2a62c402870ae610a5e61ffa0fec4d05c97a3ed (merged PR #2). Railway banksawan-yellow-v2 / yellow-live-shadow-yc94 / production has deployment 688ad8e0-686b-4ef3-87b8-fe6ad81f84bd CRASHED. Log at 2026-10-17 08:31:01 WIB: YELLOW_HALT WEBSOCKET_DISCONNECTED_kline_REQUIRES_REVIEW, then STOPPED_FAIL_CLOSED at 08:31:03. Restart policy NEVER prevents automatic restart. Existing /data volume is still attached. No config, variable, restart, volume, or auto-deploy setting was changed.

The existing socket close/error handler intentionally stops the whole service. HOME's symbol-level exclusion hides new same-symbol entries, although event acceptance already uses unique IDs. Android HOME/UNIVERSE refresh is 60 seconds; server recordTicker updates the in-memory universe synchronously. There is no 20-entry cap in the current live API or canonical Android source. UNIVERSE eligible list and 24 candle coverage slots are separate.

The offline WebSocket Recovery diff was read and audited against baseline. This implementation follows its conservative discard-and-bootstrap approach and adds 0–1000ms bounded jitter, retired-generation protection for delayed candles and in-flight bootstraps, a guard check before reconnect, batch resubscription, and requiring fresh kline/ticker traffic before resetting the retry counter. The old 112-test claim is not treated as evidence for this commit.

## Changes

- LiveHomeLedger: one HOME record per accepted LONG_A ID; ten hours from first receipt, independent per event. Five-minute delivery and 24-hour claims unchanged. Identical claims are serialized and persisted before FCM opportunity. No cap or symbol deduplication on HOME.
- Migration retains version-1 ledger shape. Existing HOME expiry is never extended; pre-existing one-hour records retain their original timer. Historical records absent from old HOME are not reconstructed from other collections. Existing 24-hour records are capped at ten hours. /data path unchanged.
- WS: at most three retries with 5/20/60-second exponential backoff plus 0–1000ms jitter; 90-second recovery handshake/data timeout. Close logging includes code, sanitized reason, and generation. Retired callbacks cannot resume old state. Both old feeds close before a new pair opens. Scanner pauses, discards coverage and ticker history, then reboots contiguous closed candles through the existing guarded scheduler. No direct recovery REST loop. Cold-start cursors skip historical signals; fresh pullback state is required. Exhaustion, subscription rejection, and persistent circuit remain fail-closed. Attempt counter resets only after five minutes and recent data on both streams.
- FCM independently rejects any signal other than LONG_A and mismatched IDs. Credentials/topic unchanged. Backend accepted-event claims continue to prevent a second send opportunity for a duplicate; this does not claim exactly-once delivery across external FCM failures.
- API adds tickerObservedAtMs/stale to universe rows and generatedAtMs/lastTickerDataAtMs to the response. Existing fields remain. Recovery or global ticker age >=30s returns HTTP 503 for data endpoints. /health/live remains process liveness. Per-row stale state is visible in Android.
- Canonical Android app polls every five seconds while resumed, skips concurrent refreshes, disables HTTP cache, preserves scroll offset, and exposes feed errors on the universe tab. Notification polling and shared event-ID notifier unchanged. versionCode 6 / 0.10.0-event-home. APK rebuild is required for this UI behavior; backend HOME changes work with the existing APK.
- Regression paths in scanner/test/test were corrected to reference the real repository root. Baseline npm test had 109 pass / 9 path failures. Updated version expectations reflect Android versionCode 6. No test was disabled.

## Pine findings — parity is NOT certified

Reference is the user-supplied v1.3, normalized from Markdown into docs/reference/BANKSAWAN-LONG-MTF-v1.3-user-supplied.pine. Screenshots label v1.3.7; source identity is not established for that exact version.

| Source condition | Marker | HOME/FCM |
| --- | --- | --- |
| longASignal | Yellow upward triangle, RGB 255/215/0, A | Accept |
| longBSignal | Orange upward triangle, RGB 255/152/0, B | Reject |
| protectSignal | Cyan diamond, P | Reject |
| hotSignal | Orange diamond, HOT | Reject |
| finalExitSignal | Blue downward triangle, OUT | Reject |

LONG A requires tradeState == 0 plus pullback window and MTF/current trigger. A later candle alone does not create another LONG A: the original state machine must naturally return to waiting and generate a fresh signal. Independent TF state permits another TF's true LONG A without resetting the first lane.

The production evaluator's LONG A conditions correspond structurally to supplied v1.3, with additional existing YELLOW eligibility (price <10 and Binance 24h change >=1%) whereas Pine defaults to price <30 without that 24h gate. Existing JS LONG_B also reuses stricter currentPass/fivePass and eligibility gates than Pine's reclaim expressions; that can affect later trade state. These formulas were NOT changed under the no-algorithm-change instruction. Finite RSI history/cold-start state and historical-versus-realtime lower-TF request.security semantics further limit exact chart parity. An exact v1.3.7 source/settings and reference outputs are needed for full parity. No synthetic repeat LONG A was added.

## Validation

- npm test: 132/132 pass, including unit, local HTTP integration, offline acceptance-server, source contracts and historical causality checks.
- npm run test:live: 49/49 pass (subset of complete suite; do not sum as independent coverage).
- Python Firebase configuration verifier tests: 6/6 pass.
- node --check for all four changed backend modules and git diff --check pass.
- New regressions include same-symbol 5m/1m/1h and another 5m, 35 HOME entries, duplicate acceptance/restart, independent ten-hour boundaries, legacy expiry, non-A rejection before FCM HTTP, socket retry exhaustion, timeout, retired callbacks, circuit 418/429/451, one resubscribe batch, no duplicate sockets, ticker-to-API propagation and stale HTTP 503.
- Actual archived APR/BTR/USELESS candles were used to verify future context mutation cannot alter any lane decision. The 24h ticker is explicitly a test stub in this test: it proves a causal property, not historical delivery, profitable signals, or TradingView parity. Existing historical/realtime Pine and chronological synthetic tests also pass. No new market candles were fetched.
- Local latency: 30 injected WS→localhost API samples; median 1.88ms, p95 3.28ms, max 18.18ms. See JSON report. This is NOT production or physical APK measurement. Five-second Android polling targets ~10 seconds under ordinary network response times; physical end-to-end proof is pending.
- Android compile job is prepared for PR CI without Firebase secrets or release installation. Local Android SDK/Gradle are unavailable. This is not a signed release build and does not establish compatibility with the installed signing certificate.

## Release gates and rollback

Draft PR targets the existing production branch, not main. Do not merge/deploy until explicit user approval and review of remaining gates. Exact source parity, installed APK signer/version verification and physical UI/FCM tests are pending; no assertion of full production readiness or natural proof is made.

Before an approved release, verify auto-deploy remains OFF, snapshot the existing volume ledger without deleting it, confirm the installed APK signing certificate and versionCode, and use the established signer. Release one exact approved commit with /data and FCM intact. Never start an external parallel Binance scanner. Verify readiness and recovery metrics, API freshness, then wait for real LONG A and a same-symbol repeat. No natural event has been claimed during this offline work.

Do not automatically roll back to the prior one-hour HOME implementation. If a release fails, stop scanning safely and review the evidence; preserve the ledger and volume. A reviewed rollback may revert a narrowly identified change while retaining event-ID claims and the ten-hour HOME contract. Any production action requires separate explicit approval.

## GitHub delivery

Repository access was corrected on 17 October 2026: the ChatGPT Codex Connector installation previously selected only banksawan-radar; banksawan-yellow-relay is now also selected. The isolated fix branch was successfully created via the GitHub integration. No production branch or Railway state was changed. Draft PR and CI use the fix branch. Local implementation reference is 8b792926c68f088990b85c157c870fbc5f32f09d; the remote commit identity may differ because the connector creates the commit. Android compile results are pending until the review workflow completes.

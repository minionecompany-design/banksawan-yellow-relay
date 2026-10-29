# YELLOW V17 — four-timeframe second-signal implementation gate

Status: DESIGN / NOT IMPLEMENTED / NO DEPLOY. Source baseline: deployed V16 SHA 381823f7ce773c6c7e276c6833f47fbac481f5ed.

## Invariants
- One APK; preserve original LONG A and FCM for 1m, 5m, 15m, 1h.
- Universe at most 50; price <10 USDT, 24h change >+1%, quote volume >10M.
- No extra Binance REST, WebSocket, third-party paid API, orders, or automatic ENTRY.
- Existing V16 1m WATCH_ONLY must remain functional until V17 lane tests pass.
- Output WAIT / PRIORITY / AVOID / OFF, with entryAllowed=false and no TP/SL.
- Two-hour maximum from each original LONG A bar close, no fabricated historical reconstruction.

## Critical implementation findings from deployed V16
- scanner/src/yellow-v16-watch-monitor.js only captures timeframe=1m and consumes only native 1m closed candles.
- scanner/src/entry-readiness-v3.js and scanner/src/entry-continuation-v4.js reject non-1m LONG A and require sequential 1m bars. Therefore simply enabling the feature for 5m/15m/1h is incorrect.
- scanner/src/second-signal-compositor-1m.js also rejects non-1m events.
- The 1h lane can observe only two newly closed 1h bars in 120 minutes. Must use as-of lower-timeframe evidence and prior 1h history, with no lookahead. It must NOT inherit 1m thresholds unchanged.

## Implementation acceptance plan
1. Add separate per-lane monitor state keyed by exact native LONG A event ID and timeframe, with bounded records, independent risk latch and 120m expiration.
2. Preserve V16 1m logic; adapt 120m lifecycle with explicit unit tests before modifying live 1m monitor.
3. Implement 5m, 15m, 1h decisions as distinct research-only functions, using only native as-of candle history. Define and register lane-specific hypotheses and thresholds BEFORE evaluating results. Do not copy the 1m compositor.
4. Reject missing/out-of-order closed candles, restart, stale quote, future timestamps, mismatched event identity and unsupported TF. Fail closed to OFF. Keep AVOID sticky for same episode.
5. Add bounded decision trace: event ID, TF, closed candle timestamp, status, reason, data-freshness and transition time. Never log secrets, full market payloads, or high-volume tick streams.
6. Extend /api/home response schema with lane-aware monitor data; update Android validation and HOME labels only after API contract tests. Preserve TradingView links and 4TF FCM.
7. Test no extra network connections, memory cap, per-symbol 50-slot universe, expiry at 120m, PRIORITY freshness, no ENTRY/TP/SL, and 1h two-bar boundary. Test Android Robolectric and signing.
8. Run CI and read-only production smoke; require explicit review before Railway rollout or signed APK distribution.

## Release gates
NO GO until implementation, tests, independent review, and device verification pass. No Railway or APK changes from this design PR.

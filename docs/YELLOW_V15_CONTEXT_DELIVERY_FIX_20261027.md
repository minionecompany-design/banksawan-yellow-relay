# YELLOW v15 backend follow-up: native context delivery

## Problem and final behavior

The LIVE `onKline` path captured a frozen analysis context immediately on a 1m append, before awaiting the original strategy drain. The optional analysis accepted only the 1m hook. When a matching native 5m/15m/1h close arrived afterward, the original Pine drain retried correctly but the entry watch never reassessed that minute. A valid confirmation exactly at such a boundary could be permanently missed as `DATA_EMPAT_TF_BELUM_LENGKAP`.

The regression reproduces this missed confirmation with the old context and then exercises the actual `onKline` path. The fix keeps an optional, symbol-local queue of at most four closed 1m bars. Original strategy/ledger/FCM processing runs first. Any subsequent native TF append can release queued minutes once all four real histories are complete at that minute. Every minute is delivered once, in order. Future bars remain excluded by `closedHistory`; there is no synthetic HTF aggregation or historical repair of an already-assessed minute.

The existing strict >90s confirmation-lag rejection remains in the entry engine. Expired queue items still advance continuity/paper observations but cannot mint an entry. The existing work loop drains timeouts without waiting for a new message and avoids delivery while that symbol's original strategy job is running. Overflow is counted and the existing watch gap detection rejects the resulting broken sequence. Optional delivery errors fail open to the original scanner.

`/api/status.analysisDelivery` adds aggregate queued/deferred/delivered/pending/timedOut/overflow/rejected counters for current tracked books. Counts reset when a book is discarded; they are not a durable accuracy metric. No new REST call, WebSocket subscription, order, FCM message type, variable, resource or Android change.

## Verification

- All 254 Node tests passed with `node --test --test-concurrency=4 scanner/test/*.test.js`.
- Six delivery regression tests include the real `onKline` confirmation case and all 24 arrival orders of four native closes at an hourly boundary.
- Three offline-candidate tests cover two-right-candle pivot availability, causal future exclusion, immutable first plan, missing context and paper gaps.
- The unrestricted-concurrency local run hit an existing 5s child-process startup timeout in the read-only maintenance test under load (253/254). The complete bounded-concurrency run passed 254/254. Scoped CI now limits test-file concurrency to four; no test assertion/timeout or production guard was weakened.
- No Android source/version/signing change. Existing permanently signed APK v15 remains the intended update; a backend-only deployment needs no new APK.

Production deployment/acceptance is recorded separately after the exact tested commit is rolled out. The previously deployed source was `86de4bd0ed18ed32ce92ac0942ad2fee24888c0f`; it remains active until deployment acceptance.

## Entry research result: alternative not promoted

The fixed offline specification is in `YELLOW_ENTRY_CANDIDATE_V2_20261027.md`. The comparison included all 16 retained HOME events plus the original known AIN05:19 event. Fifteen cases had buffered candles; two NOM cases were unavailable because the symbol was no longer buffered. Dataset files, raw SHA256 values and actual event identities are retained in `evidence/entry-research-20261027/manifest.json`; `comparison.json` contains every result, not just favorable examples. Research export made no extra Binance requests.

Only three of the 15 six-hour watch windows were complete. Baseline produced zero confirmations (three complete no-confirmations, twelve censored windows). Candidate produced three confirmations at two unique symbol/time moments: HUMA once and two overlapping BEAT events. All three paper observations were NOT_ENTERED: the first full minute's open was outside the frozen entry zone. There were zero simulated fills, so no win rate or accuracy improvement can be estimated. Ten remaining candidate windows were censored without confirmation, two complete windows had none. The original AIN05:19 case still had no entry near08:34 under either method.

The alternative remains offline. It is not imported by the service or Android. Delivery correctness is a demonstrated fix; a more accurate entry method is still an unproven research objective. Correlated signals, currently retained coverage, assumed HTF arrival at close, assumed costs and absent historical ticker/quote eligibility prevent treating this small comparison as a representative trading backtest.

Reproduce locally without network:

```sh
node scanner/scripts/compare-entry-candidate.mjs docs/evidence/entry-research-20261027/manifest.json
node --test --test-concurrency=4 scanner/test/*.test.js
```

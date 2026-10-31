# V16 native forward observation — audit and activation gate

Decision: code is proposed for a bounded passive pilot only, after CI and owner approval. Production activation is NOT authorized by this document. ENTRY / V17 / merge / APK remain NO-GO. Recorder flag defaults OFF. Zero new services, Binance requests, sockets, orders, paid APIs or dependencies.

## Verified production evidence

Read-only Railway inspection: service `yellow-live-shadow-yc94`, deployment `9840a5e1-daa0-43e6-8db7-b22c8644340e` SUCCESS, exact pinned source `381823f7ce773c6c7e276c6833f47fbac481f5ed`, one Singapore replica, existing `/data` volume; no staged changes. Config includes the NAME `YELLOW_V16_WATCH_ONLY_ENABLED`; no variable values or credentials were fetched. API independently confirms enabled WATCH_ONLY.

At 31 October 2026 15:11 WIB: FCM attempted 110 / sent 110 / failed 0, both sockets connected, request circuit closed, all 2,589 recorded REST responses HTTP 200. 52 eligible symbols, 46 covered, 50 allocated slots/max tracked. This is a bounded health snapshot, not continuous uptime or full coverage certification. Existing weight pauses and deferred bootstrap are visible; do not remove the existing guard. Sanitized source: `docs/evidence/v16-forward-20261031/live-readonly.json`.

## Why earlier evidence is insufficient

`YellowV16WatchMonitor.records` is an in-memory Map, with no journal. `view()` computes status on demand, may latch decisions, and does not save historical views. `resetContinuity()` clears records; prune removes episodes after the unchanged six-hour window. Live metrics already show 75 accepted 1M watches, 71 expired, only four active. These counters cannot reconstruct the previous 71 paths. The existing companion and quality-capture stores are different engines, not an authoritative history of V16 state transitions.

PR #28 uses a separate research collector/WS and a six-hour research protocol. It must NOT be activated for this task. PR #29 introduced the deployed in-memory 1M-only monitor. PR #30 remains a separate design-only four-TF V17 draft. None were merged or changed here.

The native WS handler labels Binance `E` as `observedAtMs` in its normalized production ticker. Thus earlier output does not distinguish exchange emission from actual scanner receipt. Preserve production normalization exactly; recorder alone receives an additional true local receipt timestamp and original exchange E. REST bootstrap tickers have no native E in this hook and are explicitly unavailable as quote evidence.

## Passive architecture and evidence semantics

Two existing source files gain guarded, synchronous fire-and-forget hooks. LONG A ledger and awaited original FCM delivery stay ahead of capture. Native 1M candle receipt and existing deferred four-TF context delivery are separately recorded. No await, filesystem I/O, network or decision veto is added to scanner callbacks. A worker imports the unmodified V16 monitor, evaluates a private watch from the same native inputs, and records transitions independently of whether HOME is opened. Existing LIVE monitor, Android, FCM and scanner algorithms remain byte-identical.

`STATE.decisionSource=PASSIVE_V16_MIRROR` is a passively evaluated V16 decision, NOT a historical claim about a phone's screen or exact time of an HTTP `view()` call. The private monitor uses original ticker timing for V16 decisions; journal quotes separately retain receipt and exchange times. `observationStatus=OFF` / `dataQuality=INCOMPLETE` permanently marks an episode with a gap, even if the raw private monitor later reports WAIT. This does not change any production colour. WAIT=PANTAU, PRIORITY=PANTAU PRIORITAS, AVOID=HINDARI, OFF=DATA TIDAK TERSEDIA.

Per event: START includes original ID, symbol, LONG A reference/time/WIB, native signal OHLCV and received four-TF context. BAR holds every subsequent native closed 1M OHLCV and observed excursion. CONTEXT stores incremental native higher-TF/1M context as received, not a backfill. CLUE stores V3/V4 states/reasons, volume, pullback and continuation evidence. STATE records each status/reason/quality transition once, with native reference price and its timestamp. Same-event AVOID latch and five-minute priority freshness use unchanged V16 logic; no parameter fitting.

Ticker inputs are processed individually in worker memory. Durable ten-second buckets preserve count, first/last quote and high/low quote with ORIGINAL receipt/exchange timestamps, 24h quote volume, cumulative MFE/MAE. Exact quote sequence inside a bucket is not retained; no intrabucket ordering or fill claims. Transitions keep their actual reference price/time separately. Buckets reduce disk traffic; native bars and status transitions are not sampled. A worker tick flushes the last bucket even if quotes stop. MFE/MAE are observed prices only, never guaranteed continuous market extrema.

The first post-signal candle can begin before actual LONG A detection. Its full high/low is therefore excluded from excursions; only its closed price and post-detection native tickers are eligible. Subsequent full candles are eligible. Missing minutes, future/invalid timestamps, quote latency >=30s, stale candle >=90s, WS disconnect or missing monitor context produce incomplete/OFF evidence. No future historical quotes are fabricated.

Primary outcome window is exactly 120 minutes from LONG A candle-close timestamp. Native bars ending at the boundary are accepted; up to 90 seconds is permitted to receive the already-closed boundary bar. No price after the boundary is counted. Existing V16 six-hour LIVE validity is untouched. Additional six-hour research is deliberately not implemented here.

## Persistence, bounds and recovery

Existing mount only: `$YELLOW_DATA_DIR/v16-forward/YYYY-MM-DD.ndjson`. Daily SHA256-linked sequences, 128 MiB TOTAL hard cap, 128 KiB line cap, 72-hour retention plus a daily segment boundary (up to <96 hours). Expired complete segments are removed at startup/day rollover. Capacity exhaustion stops recorder, never scanner; active evidence is not overwritten to make room. It is therefore possible to stop before a complete window under extreme load; report missingness rather than conceal it.

At most 100 active episodes, 10,000 retained event IDs, 256 messages outstanding; snapshots share scanner's existing 190-bar-per-TF bound. Recovery streams 64 KiB chunks and retains only lifecycle IDs; worker old-generation heap capped 128 MiB (this is not a bound on total process RSS). Batches write/fsync on worker, normally at most four flushes/sec. ACK/durable head is published only AFTER fsync. Parent `/api/status.forwardObservation` shows enabled/ready/pending/active and latest durable hash/bytes. Bucket data can be lost during abrupt termination for up to roughly 11.25 seconds; a restart censors the whole unfinished episode.

Single-writer `writer.lock` uses exclusive creation. Graceful SIGTERM waits up to three seconds for worker close; crash leaves lock and stops recorder on restart, while scanner continues. Operator must verify no writer before removing a stale lock. After that, retained hashes are verified; unfinished events receive exactly one INCOMPLETE/PROCESS_RESTART finish with unknown extrema (previous detailed rows remain available). Original monitor opportunities are never restored from journal. Torn/corrupt journal is preserved and fails closed; no silent tail truncation. Archive/quarantine the damaged segment only after review and keep a report of the gap. Symlinked journal files/root are rejected.

Hash chains detect modification/reordering within retained segments; they are NOT signatures, external authentication, proof of omitted segments or proof of market truth. Export and retain the durable per-day final hashes externally during the approved pilot. `report-v16-observation.mjs` verifies every retained chain before reporting; an unfinished record is explicitly unfinalized, with no completeness claim. Retention can remove older segments: export before expiration if longer evidence is needed. No credentials are accessed by recorder or report tools.

## QA and separated results

Synthetic tests cover 120-minute completeness, future/late ticker, gaps/disconnect, invalid clocks, AVOID latch, priority expiry, duplicate IDs, restart censoring, real worker/fsync/close, ten-second bucket extrema, storage/lock/corruption/retention, partial first-candle bias and bounded worker failure. Existing 4TF strategy, FCM, universe, request-budget and Android contracts run unchanged. Baseline parity verifies critical source files and all Android files against the deployed SHA, original vs current native socket/universe behavior under throwing observation hooks, and a complete six-hour V16 state replay.

A test initially marked a candle-only synthetic window complete; after quote-gap enforcement this correctly failed. The fixture was fixed to supply a continuous synthetic quote stream; the collector was not relaxed. Archive validation initially hashed gzip bytes, while the existing manifest authenticates decompressed JSON. The reader was fixed to follow the established manifest contract; no archive or manifest was modified.

Archived replay separately authenticates all 28 saved 1M cases from the existing 46-case manifest (18 other-TF cases excluded from recorder evaluation). Receipt times are SIMULATED at close+1 second; historical ticker coverage is absent. All are incomplete for prospective evidence, regardless of candle coverage. Full replay is a CI artifact; the committed summary includes original archive hashes and transitions. This is NOT a prospective cohort, and no win rate is calculated.

Natural prospective recorder episodes: **0**. Recorder has NOT been deployed. The production FCM/health snapshot is not recorder acceptance evidence.

## Candidate table — archived replay only

The following rows use verified saved OHLCV, with 120 subsequent candles each. Status sequences are private V16 REPLAY results, not reconstructed LIVE screens; no historical eligible ticker exists. Prices are LONG A references. See the adjacent JSON for exact per-transition timestamps and reasons. These are separate from prospective results (none).

| Simbol | LONG A (WIB) / harga | Status awal | Status lanjutan (replay) | Max naik teramati | Max turun teramati | Kualitas data |
|---|---|---|---|---:|---:|---|
| AINUSDT | 27/10 05:19 / 0.07383 | PANTAU | PANTAU | +0.0000% | -11.1337% | Arsip candle; ticker/receipt historis tidak tersedia |
| AINUSDT | 27/10 12:56 / 0.11592 | PANTAU | PRIORITAS → PANTAU | +24.1201% | -10.7402% | Arsip candle; ticker/receipt historis tidak tersedia |
| EVAAUSDT | 28/10 00:11 / 0.745 | PANTAU | PRIORITAS → PANTAU | +14.0940% | +0.0000% | Arsip candle; ticker/receipt historis tidak tersedia |
| JCTUSDT | 27/10 21:57 / 0.007416 | PANTAU | PANTAU | +3.9374% | -2.2114% | Arsip candle; ticker/receipt historis tidak tersedia |

BULLA, HAEDAL, PUMP and VIRTUAL have no verified 1M event in this pinned archive cohort; no invented outcome is entered. AIN's 05:19 and 12:56 events are different episodes; do not attach the later rally to the wrong 120-minute cohort.

Case A (down/no recovery): no evidence yet that HINDARI is early enough in real receipt time; archived candle-only replay cannot establish that. Case B: later AIN yields first PRIORITY at about minute 112; whether that was useful/early enough remains unproven. Case C: EVAA yields first PRIORITY around minute 36 without requiring pullback; subsequent priority expiry/reconfirmation is recorded. Neither result authorizes entry or a threshold change. Same-event AVOID latch prevents RED→YELLOW flicker in production code, but missing data overrides it as OFF for safety. Priority expiry is independent of six-hour episode expiry.

## Performance / Binance / cost risks

Recorder has no Binance client. It receives the existing normalized stream and native candle book; no sockets, subscriptions, REST weight, reconnect retries, orders or FCM sends are added. Baseline guards and four TF notifications remain intact. This does not guarantee Binance will never return 418/429/451 for unrelated existing activity.

Worker isolation removes disk/fsync latency from scanner callbacks. Structured cloning context still uses CPU on the main thread; bounded queues/heap do not make it free. Pilot must measure scanner event-loop/CPU/memory/volume on the existing 0.5 CPU / 500 MB service. No new billable service or paid API is created; extra compute/disk on the existing Railway plan cannot be promised literally free by code alone. Do not provision or upgrade resources; if existing headroom is insufficient, keep OFF. High-rate ticker buckets and daily retention reduce writes; hard-cap exhaustion is a censored cohort, not success.

## Rollout procedure — PREPARED ONLY, owner approval required

1. Review the Draft PR and exact successful CI SHA; confirm Android tree, strategy/FCM/filter/guard source parity. Preserve `381823f7...` as rollback source. Do not merge PR #30.
2. With explicit owner permission only, select this reviewed backend commit for the SAME existing service/environment; keep one replica and `/data`. No new volume/service, signer or APK. Keep the existing WATCH_ONLY flag and all original settings. If overlap is possible, old and new recorder must never share a writer simultaneously; lock fails safely until the old process exits.
3. Add only `YELLOW_V16_FORWARD_OBSERVATION_ENABLED=true` and apply the reviewed backend commit together. This document does not perform that operation. Existing deployed source does not contain recorder, so flag alone is insufficient.
4. Verify `/api/status`: both sockets healthy, original FCM, maxTracked 50, monitor1m WATCH_ONLY, forwardObservation enabled/ready, pending bounded, durable bytes/hash advancing. Observe a genuinely NEW 1M LONG A; do not fabricate an event or fetch historical candles. Check native signal candle, receipt/exchange timing, every state change, gap markers and eventual 120-minute finish. Monitor CPU/memory/disk and existing requestGuard; no signed APK or orders.
5. Read/export journal through an authorized existing operational shell only, without printing environment values: `node scanner/scripts/report-v16-observation.mjs /data/v16-forward > v16-verified-report.json`. Export before retention; store hash receipt separately. Require at least one naturally complete window plus a reviewed incomplete/disconnect/restart case before claiming pilot acceptance. A zero-event run proves neither capture nor quality.
6. If worker is disabled, capacity reached, scanner latency/FCM health deteriorates, or journal verification fails: stop pilot. No automatic production action is implemented.

Rollback after owner approval: disable only the new recorder flag and/or pin source back to `381823f7ce773c6c7e276c6833f47fbac481f5ed`. Preserve volume/evidence and V16 WATCH_ONLY/FCM settings. Do not reset scanner ledgers, delete the service, change region, alter request guard or reinstall APK. This reverts recorder without touching the four-TF strategy. A crash/stale lock requires operator review before any reactivation.

## Readiness

GO for code review and a bounded passive pilot conditional on successful exact-head CI, owner approval, and current existing-volume/CPU/memory headroom check. NO-GO for activation without approval, prospective accuracy claims, production ENTRY, TP/SL, V17, automatic orders, or a new APK. Any insufficient natural evidence stays explicitly INCOMPLETE/UNAVAILABLE.

## Journal envelope and review commands

Each JSON line is `{sequence,previous,receivedAtMs,provenance,type,...payload,hash}`; hash is SHA256 of the exact JSON envelope excluding `hash`. Sequences start at zero for each UTC daily segment. Timestamps are integer Unix milliseconds; the START also gives WIB. Event IDs are the original `SYMBOL:1m:CANDLE_CLOSE_MS:LONG_A`, never fabricated from restart time.

Types: SESSION, START, BAR, CONTEXT, CLUE, STATE, TICKER_BUCKET, GAP, FINISH. FINISH outcomes are OBSERVED (coverage complete, not profitable), INCOMPLETE or EXPIRED. Storage/worker failures appear as disabled recorder and an unfinalized journal; these must be treated as failed/incomplete collection, never successful monitoring. No outcome is a trade result.

Synthetic standalone example: `docs/evidence/v16-forward-20261031/synthetic-candidate-example.json`; authentic synthetic journal/report is generated in CI artifacts. The example has 120 candles / 480 synthetic quotes and approximately 743 KB persisted data. It is not a natural signal. The read-only report includes hash endpoints, transitions, clues, gap reasons and final excursions.

Local QA before submission: 349/349 Node tests and 15/15 Python security/signer tests passed. GitHub Actions is the final gate and its exact source SHA/run must be checked independently.

Read-only Railway resource snapshot (61 samples over preceding hour): current memory 0.2178 GB, sampled peak 0.2460 GB; current disk usage 0.1302 GB; CPU_USAGE current 0.0219, sampled peak 0.0628 in Railway's returned units. Configured memory limit is 500 MB. These values suggest some initial headroom but do not measure recorder overhead or available volume capacity. Recheck free persistent storage and actual billing/headroom immediately before any approved pilot; do not infer free capacity from DISK_USAGE alone.

# PR28 audit and forward shadow delivery —28Oct2026 WIB

Audited source:9513be09ecbb4ef15c7a3d7b9dfa02c07891be4a, all12 PR28 files plus inherited V3, v15, structural second signal, delivery, API, journal and release contracts. Its recorded CI40620156240 is SUCCESS. Current changes remain research-only in the SAME draft PR. No merge, Railway mutation, production import, Pine edit, new APK, new notification or paid API.

## Quantitative decision: NO-GO LIVE

Reproduced all46 archived cases,28 genuine1M and18 explicitly excluded non1M;15 complete six-hour windows,13 censored,3 further missing sources. Baseline v15:0 candle confirmations. V3:1 HUMA pullback, NOT_ENTERED. V4:0 entry confirmations/fills.18 events show a structural continuation pattern; this is not an entry win rate. Compositor YELLOW7746 / RED19 / OFF15 / GREEN0, with3 PANTAU transitions. These totals are unchanged after safety fixes. Historical GREEN cannot be reconstructed without as-of quotes.

Exact first gates distinguish two different AIN alarms:

| Original event | Pattern close | Risk | Resistance / room | Finding |
|---|---:|---:|---|---|
| AIN1M original27Oct05:19WIB,1793053140000 |0.07968 at+350min |3.1280% |0.07970 /0.0080R | Known overhead far too near versus1.5R requirement |
| AIN1M later27Oct12:56WIB,1793080560000 |0.1288 at+112min |3.4867% | Unknown | PANTAU priority; entry blocked despite acceptable stop risk |
| EVAA1M28Oct00:11WIB,1793121060000 |0.7849 at+36min |2.2793% | Unknown | PANTAU priority; entry blocked despite acceptable stop risk |

Later AIN pattern also fails5m recovery and another has6.1856% risk. EVAA has six unknown-overhead patterns and one room0.102R pattern. All pattern gate values, volume and timestamps are now in `patternGateTrace`, including failed cases. Unknown resistance remains unknown, never automatically safe. Rules were not loosened to make these known winners pass.

## Technical findings fixed

1. The legacy fresh-quote helper permits a small future clock skew. Research compositor and V4 now reject future quote receipts; forward reducer additionally checks exchange event time and requires a subsequent quote after confirmation. LIVE helper is preserved.
2. One engine's target completion previously returned OFF before evaluating another engine's RED. Real stop/structure/trend risk now wins before target completion. Still exactly one output, never two HOME lamps.
3. V4 quote-boundary evaluation was stateless. New pure quote observer permanently invalidates the plan on an observed stop/target; a later rebound cannot revive GREEN.
4. Release gate checked sample counts and boolean baseline review without requiring independently reviewed improvement. It now rejects inconsistent/invalid denominators and requires a hash-identified frozen-protocol/holdout/net-baseline/false-signal review. This is an attestation to reviewed evidence, not automatic statistical proof. `deploymentAuthorized` is always false.
5. Passive HOME/analysis GETs can publish the existing v15 green through `assessment()`. The new reader deliberately allowlists only events and buffered-candle GETs; it never calls those publishing routes.
6. A symbol may leave the scanner before warmup GET completes. A404 now records/censors that failed symbol and continues other candidates; it does not lose the entire cohort or backfill that opportunity.

## Forward mechanism prepared

`forward-shadow-1m.js` is a causal reducer; `forward-shadow-journal.js` commits every normalized input, original raw market message and output to a bounded SHA256-chain fsynced WAL. Exclusive writer lock, deterministic replay, corruption/torn-tail rejection, source freeze, clock reversal, queue/storage/symbol bounds and restart censoring are covered. Old watches cannot be repaired; new events after restart use a new context generation.

Standalone `collect-forward-shadow-1m.mjs` defaults to a network-free plan. Explicit collect mode reads original new LONG A events, takes pre-signal warmup and observes separate free native Binance streams. It records original price/24h stats, closed OHLCV, native exchange and LOCAL receipt times, relative-volume/gate evidence, percent since A, per-lane comparisons, ONE compositor/priority transitions, candle-paper and independently quote-observed paper. Native arrival can defer processing at most90s without backdating. All failures stay in the denominator. Overlapping windows on a symbol are one connected episode.

PANTAU PRIORITAS always means YELLOW/non-entry. ENTRY MENDUKUNG is GREEN only with confirmed setup, eligible fresh subsequent ticker, valid window/zone and no risk veto. HINDARI means conditional RED risk. OFF marks completion/expiry/gap. No phone UI has been wired to this research compositor.

Quote-paper exits are `OBSERVED_*`, not claims about the unsampled market path. A30s ticker gap censors a position;14bps is an assumption, LTP is not executable ask, spread/slippage remain unverified. No use of a later candle's earlier high/low to exit a ticker-entered position. TP2/3 are diagnostic references, not separate executed profit.

## Validation and preserved evidence

Local317/317 Node tests pass, including21 new forward/guard tests;15 Python permanent-signer/security tests pass. Initial source94d6b939 passed CI40637397726 (316 tests), Android compile/Robolectric, archived replays and signer guards; signed release SKIPPED. The warmup404 follow-up adds one regression and requires its own final CI, recorded in PR metadata and follow-up receipt after verification. New synthetic WAL/restore acceptance is uploaded separately and clearly labeled NOT market performance. A release job must remain SKIPPED.

Durable evidence: `docs/evidence/forward-shadow-20261028/audit-summary.json`, compressed full v15/V3 and V3/V4 replays, local test log, synthetic acceptance and its raw journal, plus production read-only receipt. Hashes accompany evidence; local synthetic receipt explicitly says sourceDirty=true rather than pretending it ran the already committed source. Future CI uses its exact clean commit.

Production verified separately: Railway configured source112023d50ad297eba36b9acd539450fc53ce2de3, same deployment8ba1397d, SUCCESS, no staged/pending work. API healthy,50/64 eligible scanned, ticker/kline connected, FCM52sent/0failed. Research sent0FCM. Production watch/live-market/live-main/live-fcm and Android build config compare unchanged against source112023d.

## What is still needed

Genuine prospective market events collected by this new observer: **0**. No background service was installed or deployed. A bounded public WS handshake from Work received a genuine24h ticker at local1793164859286 / exchange1793164859035; this proves a ticker connection/schema only, not continuous native-close coverage or a forward LONG A cohort. Need a continuous separate host/durable directory, synchronized clock and monitoring, then all new successes AND failures through complete windows. Observer receipt is not the production scanner's native receipt. Need independent cohort/coverage, executable-cost/spread review, false RED and missed-winner audit, measured improvement versus baseline, and a separately tested Android/FCM/persistence integration before any release request. Synthetic restart/CI success cannot satisfy those gates.

Operational protocol and exact commands: `docs/YELLOW_FORWARD_SHADOW_PROTOCOL_20261028.md`. The prepared collector is reviewable; real performance and continuous-host certification are still NO-GO. Explicit owner approval is required for any later merge, Railway deployment or APK publication.

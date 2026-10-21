# YELLOW GOLD — offline quality comparison and production audit

18 October 2026 WIB. Existing draft PR #8 only. **NO-GO for GOLD-only delivery.**
This is a research implementation and a reviewable next step, not a live quality upgrade.

## Verified current production

- Repository: minionecompany-design/banksawan-yellow-relay.
- Production branch: yellow-long-a-v2-20261015, commit `b31412b36634b207852901aac2cf37325e4c6870`.
- Railway project: banksawan-yellow-v2 (`f90b3116-25bc-4af8-ade4-0552625d60ca`).
- Service: yellow-live-shadow-yc94 (`5a0486e7-27d9-43fd-8d05-f80ffe381a26`).
- Production deployment: `798a6f91-6ec5-4f57-90bf-b4d75be5c00e`, SUCCESS, created 18 October 11:06:57 WIB.
- Source pinned to the production commit above; no staged changes when read.
- One replica; existing /data volume yellow-journal-singapore, 512 MB.
- PR #12 is already merged and live. Alert TFs are **5m,15m,1h**. All four TFs remain calculated internally. This audit does not re-enable 1m.
- Latest audit API snapshot: 18 October **11:39:32 WIB**. ok=true, tickerConnected=true, klineConnected=true, wsRecovering=false, eligible=27, covered=35, uncoveredEligible=0, maxTracked=50, cooldownSymbols=0.
- Request guard: 162 responses 200, cumulative local weight=475, circuitOpen=false, remotePaused=false. One prior soft header pause is not an HTTP 418/429 ban. These counters cover this process, not all account/IP traffic.
- FCM enabled; attempted/sent/failed=0/0/0 on this process. Earlier FCM log evidence below belongs to prior deployments. A zero current-process count does not mean prior signals never happened.
- Research enabled=true, initialized=true, accepted=0, updated=16, persisted=7, rejected=0, storageFailures=0, pendingRecords=37, lastFault=null.

The capture bridge starts with an empty record map. A nonempty map after initialization with accepted=0 is API-reported evidence of restoring previous records, and seven successful save operations are reported in the new process. This is stronger than the initial 17 October audit. It is NOT an independent inspection of the file or an identification of each restored event, and does not prove all 37 outcomes are complete. `pendingRecords` counts all retained statuses, not only pending horizons.

## Findings and risk

| ID | Risk | Finding | Implication / minimum next step |
|---|---|---|---|
| Q01 | P1 | Recorder payload is unavailable through the existing read-only API/platform tools. No raw natural OHLCV has been obtained in this audit. | Do not choose live GOLD thresholds. Export existing `/data/yellow-gold-research-v1.json` read-only using authorized operator access; never fetch replacement Binance candles. |
| Q02 | P1 | PR #12 checks disabled TF before ledger acceptance and the passive research hook. New 1m LONG_A is suppressed before research capture. | Keep no-1m notifications as requested; separately review moving/adding a bounded research hook before the publication gate. It must be research-only, deduped, fail-open and must not write HOME/send FCM. Not implemented in this PR. |
| Q03 | P1 | 15m/1h lower-TF request.security behavior differs between historical and causal realtime modes; existing offline tests demonstrate the selected context ends. | No TradingView parity PASS. Pair exact marker bar-open with backend bar-close, chart settings and context; do not compare different TFs as detection delays. |
| Q04 | P1 | Original bootstrap/context race and whole-symbol ten-minute retirement remain. | Quality scoring cannot fix readiness misses. Next runtime fix must buffer subscribed closed bars across bootstrap and be tested with fake data; no new Binance requests/connections or limiter changes. |
| Q05 | P2 | Current coverageRatio=35/27=129.63%, counting retained ineligible symbols. COLD/RESUMED are bootstrap provenance, not dynamic readiness. | Eligible coverage is 100% at this snapshot; do not infer 35 ready lanes or every TF ready. Propose eligible intersection and per-lane cursors/context freshness separately. |
| Q06 | P2 | V1 outcome metrics omitted entry=0 and called a candle-end bound an exact first-crossing time. | Fixed OFFLINE in this draft: MFE >=0, signed MAE <=0; report the +5% candle interval. No runtime outcome/delivery change. |
| Q07 | P1 | V1 has uncalibrated range/volume/MA thresholds; its continuation branch can overlap earlyBase and has no separately verified re-arm state. | Compare fixed tiers before tuning. Do not call paths validated birth/continuation/re-arm detections on historical AKE/FF/NMR/ORCA/MET. |
| Q08 | P2 | Existing FCM path is not a durable retry outbox; research writes can lag and runtime does not flush recorder on SIGTERM. | Keep separate from quality. Prepare scoped offline fault/restart tests before any future runtime change. No production restart for proof. |

No BR service, storage, algorithm, cooldown or APK was touched. YELLOW live code, alert subset, cap, guard, FCM, HOME, APK and env are unchanged by this PR update.

## Natural evidence actually available

Bounded service log query: 17 October 18:45 to 18 October 11:40 WIB; filter YELLOW_FCM, maximum 100 entries; returned **37 SENT event IDs**, 26 at 1m, eight at 5m, three at 15m, zero at 1h. These are original LONG_A notifications, not GOLD-certified candidates. The final observed send is AIOT 1m at 10:51 WIB, before PR #12 deployment.

The new `YELLOW-GOLD-NATURAL-METADATA-20261018.json` preserves all 37 IDs, timestamp, TF, submission status and missing-data markers. Seven prices/detection times come from current HOME, one AIOT 15m price from the prior first-natural proof; 29 prices and every candle series remain absent. Each event's phone receipt and outcome are UNVERIFIED. Coincidence between 37 log events and the recorder count is not proof of ID equality.

| Candidate | TF | Close WIB | HOME price | Detection delay | FCM log delay | TV / phone / outcome |
|---|---|---|---:|---:|---:|---|
| AIOTUSDT | 15m | 17 Oct 19:45 | 0.05384 (prior proof) | 0.488s (prior proof) | 9.488s | prior visual, exact parity U / U / U |
| TAKEUSDT | 5m | 18 Oct 03:55 | 0.05622 | 0.613s | 8.801s | U / U / U |
| GTCUSDT | 5m | 18 Oct 05:15 | 0.23055 | 0.241s | 6.196s | U / U / U |
| LSKUSDT | 15m | 18 Oct 06:00 | 0.21544 | 0.579s | 6.240s | U / U / U |
| TRUTHUSDT | 15m | 18 Oct 06:15 | 0.019124 | 3.074s | 10.990s | U / U / U |
| GTCUSDT | 5m | 18 Oct 08:30 | 0.23757 | 0.056s | 4.965s | U / U / U |
| SANDUSDT | 5m | 18 Oct 10:15 | 0.06139 | 2.019s | 8.454s | U / U / U |
| EDUUSDT | 5m | 18 Oct 10:50 | 0.07977 | 1.582s | 4.772s | U / U / U |

All other 29 rows are retained in the metadata JSON; absence of price/candles is UNVERIFIED, not a failed trade. SENT proves FCM submission success reported by backend, not receipt/sound on the handset. The prior 13-event registry remains a separate historical cohort; do not deduplicate by symbol or invent prices for a different event ID.

## Offline comparison implemented

Original confirmed LONG_A is the input. Quality flags remain the provisional V1 design: **structure** (early base OR MA continuation), **release**, **notChasing**. No new numeric quality threshold was fitted to AGT or this cohort.

| Policy | Rule from frozen V1 flags | Natural assessed now | Natural discarded potential |
|---|---|---:|---|
| LOOSE | Keep every assessable original LONG_A | 0 / 37 | UNVERIFIED |
| MEDIUM | Keep at least two flags | 0 / 37 | UNVERIFIED |
| STRICT | Keep all three flags | 0 / 37 | UNVERIFIED |

Missing input is a fourth state, UNVERIFIED, never DROP or a synthetic loser. Empty denominators produce null, never 100% recall. This table does not mean all policies emitted zero alerts; the study has no live delivery action and lacks candles.

The tool reports reduction among assessed signals, kept/dropped IDs, potential retained/discarded at **+2%, +5%, +10% MFE**, median MFE/signed MAE/end return, adverse >=2% and nonpositive-end counts, separately for 1h/4h and all four TFs. The downside/end counts are descriptive proxies, NOT false-positive labels or realized trades. Disabled TF cost is separate from quality rejection: 26 historical 1m events would not publish under today's TF subset; their potential is unknown.

An explicit chronological split purges earlier events whose four-hour outcome reaches the validation boundary. An explicit observation cutoff excludes later candles and unobserved events. The supplied retrospective split at 18 October 07:00 WIB is for exercising the protocol only; it is not an untouched prospective holdout. Changing future candles cannot change quality or policy membership. No automatic best-policy selection exists.

Synthetic control: three fabricated GOLD/REVIEW/WEAK rows each attain +5% theoretical MFE. LOOSE retains three, MEDIUM two, STRICT one. This only proves discarded-potential accounting and illustrates its purpose; it is NOT a market result, historical AGT replay or evidence that strict filtering loses 2/3 of real runners.

## Run offline

From scanner/:

```sh
node src/quality-policy-study-cli.js ../docs/YELLOW-GOLD-NATURAL-METADATA-20261018.json /path/to/local-options.json > study.json
node src/quality-policy-study-cli.js /path/to/read-only-recorder-export.json /path/to/local-options.json > study.json
node --test test/quality-*.test.js
```

Options are local JSON: `validationStartMs`, `observedThroughMs`, `alertTimeframes`. The CLI reads a plain evidence array or an existing version=1/mode=RESEARCH_ONLY recorder export, validates each row, caps each local input at 16 MiB, and performs no network, push, runtime import or production write. Four TFs can be researched independently while today's delivery subset stays unchanged. No quota, cap of 2–5/day, or waiting for other TF triggers exists.

## Pine clarification

The prior attachment review normalized the supplied source to **v1.3 with MA7** and matched the repository reference. Earlier v1.3.7 wording was an ambiguous header interpretation; do not repeat that as a missing-source blocker without a distinct script. Source identity/settings and exact historical-vs-realtime event parity remain separate questions. Offline synthetic parity/convention tests do not certify TradingView itself.

## Final recommendation and smallest roadmap

1. Keep current raw LONG_A delivery on 5m/15m/1h; quality stays OFFLINE. No live GOLD-only suppression and no daily quota.
2. Read/export the existing recorder payload through authorized operator access. No Binance backfill, fake signal or restart. Run this study with full known cutoff and audit gaps/retention/provenance.
3. Review a separate small passive hook for disabled 1m events, keeping them silent in HOME/FCM. This is required if we want unbiased evidence of opportunities lost by the TF policy. Test error isolation, dedupe, bounded disk and actual flush behavior before requesting deployment.
4. Fix verified bootstrap/readiness and delivery reliability in separately scoped changes; do not mask missing detection as weak GOLD.
5. With natural chronological evidence, choose the least restrictive rule that measurably reduces undesirable outcomes while retaining large-potential events across symbols/TFs. Report event and distinct-symbol counts, repeated-event dependence, and non-observed universe coverage.
6. Only after review and explicit production authorization, add a lightweight quality annotation to the same APK/data plane. Research validation does not authorize changing original Pine triggers, enabling 1m delivery or combining BR complexity.

Quality cannot create an alert before the original LONG_A occurs or rescue a symbol outside coverage. Whether YELLOW finds better opportunities remains UNVERIFIED until natural candle outcomes and recall evidence exist. This PR improves the ability to measure that question honestly; it does not establish a profitable algorithm.

## Completed / blocked / permission

Local verification on Node 24.19.0: full `npm test` **203/203 PASS**, scanner top-level CI-style glob **194/194 PASS**, quality/capture subset **57/57 PASS**, live regression subset **58/58 PASS**, Python tooling **11/11 PASS**. These overlap; do not add their counts as independent tests. The 12 new policy-study tests use synthetic controls, missing/gapped data and causal invariance. Production tracked files were SHA-1 blob-compared against commit b31412b: zero changes; all draft additions are research modules/tests/docs. Remote Node 22/Android CI is a separate release gate, not proof of trading quality.

- Completed: production/PR #12 verification, Pine clarification, recorder counter review, 37-row natural log registry, offline nested-policy study, horizon metric correction, timeframe-policy cost accounting, chronology purge/cutoff, tests and draft review preparation.
- Blocked by evidence/access: raw recorder export and per-record natural outcomes; exact TradingView marker pairing; handset receipts; market-wide missed LONG_A. Do not infer these from counters or screenshots.
- Requires a separately reviewed production change: moving recorder hook, readiness/bootstrapping telemetry or fix, durable FCM outbox, graceful recorder flush, quality runtime annotations, merge/deploy/env/APK changes. None executed here.

Production and GitHub observations are timestamped above. No inference about future service state, notification frequency, trading win rate or monthly bill is made.

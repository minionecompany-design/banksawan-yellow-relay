# YELLOW 1M Pine v1.3 state repair — 24 October 2026

Status: implementation and offline validation; NOT a production deployment or a
99% TradingView parity certification. PR #20 remains DRAFT / do not merge.

## Owner request and confirmed reference

The owner requests genuine Pine LONG A notifications in 1M, with no LONG B in
HOME, polling or FCM. `BANKSAWAN LONG v1.3 7 25 99 ...` is version **1.3** followed
by input values, not version 1.3.7. Both owner Markdown uploads have identical
normalized content. The reference is
`docs/reference/BANKSAWAN-LONG-MTF-v1.3-user-supplied.pine`.

The working source before this repair is `556d2d02a45cab51fa28976e8d78d4cc92441689`;
the observed production backend is `662e0afdf80d095a1bb2485ed95ef66846b44619`.
Android remains package `id.banksawan.yellow`, versionCode 11, with the existing
UI, API origin, Firebase topic and permanent signer. No new APK is required for
this backend-only change. Clean/LAB/BR/ONE remain out of scope.

## Observed discrepancy and limits of evidence

Railway runtime logs and HOME confirmed these accepted 1M LONG_A records:

| Symbol | Close / HOME time (WIB, 24 October) | Signal price | FCM log (WIB) |
| --- | --- | --- | --- |
| ORDERUSDT | 17:40 | 0.096250 | 17:40:04.871 SENT |
| LIGHTUSDT | 18:56 | 0.269700 | 18:56:07.989 SENT |

The owner reports these correspond to B on the chart. These screenshots do not
provide exact crosshair timestamps at the disputed bars. For TradingView's
1-minute candle labels, inspect open times 17:39 and 18:55 respectively. Saved
historical indicator inputs and preceding backend lane states at these two
events are not available in the public API. Therefore this repair does **not**
claim a completed real-market replay or a proven exclusive cause for either
event. Healthy coverage (27/27 in the audit snapshot) does not prove Pine parity.

The old bootstrap seeds indicators but starts the position state flat when its
checkpoint cursor is not exactly equal to the latest closed candle. It does not
replay A/PROTECT/B/OUT. It also gates the internal A and B transitions on the
Binance notification eligibility snapshot. Both can desynchronize the cycle
from Pine, which has neither the 24h-change nor the 24h-turnover condition.

## Implemented behavior, 1M only

- `pine-v13-one-minute.js` implements the owner Pine's closed-candle A, PROTECT,
  reclaim B and OUT conditions. In particular, B does not inherit A's pullback
  requirement, 5m RSI-versus-average requirement or maximum-price condition.
- Internal A/PROTECT/B/OUT state advances independently of ticker eligibility.
  Pine's internal maximumPrice remains the owner's 30; public YELLOW eligibility
  remains **strict >1%, 0<price<10, quoteVolume/WS q >10,000,000 USDT**.
- The ONLY publishable event is a NEW eligible LONG_A. No B, PROTECT or OUT event
  is returned to HOME/FCM. Missing, future or stale ticker proof suppresses
  publication while trusted candle-state progression continues.
- Do not assume an unknown position was flat. Track uncertainty explicitly. A
  counter reset must be observed, the previous unknown pullback window must
  expire, and a closed-candle final-exit condition must be observed before
  assuming a synchronized flat state. Final exit and A permissions are mutually
  exclusive in these Pine conditions, so all possible position states converge
  to flat at that point. This certainty is conditional on the supplied indicator
  snapshots; it does not assert exact TradingView RSI initialization.
- Replay bounded historical candles internally, with **no historical ticker
  invention and no historical notifications**. If no synchronization anchor is
  available, 1M notifications remain withheld until a later live anchor. This
  can miss an A while uncertainty persists; it deliberately avoids guessing A
  during an already active/protected Pine cycle.
- A validated, revision-tagged 1M checkpoint resumes at the same cursor. A short
  gap is replayed silently when the checkpoint and required contexts are still
  covered by contiguous retained history. Otherwise rebuild from an observed
  anchor, or remain unsynchronized. Legacy 1M checkpoints are migrated through
  reconstruction, not trusted under the new semantics. Other lane checkpoints
  retain their previous behavior.
- `/api/status.pineOneMinute` reports per-symbol synchronization and anchor time.
  `YELLOW_PINE_1M_RECOVERY` logs reconstruction; `YELLOW_PINE_1M_SIGNAL` logs new
  internal transitions and whether a LONG_A is publishable. No credentials or
  personal device data are added to these diagnostics.

## Bounds, resource impact and unchanged lanes

Bootstrap still makes exactly four requests through the existing serialized REST
guard, in 1h/15m/5m/1m order, with limits 170/249/499/999 and budget weights
2/2/2/5. Total charged kline weight rises from 8 to 11 per symbol; no budget limit,
ban handling, backoff, circuit latch or symbol cap is relaxed. Bootstrap can take
longer under the same 60-weight/minute guard. No extra live polling is added.

`CandleBook` retains deeper recovery histories only for production recovery. Its
legacy snapshot still starts at the original 170 bars and grows to 190. Thus
5M/15M/1H evaluators keep their existing input-window behavior and algorithms;
their unresolved historical/realtime and cold-state limitations are not silently
claimed fixed. The 50-symbol cap, all-eligible UNIVERSE, HOME 10h retention,
event-ID deduplication and durable ledger behavior are unchanged.

## Reproducible offline validation

```sh
node --test scanner/test/pine-v13-one-minute.test.js
node --test scanner/test/*.test.js
python3 -m unittest discover -s scripts -p 'test_verify_yellow*.py'
git diff --check
```

The 17 targeted tests cover:

- A -> PROTECT -> B -> OUT -> A; expired reclaim windows; uncertain starts;
- exact Pine conditions on 2,000 deterministic indicator snapshots, with the
  reference expressions read from the checked-in owner Pine source;
- strict publication thresholds and missing/stale/future ticker proof;
- a single synthetic 1m feed aggregated into consistent 5m/15m/1h candles;
- natural chronological A, PROTECT and repeated B transitions, publishing only A;
- a reproduced false A from the legacy flat-state assumption on the same bar
  that reconstruction correctly classifies as internal B;
- silent catch-up across PROTECT/B, checkpoint validation and lost-history cases;
- actual `YellowLiveMarket.flushTracked`, ledger and send callback paths;
- full four-request production bootstrap with old-checkpoint migration;
- retained other-TF snapshot equivalence and initial down-counter uncertainty.

All market fixtures in these new tests are synthetic. None is mislabeled as
ORDER/LIGHT historical Binance data or real Google FCM delivery. The FCM callback
is offline; no production messages are generated by the tests.

The scoped QA command is intentionally the existing CI command above. The broad
legacy `npm test` additionally discovers three nested historical Android-contract
files under `scanner/test/test/`; four stale V8/V9 assertions fail against the
already-existing version 11 UI. Those files and the test runner are not changed
as part of this 1M repair; scoped regression results must not be described as a
successful unqualified `npm test` run.

## Remaining acceptance before claiming 99%

1. CI must pass on the exact repair commit. Preserve DRAFT; do not merge.
2. Compare actual 1m closed-candle inputs with the same Binance perpetual chart,
   Pine v1.3 inputs, timezone and candle type. Resolve the ORDER/LIGHT disputed
   timestamps using real preceding A/PROTECT/B/OUT and indicator snapshots.
3. Measure event precision AND recall against manually verified/exported Pine
   LONG_A timestamps for an agreed sample/interval. Do not inflate agreement by
   counting mostly non-signal candles or excluding unsynchronized intervals
   without disclosing them. Separately count any B incorrectly published as A.
4. Finite-history Wilder RSI/RMA seeding, subsequent sliding-window seeding,
   exchange/chart data differences and near-threshold rounding remain limits.
   Source-expression agreement is not TradingView-runtime agreement.
5. Obtain/verify production cutover authorization for this repair, preserve the
   production volume/checkpoints and rollback target, deploy the exact tested
   source, then check synchronization counts, coverage, guard metrics and natural
   FCM/device receipts. Do not claim this document itself deployed the repair.

Technical reference for confirmed higher-TF `[1]` with `lookahead_on`:
https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/

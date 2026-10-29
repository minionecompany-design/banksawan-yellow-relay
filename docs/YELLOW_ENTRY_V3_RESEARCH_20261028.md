# YELLOW entry V3 — fixed research specification

Status: offline candidate, not imported by LIVE or Android. All original LONG A signals, four notification lanes, HOME records, eligibility, max50 and UI are preserved. This document freezes the following rules before comparing candidate results. The known EVAA/BANK/LAB/APR cases motivated the design; they are not out-of-sample evidence. No certainty that a coin will rise or calibrated accuracy percentage is implied.

Time/volume/candle evidence is explicit. A LONG A opens a six-hour observation. All four native TF histories require100 contiguous closed candles at the expected boundary. Confirmation processing lag <=90s; a GREEN observation requires an eligible quote after confirmation and <30s old. Plan validity3min, one immutable confirmed plan per event. Data gaps/endpoints/stop/target cannot resurrect the same opportunity.

## Two setup paths

- PULLBACK: measure decline from an already observed post-signal peak, not from the original signal price. Arm on a subsequent minute low at least max(0.5% peak,0.8 ATR1m) below that prior peak. Freeze that peak for this setup; update its local dip low. Require two later closed candles with higher lows, a close above the previous3 highs and SMA7, and relative volume >=1.2 versus the preceding20 minutes. A setup expires after30min without confirmation; a later separate pullback may be assessed before the six-hour limit. Stop anchor is this setup's dip, not the lowest low of the entire six-hour observation.
- CONTINUATION: require five completed post-signal 1m candles forming a base before the decision bar. Their range <=2 ATR1m; the two last base lows must be above the base minimum. Decision close breaks the base high, exceeds SMA7, has a positive body occupying >=50% of the full candle, range <=2.5 ATR, extension above base <=0.75 ATR, and relative volume >=1.5. Stop anchor is the base low. A vertical candle without a base is not a continuation setup. No future pivot labels or later highs may revise a decision.

Both paths require current5m close>SMA7 OR a closed5m recovery with close>previous5m close and low>=previous5m low. At least one of15m/1h must be UP and neither DOWN. Evidence includes individual TF states and counts; four simultaneous LONG A signals are not required.

Each formed path gets its own risk/room check; a rejected pullback cannot veto a separate valid continuation base. If both are valid on the same minute, PULLBACK has deterministic priority. The first implementation accidentally evaluated only PULLBACK when both formed; a regression test fixes that routing omission. Initial and corrected batch outputs are retained. No thresholds were adjusted after inspecting the outcomes.

SL=setup anchor-0.25 ATR1m. Risk0.3–5%; retain V1 known nearest overhead resistance >=1.5R and unknown-room rejection to avoid changing every gate at once. Entry zone=confirmation close-0.10/+0.25 ATR1m, targets1R/2R/3R. Plan is frozen. Risk/reward limits and colors describe this heuristic, not a success probability.

## Color semantics

- YELLOW: observing / a required setup, volume, TF or data condition is absent; includes exact check values, elapsed/window times and candle counts.
- RED: a technically formed setup fails risk or known-room checks; after confirmation, an adverse trend or SL/TP boundary invalidates that scenario. RED is not SHORT.
- GREEN: one plan is confirmed, its window/context are fresh, quote is after confirmation, market filters still pass and quote is within its frozen zone.
- OFF: observation/entry window ended or continuity was lost. Expired plans cannot return to GREEN.

Before confirmation, a rejected setup may later be assessed again on new closed data. After confirmation there is at most one scenario, no moving a stop to make a losing plan look successful. A restart-safe persistence adapter and Android compatibility are separate promotion gates; this module is not production-wired.

## Evaluation

Replay every available saved actual HOME event, including losers, plus the archived known AIN case. Compare frozen V1 and V3 without parameter search. Keep unavailable symbols and censored windows explicit. Native higher-TF arrival is assumed at close; historical eligible quotes, GREEN publication, phone display and executions cannot be reconstructed. The identical V1 next-full-minute-open paper model,120min horizon,14bps assumed cost, ambiguous/gap/not-entered handling are used for both. TP2/3 are references only. Group overlapping symbol/time confirmations; event counts are not independent trades. No historical GREEN is invented in a candle-only replay.

This batch is diagnostic. Promotion requires a separate forward observation on later signals and evidence about executable entries, losses and costs. This turn does not change the LIVE strategy or its phone colors merely because a retrospective winner can be matched.

## Recorded diagnostic result and release decision

All264 Node tests pass, including10 new causal/state/color/replay tests. No production wiring, Android change, new notification type, new data request to Binance or deployment is introduced. The candidate's GREEN is directly unit-tested against eligible fresh quotes; no historical GREEN is invented in replay.

The manifest contains46 actual event cases: available retained HOME events plus previously saved cases, without filtering to coins that rose. Three cases lack buffered data (two NOM events, one INJ). Twenty watch windows are complete;26 remain censored. The saved sources span27Oct15:38 to28Oct06:18 WIB; sources have different capture times, explicitly retained. Original raw hashes are verified before each replay. Older snapshots are reused by reference when current buffers lack the initial100-minute warmup.

V1: zero candle confirmations,20 complete no-confirmations,26 censored. V3: six candle confirmations at five unique symbol/time moments, all PULLBACK; three NOT_ENTERED, one OPEN/censored, two SL_BEFORE_TP1. The two losses are overlapping CT5m/15m events at the same moment: one unique market episode, not two independent trades. Mean net return of those two priced paper records is approximately-1.8574%, under the declared14bps cost model. There are no completed winning fills in this batch. The continuation route passes causal synthetic regression but produced no independent qualifying real-data confirmation in this dataset.

EVAA no longer remains stuck solely on needing a low below its LONG A price: post-peak pullbacks are detected. It still fails later recovery/volume, risk, trend or resistance gates. BANK/LAB/APR also have no qualifying first plan in this fixed run. This is not evidence that V3 improves entry quality; it is evidence that the proposed gates can be explained and that simply enabling more confirmations is insufficient.

The initial routing-bug output and final corrected output are retained as `comparison-initial.json.gz` and `comparison-final.json.gz`. The correction did not change this batch's aggregate outcomes. Parameters were not searched or loosened after observing losses. Candidate remains OFFLINE / NOT PROMOTED. Existing LIVE source112023d and permanently signed APK v15 continue unchanged.

Reproduce without network:

```sh
node scanner/scripts/compare-readiness-v3.mjs docs/evidence/entry-v3-20261028/manifest.json
node --test --test-concurrency=4 scanner/test/*.test.js
```

# Entry candidate V2 — offline research specification

Status: experimental, not imported by the LIVE scanner or Android. Specification written before running the comparison below. No search for the best parameter or a forced entry at the selected AIN candle.

Baseline is the deployed `YELLOW_PULLBACK_WATCH_V1`, unchanged. Candidate uses the same original accepted LONG A, six-hour horizon, native closed four-timeframe history, pullback threshold max(0.5% signal price, 0.8 ATR1m), 1m reclaim of previous three highs and SMA7, relative volume >=1.2, risk 0.3–5%, known resistance >=1.5R and immutable first scenario. Processing in replay is assumed at close+1s. No reconstruction of historical ticker eligibility or GREEN publication.

Two structural changes are evaluated together, not represented as independent evidence:

1. Require two confirmed post-signal 1m pivot lows, each strictly below its two left and two right neighbors. Latest pivot must be higher than the preceding pivot, still below current close, and not breached since its confirmation. Place SL 0.25 current ATR below that latest confirmed higher low. This is an explicit new local setup; the older lower low remains a pullback observation, not a stop that can be moved on an existing plan.
2. Require the latest native closed 5m candle to close above the preceding 5m high and have a higher low. Keep the 15m/1h DOWN veto. This replaces the lagging 5m SMA7/SMA25 requirement only in the offline candidate.

First qualifying plan is frozen once per original event. Candidate paper uses the same next full 1m open, 120-minute horizon, 14bps cost assumption, gap detection and ambiguous SL/TP handling as baseline. Missing future minutes are censored; no-confirmation before a partial six-hour window is not a completed negative. This is entry-confirmation research, not LIVE GREEN/fill performance. No candidate quote feed is invented.

Validation includes causal prefix invariance, future-bar mutation, two-right-bar pivot availability, immutable first-plan behavior and gap handling. AIN is a known diagnostic case, not an out-of-sample winner. All available retained original events are included when candle buffers permit; missing symbols and incomplete windows are counted explicitly. These buffers were retained under current coverage, not a representative universe backtest. Candidate cannot be promoted on one favorable result or uncompleted paper samples.

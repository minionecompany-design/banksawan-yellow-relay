# YELLOW full eligible coverage and lane continuity

Prepared for review only. Production remains on 9d3670d; no deployment, restart, environment mutation, Binance request, or BR change in this work.

## Problem and behavior

The 24-symbol pilot retains eligible incumbents; it is not a round-robin scan of all eligible coins. Change the default ceiling to 200, which covers the approximately 86 eligible symbols in the user's screenshot. Keep the explicit environment override, validate it, and disclose uncovered eligible symbols. More than 200 eligible symbols still queues: this is a bounded capacity, not an unconditional claim of complete coverage.

Eligibility remains Binance USD-M USDT trading perpetuals, last price strictly below 10 USDT and rolling 24-hour price change at least +1%. LONG_A formula, four independent target timeframes, closed candle requirement, ten-hour HOME, event-ID deduplication and FCM yellow-only filtering remain unchanged. No promise of notification frequency or profitability follows from larger coverage.

Each symbol bootstraps four histories through the existing serial REST guard. The local 60-weight/minute budget, 750ms request gap, remote IP-weight pause and persistent HTTP 418/429/451 circuit are unchanged. Approximately 86 symbols require 344 kline calls / 688 weight for an uninterrupted fresh bootstrap, plus metadata and ticker refresh. At this budget, expect many minutes of partial coverage; nominal weight-only time exceeds 12 minutes including initial metadata/ticker. Recovery and remote pauses can take longer. Do not raise the budget to accelerate this rollout. Four subscriptions per symbol: 344 streams for 86 symbols, maximum 800 at the ceiling. No second Binance data-plane.

## Continuity and explicit limits

Persist four independent lane states per symbol on the existing volume after bootstrap and symbol drains, using serialized immutable snapshots and atomic rename. Save no credentials and no historical notifications. Restore each lane only when its checkpoint cursor exactly equals the latest fetched closed candle for that TF. A 1m gap can reset 1m while preserving 1h, 15m and 5m if their cursors match. Validate revision, symbol, counters, timestamps and state structure; corrupt checkpoints cannot be treated as trusted state.

If closed candles were missed, that lane starts cold at the latest cursor. Historical 24h ticker snapshots during a disconnect are unavailable; current tickers must never be substituted to reconstruct old LONG_A/trade state. This intentionally does NOT fully solve long outages or first installation. A first-ever 1h lane still needs a fresh pullback (at least nine target bars for the earliest count trigger, and a later valid setup). It also does not certify TradingView v1.3.7 parity. Reconstructing all historical state would require reliable as-of eligibility and reference settings, not invented inputs.

Status exposes complete/uncovered eligibility coverage and the lanes resumed/cold at bootstrap. Cold is bootstrap provenance, not a permanent readiness flag. SCANNING means a feed is covered, not that a pattern has formed or passed all gates.

## Release gate

Review PR and CI before merge/deploy. Existing production has YELLOW_MAX_TRACKED explicitly configured (OAuth redacts its value); release must deliberately set it to 200 as part of the approved deployment. A source-default change alone will not override that variable. Keep auto-deploy OFF, FCM credentials and /data. No Android change or reinstall required. First release has no prior checkpoints, so do not advertise instant 1h readiness.

After approval, deploy exact reviewed source and inspect progressive coverage, resource use, guard responses and lane state. Stop expansion safely on guard/resource trouble. Natural four-TF alerts, same-symbol repeat and phone FCM remain forward proof; no fake signal should be injected into production.

## Validation

Offline Node suite includes coverage of 86 symbols beyond the old cap; one bootstrap per scheduler pass; explicit 24 override, remote pause and invalid limits; immutable checkpoint writes, restart restore, per-TF missed-bar isolation, corrupt/future/revision rejection; real bootstrap with exactly four fake guarded responses and no historical alert delivery. Existing LONG_A, HOME, FCM, causality, API and recovery tests remain required.

Local results: 140/140 Node tests, 11/11 Python tests, JavaScript syntax and whitespace checks pass. A local fake-data capacity exercise with Node heap limited to 256 MiB loaded 200 symbols (800 fake kline calls, zero real Binance calls), then drained four closed TFs per symbol: about 273ms bootstrap CPU/filesystem exercise and 149ms drain wall time; process RSS 102 MiB, heap used 39 MiB, zero events and no halt. This excludes real network pacing, continuous partial-kline traffic, phone latency and Railway contention: it is not production load proof.

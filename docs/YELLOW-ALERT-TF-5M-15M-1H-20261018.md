# YELLOW — 5M / 15M / 1H alerts only (18 Oct 2026)

## User decision and trade-off
User explicitly requests: no 1M LONG_A notifications or HOME cards. Only 5M, 15M, 1H.
This intentionally **may miss early winners that only have 1M LONG_A**. Historical ALT and AGT showed good 1M triggers, and a 5M/15M/1H signal is NOT guaranteed after every 1M signal. Do not claim improved trading accuracy from a reduction in alert volume.

## Exact code change
- New opt-in variable \`YELLOW_ALERT_TIMEFRAMES=5m,15m,1h\`.
- Backend market constructor explicitly validates timeframe subsets, preserving default \`1m,5m,15m,1h\` if unset.
- \`flushTracked\` continues evaluating all four TFs and updating all four checkpoints, BUT a disabled 1M LONG_A is not written to HOME ledger, not sent to FCM, not made available via polling. An aggregate \`suppressedLongAEvents\` counter records silent suppressions in process lifetime.
- \`market.home()\` and \`market.events()\` filter old 1M records on read so the UI no longer shows already-present 1M records; historical ledger and claimed event IDs remain intact for dedupe and audit. Note that previously delivered phone notifications cannot be withdrawn.
- \`/api/status\` reports \`alertTimeframes\` and \`suppressedLongAEvents\`.
- Original Pine/evaluator, 5M/15M/1H LONG_A, FCM credentials/path, HOME TTL, same persistent /data, Binance REST guard, WebSockets, universe/50 tracked cap and BR are UNCHANGED.
- 1M **source candles and closed-candle processing remain active internally** because removing their bootstrap and subscribed stream is an independent, higher-risk project: current CandleBook, checkpoint and four-frame bootstrap expect 1M. This patch reduces user-facing noise only; it does not claim that REST/WS traffic decreases or fix the existing MTF bootstrap race.

## Pre-deploy gates
1. Tests: alert selection, existing ledger history retained, HOME/polling filter, 5M/15M/1H remain allowed, code ordering before ledger+FCM. Full scanner+Android CI PASS.
2. Read-only Railway status: deploy healthy, no Binance circuit open, no pending changes. Check existing proof recorder counters with the existing \`/api/status\` if accessible.
3. Deploy ONE combined change (pinned commit + \`YELLOW_ALERT_TIMEFRAMES=5m,15m,1h\`) only when authorized and after assessing current natural-evidence 24h window impact. Do not restart just to change env.
4. Verify new \`/api/status.alertTimeframes\`, HOME and event feed contain no 1M, FCM after activation is only 5M/15M/1H. Old sent 1M pushes cannot be removed.
5. Do NOT activate research GOLD-only: Quality V1 PR #8 remains separate.
6. Preserve prior production pinned commit \`633404dba077a577af44ad55b99976e50bcb9f68\` for a reviewed rollback if needed.

## Observed reason for request
From 17 Oct ~18:48 to 18 Oct ~08:50 WIB: 34 FCM LONG_A event IDs / 22 symbols, 1M=25, 5M=6, 15M=3, 1H=0. Merely removing 1M emissions would reduce **observed past** count from 34 to 9; this is retrospective count, NOT a forecast of future alert volume. It might miss a large share of early signals.

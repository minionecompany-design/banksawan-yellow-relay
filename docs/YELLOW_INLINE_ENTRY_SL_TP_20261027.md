# YELLOW — inline ENTRY / SL / TP proposal (27 October 2026)

## Goal
Show the existing **frozen** LONG A research scenario directly on the original APK HOME card after a genuine signal, without an extra click. Retain the detailed ANALISIS button.

## Read contract
- Existing, independent `YELLOW_COMPANION_V1` calculates the context **after the original FCM delivery**. The original four independent LONG A lanes, Pine v1.3, symbol filters, HOME ledger, FCM payload, notification timing, and original TradingView route are not changed.
- Read-only `/api/home` adds an optional `analysisPreview` for an actually retained HOME LONG A with complete four-timeframe context and a valid frozen plan. It contains only identity, method, snapshot timing, entry zone, SL, TP1/TP2/TP3, and two caution flags. No new exchange requests, polling, external paid service or model.
- The Android HOME card displays **ENTRY zone, SL, TP1 and TP2/TP3** at ordinary readable font sizes. The detailed existing ANALISIS dialog remains available.
- Identity is checked against the exact event ID, symbol, timeframe, candle close, event price, capture time, method and monotonic level ordering before any price appears. If data are partial or invalid, display no fabricated levels. An expired entry window is labeled clearly as historical; old HOME events are never treated as a new entry.
- Base math is unchanged: reference entry = signal close; zone = reference minus 0.10 ATR to plus 0.25 ATR (lower bound respects SL); SL = lowest of the last five target-TF candles minus 0.25 ATR; TP1/2/3 = 1R/2R/3R. Resistance/trend warnings remain descriptive. These are **conditional research levels**, not proven accurate, guaranteed executable prices, or investment advice.
- The original FCM notification **does not contain SL/TP**: source analysis runs after FCM. The user sees the levels by opening HOME once the stored computation is available. Including three prices in the *same initial push* would require redesigning delivery order and latency gates and is explicitly outside this PR.
- No automatic orders, new signal generation, TP/SL adjustments after capture, change to Pine Editor, or merge/deployment/signed release from this proposal.

## Acceptance checks
- Scoped scanner/API regression, Android Robolectric, debug compile and signed build gates when preparing a real release.
- API HOME preview only for a complete genuine event; no preview for partial/mismatched event; companion read faults leave HOME and original LONG A unaffected.
- Android rejects spoofed/cross-symbol, future, inverted or absent levels; no stale entry marketing; small-screen readable rendering; Q/W one-letter base acceptance.
- Real-phone install and new natural event confirmation still needed. Trial must report counts of missing/expired plans and prospective TP1-first/SL-first results including fees, ambiguous intrabar outcomes and exclusions before anyone calls these levels 'accurate'.

## Three-lamp HOME quality indicator (RED / YELLOW / GREEN)
- Only actual HOME LONG A events receive a per-event indicator, computed on the existing read-only `/api/home` request. No change to Pine, detection, notification, scanner universe, or additional API subscriptions.
- Indicator is **not an order, confidence probability, or win-rate**. Green means current observed price is inside the frozen entry zone and a conservative set of independent technical checks pass. Entry always remains a human decision.
- Order of evaluation: partial/unavailable/expired plan -> YELLOW; missing or stale ticker (30 s) -> YELLOW. An invalidated SL, TP1 already reached, 1H/15M bearish conflict, breakdown, resistance before TP1, or a modeled stop distance outside 0.3–5% -> RED. Price outside the entry zone -> YELLOW. Otherwise GREEN requires signal TF, 5M and 15M trend UP, no opposing DOWN trend, signal TF relative volume >= 1.2x, breakout or retest, and visible resistance room >= 1.5R. Other cases -> YELLOW. Thresholds are initial **uncalibrated research heuristics**, not measured probabilities.
- Three colored circles appear at the top-right of HOME. Exactly one is lit, accompanied by accessible text (HINDARI, TUNGGU, MENDUKUNG). A yellow pending state is allowed for old uncaptured HOME events. Invalid status is hidden.
- Android rejects status attached to a different event, evaluations older than 45 seconds, and any green/red lacking a valid still-active analysis and recent ticker. Green also requires ticker price inside the frozen entry zone.
- HOME continues to display the frozen 15-minute reference levels as historical after expiration. The light is recomputed on each pre-existing HOME refresh from live tickers; it is not a new alert.
- **Release gate remains independent of unit tests**: original permanent-signing identity, increasing versionCode for a genuine upgrade, backend/phone contract parity, natural FCM delivery, and real sample monitoring. Lack of a genuine forward sample precludes any empirical 'accurate' claim.

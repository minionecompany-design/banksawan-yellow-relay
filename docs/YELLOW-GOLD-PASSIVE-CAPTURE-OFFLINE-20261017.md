# YELLOW GOLD — Passive Evidence Capture V1 (OFFLINE ONLY)
17 October 2026 WIB. Separate from Draft PR #8 quality research.

## Purpose
Keep BANKSAWAN YELLOW as the sole lightweight APK and prevent overfitting AGT or creating another BR. Existing YELLOW logs prove LONG_A FCM SENT for AGT 1m, TIA 15m, AVA 1m, and later BASED/RSR/FOLKS/AIO/METIS/AIO-repeat/HANA/ACU/KMNO/TAKE. This does not establish those later signals were poor, nor how many were profitable. Exact 61-candle closed OHLCV as of event time is not in the accessible Railway log evidence. No score, false-negative rate or trading profitability can be claimed from screenshots.

## Implemented now
- quality-capture-v1.js: **pure in-memory, research-only** recorder. Takes ONLY a pre-existing genuine LONG_A event with matching price and 61 contiguous CLOSED OHLCV candles ending on that exact signal candle. Four target TFs are independent (1m, 5m, 15m, 1h). Missing/wrong-price/non-LONG_A/stale/synthetic events are rejected.
- Only subsequent contiguous CLOSED target-TF candles from the existing source can be appended for up to four hours. A gap marks record GAPPED, never interpolates a price, backfills or claims a complete outcome.
- Capacity: 240 records (FIFO eviction), default seven-day retention. No daily quota. No hard requirement that 5m/1m confirm each other; AGT 5m chart marker alone is not a server FCM proof.
- The snapshot/restore method validates original LONG_A, exact bar sequence, close price, future timeline and capture status. Invalid/corrupted snapshots fail instead of silently forging data.
- quality-capture-store-v1.js: optional local JSON persistence (not automatically called), serialized atomic rename, default 12 MiB size cap (allowed 4 KiB–32 MiB). Failure to persist is a research fault and MUST NEVER affect notifications.
- Four source/test files only. **No code is imported into live-main/live-market, FCM, HOME, Android, Railway or Binance.** No production scan/writes/restarts/deploy or new REST/WS.

## Tests
Run from scanner:
    node --test test/quality-capture-v1.test.js test/quality-capture-store-v1.test.js
Dedicated offline prototype on 17 Oct: 16/16 local tests passed. GitHub full-review CI is authoritative after PR creation.

## If and only if future approval to enable passive captures
1. Protect production with a separate explicit release authorization and backup; keep auto-deploy OFF and BR OFF.
2. Start opt-in only. After the existing LiveHomeLedger.accept(originalLONG_A) returns accepted:true, take a copy of the already-in-memory book snapshot for that same target TF. **Do not perform/retry any new Binance request**.
3. Best-effort research write only, never awaited inline in FCM path; swallow/counter log research failures. All existing FCM sends and HOME contents must remain unchanged.
4. On each genuinely CLOSED WS kline, advance only pending event records for that symbol/TF, never subscribe additional sockets.
5. Coalesce writes to at most once every five minutes for pending candles (plus new events), keep hard storage cap, retain seven days, monitor IO overhead.
6. Restart or WebSocket gaps must preserve truth: an unobserved candle makes the future outcome INCOMPLETE/GAPPED, not an invented winner/loser.
7. Do NOT expose research OHLCV on public endpoints; avoid logging raw personal/access credentials.
8. Compare actual GOLD candidates vs **all** original LONG_A, with true-positive retained, false-negative missed winner, false positives, signal latency and separate TF distributions using chronological holdout. Activation of GOLD-only FCM/HOME needs a **second explicit decision** after sufficient forward proof.
9. Current Pine reference provided is v1.3, screenshot labels v1.3.7. Parity and 15m/1h cold-start issues remain independent blockers.

This draft PR is a future-proof building block only. Merging it or having passing CI does not prove that naturally successful symbols (AGT/FF/AKE/ORCA/MET/NMR) will be preferred over weaker signals.

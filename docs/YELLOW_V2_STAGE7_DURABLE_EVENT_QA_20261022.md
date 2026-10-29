# YELLOW V2 stage 7 — durable event failure QA, 22 October 2026

Status: OFFLINE PASS / RELEASE HOLD. Continues PR #20 from 4e2d9f675b77676b16c012a1bc66050794e8eaea. No Railway operation.

## Proven defect and correction

LiveHomeLedger.accept previously appended the event, HOME row and duplicate claim to shared memory before awaiting atomic file replacement. If disk replacement failed, the failed event was still visible to polling and a second attempt returned DUPLICATE even though the event was never committed.

The new ledger builds a separate next snapshot, writes it and atomically renames it before publishing it in memory. Failure preserves the last successful visible snapshot and does not consume the failed event's identity. The serialized ledger queue can accept the event after the storage problem is corrected.

The market also previously continued after ledger failure while the lane cursor had already advanced. It now halts with LEDGER_WRITE_FAILED, matching the existing checkpoint-write failure policy. It does not send that failed event to FCM or save a later lane checkpoint. Fixing storage and any restart still requires operational investigation/authorization; no automatic retry loop or historical signal replay was added.

## Regression evidence

- New real-filesystem failure test: replace target with a directory so atomic rename fails; two queued attempts must both reject, previous disk snapshot stays byte-for-byte intact, failed event is absent from HOME/polling, retry after correcting the target succeeds and survives restart with deduplication.
- New market test first proves an actual four-context LONG_A fixture emits a signal using the production evaluator. The real ledger commit is then forced to fail: scanner halts, FCM sends stay zero, checkpoint writes stay zero and HOME/polling stay empty.
- Both regressions failed before their respective fixes, then passed.
- Existing observer-order source assertion now permits the guarded assignment while retaining ledger-before-observer-before-FCM ordering.
- Full local scanner suite: 190/190 pass.
- Offline Firebase/signing/upgrade policy tests: 15/15 pass.
- Diff whitespace validation passed.
- Existing real four-timeframe bootstrap/restart tests retain 47/47, 50/65 and concurrent maximum 50 coverage. Existing eight-event four-TF durable delivery test passes. All external transports remain mocked/offline in these tests.

## Release identity and limits

This change affects backend persistence handling only. Android sources and configuration remain identical to the signed candidate's source d7f9341faec50d510533e9e1e8aafcf8fec0b278; the already supplied APK is unchanged. A future approved backend deployment must include this follow-up, rather than silently deploying only the earlier APK source commit.

This does not prove physical Android update, TradingView mobile routing, real FCM receipt, real matched CEX/Binance membership, Railway recovery or power-loss/fsync guarantees. FCM remains asynchronous best effort with the existing persisted ledger/polling model; no exactly-once remote delivery claim is made. Atomic rename failure is covered; no private key or production data was accessed.

PR remains DRAFT. No merge, Railway deployment/restart/variables change, test signal sent to production, APK rebuild or strategy/filter/UI/API/signing change.

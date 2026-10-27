# YELLOW native-context fix — deployed and LIVE acceptance passed

The owner explicitly instructed completion of deployment on 27 October 2026. The previous automatic approval rejections are resolved: the same staged patch was accepted using the normal Railway tool. No alternate route or guard bypass was used.

## Deployed application and configuration

- Deployment `8ba1397d-d84d-436b-ae7d-b95c77ef79eb`: SUCCESS, created13:21:41 UTC, terminal SUCCESS13:22:29 UTC (20:22:29 WIB).
- Existing YELLOW production service `5a0486e7-27d9-43fd-8d05-f80ffe381a26` in Singapore `asia-southeast1-eqsg3a`.
- Config readback pins source `112023d50ad297eba36b9acd539450fc53ce2de3`; staged changes null. Only source.commitSha changed. Existing volume `ea9edf2d-7294-443f-854c-001265c06405` remains mounted at /data; variables, resources, domains and fail-closed guards remain intact.
- Railway deployment metadata labels commit `3c15a68fa7dba49668a6eb237e942b5c0d08b087`. GitHub comparison against tested source112023d shows exactly two documentation/evidence files added and no scanner, Android, workflow or runtime changes. We retain both identities; metadata is not represented as exact112023d checkout proof.
- [CI run40507932166](https://github.com/minionecompany-design/banksawan-yellow-relay/actions/runs/40507932166): SUCCESS for application112023d, including254 Node tests,15 Python release checks and Android compile/behavior QA/signing protection. APK v15/package/version/permanent signer are unchanged by this backend follow-up.

## LIVE verification

Read-only API contract audit PASS at **2026-10-27T20:31:24.466000+07:00**, failures=[]. Coverage **41/41** eligible symbols scanning, allocated41/50, bootstrapInProgress0. Both feeds connected and fresh. Analysis initialized, failures0, pendingJobs0;18 journal records restored. All167 REST responses in this new runtime were HTTP200, circuit closed, remotePaused false. One automatic90s IP-weight headroom pause occurred during bootstrap and resolved naturally; WebSocket analysis continued. No retry after a Binance ban, forced event, order or test FCM was used.

Native-context delivery counters at this snapshot: queued183, delivered182, deferred6, pending1, timedOut0, overflow0, rejected0. This is observed delivery behavior, not evidence of more accurate entries. The remaining pending candle is explicitly counted, not represented as already delivered; the existing90s deadline/gap rules remain active. Counters are scoped to retained candle books and reset when those books are discarded.

The18 analysis records were preserved. Eleven pre-restart watches are now DATA_GAP because quote/candle continuity across restart cannot be proven; none was revived as a retroactive entry. No confirmed or server-published GREEN sample exists yet in this snapshot. New acceptance requires subsequent natural LONG A; no entry/profit/phone fill is invented.

Full API capture is `evidence/yellow-v15-context-live-api-20261027.json.gz`, with raw/compressed SHA256 in `evidence/yellow-v15-context-fix-acceptance-20261027.json`. Independent audit result: `evidence/yellow-v15-context-live-audit-20261027.json`. The contract verifies the API snapshot only. Railway source/config/deployment checks are separate; physical Android installation, four-TF device FCM receipt, CEX membership parity and sustained uptime are not newly certified by this snapshot.

## Entry quality remains unproven

The offline alternative stays outside LIVE imports. Fifteen available cases, only three complete six-hour windows, three candidate confirmations at two unique symbol/time moments, zero simulated fills; the original AIN target is still missed. Full cases and limitations remain under `evidence/entry-research-20261027/`. This rollout fixes native-candle delivery correctness, not a demonstrated increase in entry accuracy. Keeping LIVE retains the existing fail-closed protections and is not a guarantee of uninterrupted operation.

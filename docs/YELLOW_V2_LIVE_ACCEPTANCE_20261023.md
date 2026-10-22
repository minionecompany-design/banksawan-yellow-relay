# YELLOW V2 — owner-authorized deployment and LIVE API acceptance

Date: 23 October 2026 WIB. PR #20 remains DRAFT; no merge performed.

## Deployment outcome

The owner explicitly requested proceeding through deployment and APK LIVE activation. Existing production service yellow-live-shadow-yc94 was updated; no second service/APK or unrelated product was created.

- Project: f90b3116-25bc-4af8-ade4-0552625d60ca
- Environment: production / 1fb5e959-c676-49c5-a1de-1dedbcb12410
- Service: 5a0486e7-27d9-43fd-8d05-f80ffe381a26
- Deployment: 52320cfe-e697-4d01-b2a0-6c4b9a4ac73f, SUCCESS
- Created: 2026-10-23 00:18:30.764 WIB; new runtime started around 00:20:17 WIB
- Exact deployed source: 662e0afdf80d095a1bb2485ed95ef66846b44619
- Pinned branch: fix/yellow-v2-4tf-50-q10m-20261022
- API origin: https://yellow-live-shadow-yc94-production.up.railway.app
- Existing persistent volume ea9edf2d-7294-443f-854c-001265c06405 retained at /data, 512 MB, Singapore; no data files cleared.
- Staged patch 21ec721c-74d4-471d-b711-320a2568d299 contained only branch and commit SHA changes; inspection reported destructive=false. No variable, credential, domain, volume, resource limit or restart-policy change.
- Previous b31412b deployment was replaced by Railway's normal deployment lifecycle; no separate manual restart/rollback was performed.

The exact source was verified through Railway deployment metadata and live service configuration, separately from the API audit. Future documentation commits must not be described as the deployed or signed application source. The source remains pinned, so documentation pushes do not deploy automatically.

## LIVE acceptance snapshot

Captured at 2026-10-23 00:24:39.800 WIB (1792689879800 epoch ms), from complete read-only /api/status, /api/universe, /api/home, /api/events and /health replies.

- API audit PASS; failures [].
- Healthy LIVE_SHADOW, ticker and kline WebSockets connected; no recovery/halt or circuit.
- 17/17 eligible symbols scanning; maxTracked 50, bootstrapInProgress 0.
- 18 allocated subscriptions include one briefly ineligible retained slot; this does not inflate covered to 18/17.
- Every UNIVERSE row has price/change/quoteVolume24h proof meeting the strict final policy.
- 76 guarded REST responses, all HTTP 200; no 418/429/451 observed in the new runtime at this snapshot.
- REST headroom pause triggered once at observed weight 405 during bootstrap. Existing WS stayed connected, no guard/network bypass occurred, and REST resumed naturally. Coverage progressed 2/18 → 16/18 → 17/17 as membership changed.
- FCM enabled, attempted=0 / sent=0 / failed=0; HOME and polling event arrays empty. No synthetic trading event or forced FCM send was generated.

Reproduce the saved contract audit from repository root:

```bash
node scanner/scripts/audit-v2-api-contract.mjs --snapshot docs/evidence/yellow-v2-live-api-20261023.json
```

Evidence:
- docs/evidence/yellow-v2-live-api-20261023.json
- docs/evidence/yellow-v2-live-audit-20261023.json

This snapshot passes the API contract only. It is a point-in-time result, not a guarantee of future membership, connectivity or delivery.

## APK and validation boundary

Signed versionCode 10 / 0.12.2-v2-status-q10m is built from the same deployed source 662e0af, package id.banksawan.yellow and original V2 signer. Build 39817978942 and source CI 39817790602 succeeded; independent SDK/source/hash/package verification and 17 Android test-result inspection were completed previously. The owner confirmed installing the latest APK via Update without uninstall. This is user-reported installation acceptance; retained data/settings were not independently inspected.

APK SHA-256: 16736ed7771df875c0faa8a5f26e121abc7fb0549f3c349c32ebe6af8db3d9a3
Signer SHA-256: E01D7A096FE4C50736726BAAB406AF91E0444D9FAD462B787D17D937063E8E4F

## Remaining direct acceptance

Backend is LIVE and its API contract passed. Full release QA is not complete:
- Device confirmation that the live list now appears in the existing installed APK.
- Actual updated TradingView app PLAY/FOGO routing/browser behavior.
- Genuine LONG_A device FCM receipt on 1m/5m/15m/1h, foreground/background and polling/restart deduplication.
- Matched real TradingView CEX/Binance snapshot membership. Current 17/17 proves API coverage, not CEX parity.
- Credential security review/rotation coordination under the previously documented Railway incident; no claim this project was compromised.
- A separate controlled restart/deduplication acceptance remains unproven. This deployment did restart the process with the original volume, and no historical alerts were observed at the recorded snapshot, but no new event existed to prove real post-event duplicate suppression.

Do not mark all remaining gates PASS based only on Railway SUCCESS, an empty HOME or server-side FCM counters.

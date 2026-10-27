# YELLOW v12 — signed release and LIVE observation receipt

27 October 2026. Owner explicitly authorized the symbol fixes and the planned LIVE observation. PR #21 remains DRAFT and unmerged.

## Exact identities

- Application/backend/APK source: c3d97a77e325e0a47477eed6e2beb078afcf92e7.
- Source tree: dd9ab25707f05202e16f3f858fd03738975e1c33.
- GitHub Actions run: 40442534460, SUCCESS (scanner, Android compile/behavior/signing refusal, permanently signed release).
- Release artifact: 12707451476. Downloaded ZIP SHA256 67df594882c605f6cf8a809972711069ab5cf92b87ea286c54ca96918fc5a4f3 matches GitHub artifact digest.
- Package id.banksawan.yellow; versionCode 12; versionName 0.12.4-v2-analysis-symbols; non-debuggable LIVE/FCM build.
- APK SHA256 54af445284e4b20126c898428602fc36d4d7d779605843f84524c6dce17091c2.
- Original V2 certificate SHA256 E01D7A096FE4C50736726BAAB406AF91E0444D9FAD462B787D17D937063E8E4F.
- Downloaded source/hash/signer receipts matched; official SDK 35 apksigner and aapt independently passed upgrade verification.
- Android evidence: 27 tests, zero failures/errors/skips. Scoped Node: 227 pass. Python release/upgrade checks: 15 pass.

## Deployment and observed runtime

- Existing Railway service yellow-live-shadow-yc94, deployment b5420f0b-323e-43fb-b446-07faae92eff0 reached SUCCESS at the application source above.
- API https://yellow-live-shadow-yc94-production.up.railway.app retained.
- Original /data volume ea9edf2d-7294-443f-854c-001265c06405 retained. Readback confirms source pin, unchanged deploy/resource/Firebase settings, analysis flag added, no pending patch.
- YELLOW_ANALYSIS_ENABLED=true; method YELLOW_COMPANION_V1 initialized; failures=0 at snapshot.
- QUSDT and WUSDT entered UNIVERSE and reached SCANNING. AIN recovered naturally after its existing candle-timeout retry interval.
- Before/after startup HOME snapshots retained all 20 baseline records at the initial comparison; normal time-based expiry continues.
- Guard pauses were respected. They concern REST headroom; the connected ticker/kline streams remain active. No guard reset, network bypass, additional service or synthetic trading event was used.

Final acceptance snapshot at 2026-10-27T10:30:15.764000+07:00: covered 48/49, allocated 50/50, bootstrapInProgress 0. All 211 REST responses in the new runtime were HTTP 200, circuit closed, REST pause inactive, both feeds fresh.

**Full steady coverage is not certified.** The API audit's remaining failure is STEADY_COVERAGE_NOT_REACHED. At this snapshot 1000PEPEUSDT was QUEUED with all 50 slots allocated, including retained currently ineligible symbols under the existing 15-minute retention policy. UNIVERSE correctly exposes this gap; no claim of 49/49 or full coverage is made. Existing allocation/retention behavior was not changed to manufacture acceptance.

Analysis retained records and paper sample size were zero. No genuine post-activation LONG A had yet been captured at the snapshot; actual new-signal analysis and device FCM remain unproven. Paper TP1/SL statistics are research assumptions, not demonstrated live accuracy or profitability. Older HOME events are not backfilled.

## Device acceptance still required

Install the supplied v12 APK as Update without uninstalling. Confirm HOME/UNIVERSE, Q/W TradingView routing, genuine new-signal notifications and ANALISIS buttons on captured events. A phone update and actual receipts cannot be inferred from CI or server health.

Independent momentum detection without LONG A remains a proposal. The deployed module is the planned LONG A companion; original four-TF Pine strategy and alert delivery remain unchanged.

This documentation/offline-preview follow-up is not a new APK/backend application source. Railway remains pinned to c3d97a77e325e0a47477eed6e2beb078afcf92e7. The offline preview's Q/W URL validator is aligned here; no runtime code or signing material changes in this follow-up.

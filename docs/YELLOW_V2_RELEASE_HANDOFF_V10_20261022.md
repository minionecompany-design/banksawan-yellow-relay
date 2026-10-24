# YELLOW V2 — consolidated release handoff, versionCode 10

Prepared 22 October 2026, Asia/Jakarta. PR #20 stays DRAFT. This is preparation, not production approval.

## Frozen product contract

One existing BANKSAWAN YELLOW update; package id.banksawan.yellow, original V2 permanent signer. Android/UI/API/Firebase reference 889cad23d7303084104e9d2b51ef85a1994136cb; backend strategy reference 633404dba077a577af44ad55b99976e50bcb9f68. No Clean, LAB, BR or ONE work.

LONG_A on independent 1m/5m/15m/1h lanes. All eligible Binance USD-M USDT PERPETUAL TRADING symbols remain in UNIVERSE. Strict change >1%, 0<price<10 USDT and Binance quoteVolume/q >10,000,000 USDT. Scanner maximum 50: healthy steady 47/47, or 50/65 with all 65 listed. No signal-strategy changes.

Candidate versionCode 10 / 0.12.2-v2-status-q10m includes the Activity color/recovery correction from b1f3076 and all prior PR #20 fixes. Candidate 9 from source 09b8afd is superseded only once the version 10 signed build is independently verified; keep the installed app and test the next installation as an update, without uninstall.

## Evidence already established

- Source b1f3076 CI 39814050199 completed SUCCESS.
- Full local scanner suite 190/190 and offline signing/Firebase/upgrade policy 15/15 pass after the version 10 metadata bump.
- Previous source Android CI covers 17 Robolectric tests: notifier 7, TradingView Intents 4, UNIVERSE snapshots 4, Activity failure/recovery 2. Current version 10 CI and signed build receipts must be recorded in PR metadata.
- The exact uploaded old APK matches the original V2 artifact hash bab529b9d8dccefa055053d3f4a121f4d46931de1a1bd05193f9104888d8c87b. Its package/signer match candidates 8/9, and versionCode was 6. Device rejection cause is still unknown; uninstall then install did not pass update acceptance.
- Version 10 must have the same signer SHA-256 E01D7A096FE4C50736726BAAB406AF91E0444D9FAD462B787D17D937063E8E4F, package id.banksawan.yellow, non-debuggable release and versionCode 10 (> installed candidate 9). Check the actual downloaded source-commit.txt against the intended 40-character source SHA. The official main workflow controller SHA is not application source.

## What remains blocked by external evidence

| Gate | Required evidence | Status before hosting recovery |
| --- | --- | --- |
| Physical upgrade | Android accepts version 10 over current app without uninstall; one app, retained state/settings | Not verified |
| TradingView mobile | Record Android/TradingView versions; alternate actual PLAY/FOGO/PLAY buttons and confirm BINANCE perpetual chart; verify browser fallback | Not verified |
| Four-TF FCM | Genuine valid event IDs, symbol/TF/candle and device receipt times for all four TFs; background/foreground and polling overlap | Not verified |
| Restart/deduplication | Controlled authorized restart on compatible test backend, no historical replay/duplicates and truthful stable coverage | Not verified |
| Real CEX comparison | Matched filters and timestamped Binance/CEX membership exports within 120 seconds | Not verified; prior local HTTP 451 |
| API compatibility | Saved replies from the intended compatible deployment pass the offline API audit | Not verified on new deployment |
| Credential readiness | Authorized Firebase credential/security review and any coordinated replacement; no key values in evidence | Not verified |
| Production cutover | All evidence reviewed, exact target/source/variables/volume/rollback reviewed, explicit owner approval | Not approved |

Offline tests and server-side FCM HTTP success cannot replace these gates. Railway recovery alone does not establish them. No automatic deployment is scheduled.

## Exact Railway target for a future approved cutover

Previously observed target; re-read live configuration before any mutation:
- Project banksawan-yellow-v2: f90b3116-25bc-4af8-ade4-0552625d60ca
- Service yellow-live-shadow-yc94: 5a0486e7-27d9-43fd-8d05-f80ffe381a26
- Production environment: 1fb5e959-c676-49c5-a1de-1dedbcb12410
- Existing API origin: https://yellow-live-shadow-yc94-production.up.railway.app
- Persistent mount /data; existing volume previously ea9edf2d-7294-443f-854c-001265c06405. Do not clear ledger, checkpoints or circuit files.
- Previously observed deployment 798a6f91-6ec5-4f57-90bf-b4d75be5c00e used b31412b36634b207852901aac2cf37325e4c6870. This is historical evidence, not a current read or chosen rollback.

Before an approved deployment, confirm actual source connection and pin the reviewed PR source. Do not deploy main accidentally just because the build-only workflow runs from main. Keep package, API routes, Firebase project/topic and permanent signer unchanged.

Review YELLOW_LIVE_ENABLED, YELLOW_DATA_DIR, YELLOW_MAX_TRACKED=50 and authorized YELLOW_FCM_ENABLED configuration. Do not copy secret values into PRs or logs. This source has four independent alert lanes in code and does not read the old YELLOW_ALERT_TIMEFRAMES environment switch; do not treat changing that old variable alone as proof of re-enabling 1m.

Select an authorized test context for compatible-backend/device acceptance before production cutover. The existing production service must not be stopped, replaced or mutated merely to prepare a test. A successful deployment is not acceptance until the gates above pass.

## Saved API acceptance procedure

After the intended compatible deployment is available, collect complete successful replies close together from /api/status, /api/universe, /api/home and /api/events. Build one local JSON object with capturedAtMs (real completion time), status, universe, home and events. No credentials or invented data.

Run from repository root:

```bash
node scanner/scripts/audit-v2-api-contract.mjs --snapshot saved-api-snapshot.json
```

Exit 0 means this saved API contract passes; 1 means conditions fail, 2 means bad input. A stable healthy bootstrap should settle at min(eligible,50)/eligible. Recapture after a real membership change; do not manufacture equal counts across snapshots. A genuine valid 0/0 is allowed; it does not prove four-TF delivery.

For the comparable market export:

```bash
node scanner/scripts/audit-cex-universe.mjs --exchange-info exchange.json --binance-tickers ticker24hr.json --binance-at-ms ACTUAL_BINANCE_EPOCH_MS --cex-symbols cex.json --cex-at-ms ACTUAL_CEX_EPOCH_MS
```

Replace timestamp placeholders with actual captured integer milliseconds. cex.json is an array such as BINANCE:PLAYUSDT.P identifiers exported with independently matched screen filters. A comparison is acceptable only with equivalent Binance/perpetual/USDT/change/price/volume filters; vendor calculation or timing differences must be explained. Local audit files do not fetch network data. HTTP 451 must not be bypassed through alternate IPs or a production relay.

## Release stop/recovery rules

If Binance responds 418/429/451, honor the persistent circuit and stop; do not retry, delete its latch or rotate networks to force service. For ledger/checkpoint write failure, repair durable storage before any authorized restart; do not clear state or invent/replay historical alerts. Preserve the existing fail-closed/restart policy unless a separately reviewed change is approved.

Before any real cutover, record the currently running source/configuration and a viable recovery option. A rollback to the historical volume-less backend does NOT restore compatibility with the strict version 10 client; owner coordination is required rather than claiming rollback is complete because a process is healthy.

No merge, Railway deployment/restart/variables change, new service, private-key download, real FCM send or physical installation is performed by preparing this handoff.

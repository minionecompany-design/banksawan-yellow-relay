# YELLOW V2 stage 8 — Android coverage and empty-state correction, 22 October 2026

Continues PR #20 from 68b63c472caccebc6dcee2ef4b7d016b3c4d369d. No production operation.

## User evidence and result

The phone showed 44/41 DIPINDAI in green with an empty UNIVERSE. The candidate's strict turnover filtering could hide legacy backend rows while the previous UI accepted covered > eligible and displayed misleading live/empty-market labels.

Both status and UNIVERSE coverage now reject covered > eligible, negative counts, invalid capacity and covered > capacity. The UNIVERSE snapshot must include all eligible rows, unique valid symbols, strict price/change/quote-volume proof and SCANNING/BOOTSTRAPPING/QUEUED states; its SCANNING row count must equal covered. Status and UNIVERSE are separate requests, so changing membership between them is not incorrectly required to match exactly.

An incompatible snapshot clears previously displayed data and displays DATA BACKEND BELUM SESUAI / TANPA DATA LIVE. Missing/stale feed remains a distinct unavailable-data message. Only a valid empty snapshot receives the no-eligible-coins explanation. The explanation now includes all strict filters: change >1%, 0<price<10 USDT and quoteVolume24h >10,000,000 USDT.

Layout, package, API routes, Firebase topic, strategy and permanent signing configuration are preserved. Candidate versionCode is now 9 / 0.12.1-v2-status-q10m, newer than the versionCode 8 already supplied. Source-contract and CI version assertions follow this intentional update.

## Validation

- 190/190 scanner tests and 15/15 offline Firebase/signing/upgrade-policy tests pass locally.
- 15/15 Robolectric Android tests pass locally, including four new snapshot/message tests covering 44/41, 47/47, 50/65, partial bootstrap, 0/0, mismatched counts, duplicate symbols, missing turnover and strict boundaries.
- Existing TradingView Intent and notification tests continue to pass. Physical TradingView/FCM behavior is not proven.
- Full Android test task completed successfully; git diff whitespace checks pass.
- Signed versionCode 9 artifact is a separate subsequent build gate; do not label an older versionCode 8 APK as this fix.

## Installation finding and open gates

The user reports uninstalling the old APK before installing versionCode 8. Therefore that was a clean install, NOT a passed in-place update test. The actual uploaded old APK was independently verified byte-for-byte against the original signed V2 receipt: SHA-256 bab529b9d8dccefa055053d3f4a121f4d46931de1a1bd05193f9104888d8c87b, package id.banksawan.yellow, versionCode 6 and original signer E01D7A096FE4C50736726BAAB406AF91E0444D9FAD462B787D17D937063E8E4F. Candidate 8 uses that same signer. The original installation rejection remains unexplained without a device error; do not infer it was a signer mismatch.

Keep the installed app. VersionCode 9 must be tested as an update without uninstalling. Backend compatibility, timestamp-matched CEX/Binance comparison, real device FCM four TFs/deduplication, actual TradingView behavior, controlled restart and coordinated credential review remain open.

21:00 WIB is a desired deployment time, not a passed QA gate or guaranteed Railway recovery. No merge, production deploy, restart or variable mutation is authorized by this report. PR stays DRAFT.

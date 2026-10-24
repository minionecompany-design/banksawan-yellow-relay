# YELLOW V2 stage 6 — signed candidate, 22 October 2026

Status: SIGNED CANDIDATE VERIFIED / RELEASE HOLD. PR #20 remains draft.

## Reproducible build identity

| Item | Verified result |
| --- | --- |
| Built application source | d7f9341faec50d510533e9e1e8aafcf8fec0b278 |
| Build-only workflow run | https://github.com/minionecompany-design/banksawan-yellow-relay/actions/runs/39778013995 |
| Job | 119821805579, success |
| Artifact | 12425921661, banksawan-yellow-permanent-LIVE-FCM-release |
| ZIP SHA-256 | 06544d6449d0d53059a8129c2da001bffe1420ed5727fa6771aef4d7f3ad1809 |
| APK SHA-256 | ffab9428e247455258651b23f6fd89405c94ab1f3ba56e6d28293f327ae63140 |
| APK bytes | 2732619 |
| Package | id.banksawan.yellow |
| Version | 8 / 0.12.0-v2-4tf-q10m |
| Signer SHA-256 | E01D7A096FE4C50736726BAAB406AF91E0444D9FAD462B787D17D937063E8E4F |
| Original V2 | source 889cad23d7303084104e9d2b51ef85a1994136cb, versionCode 6, same package and signer |
| Artifact expiry | 2026-11-05T12:25:05Z |

The dispatch ran the official main-branch controller at 70fd1bd32f630dca3aa073c0b8d3d6da06063c52. The controller's run head is NOT the application source. The downloaded source-commit.txt proves the application checkout was d7f9341faec50d510533e9e1e8aafcf8fec0b278.

Downloaded ZIP digest matched GitHub's digest. APK digest matched apk-sha256.txt. Independent SDK apksigner verification plus scripts/verify-yellow-v2-upgrade.py passed: original pinned signer, same package, newer version and non-debuggable release. SDK aapt independently reported the package and version above. The workflow's LIVE/FCM, signature and release verification step passed. Private keystore/Firebase temporary inputs were cleaned by the successful workflow cleanup step; private inputs were not downloaded.

This documentation-only follow-up does not change application code. The candidate stays pinned to d7f9341; it must not be relabelled as built from a later documentation commit.

## Scope of proof

Static upgrade prerequisites passed. No APK installation, physical update-in-place, real phone FCM receipt or actual TradingView mobile behavior was verified. The prior source CI passed 188 Node, 15 Python and 11 Robolectric tests; those are distinct from this signed release build.

The artifact name contains LIVE because of its build configuration. It is not approval to release. The unchanged API URL currently points to legacy production, whose saved replies fail the new turnover contract. Installing this candidate for live use before a compatible backend is ready can leave candidates rejected. Do not change the API route, package, Firebase topic or signing identity to work around this.

## Device acceptance sequence, after compatible backend approval

1. Record existing installed YELLOW package/version and device Android version; retain app data and notification settings. Verify the installed signer against the original certificate. Never uninstall the old app to force an update.
2. Reverify this candidate's SHA-256 and original signer. Install as an update on the authorized test device. If Android rejects the update, stop and capture the reason; do not substitute a debug key or another package.
3. Confirm there is one YELLOW application and retained state, original UI/API route, notification permission and expected Firebase registration. Record actual backend source/version separately from APK source.
4. Record TradingView app version. Alternate PLAY, FOGO, PLAY through real candidate buttons and verify the actual displayed exchange/symbol each time, including browser fallback where applicable.
5. For genuine qualifying LONG_A events, record symbol, timeframe, event ID, candle time and device receipt time for 1m/5m/15m/1h. Verify delivery from background/foreground and polling overlap without duplicate notifications. Use authorized events; do not inject fake trading signals into production or equate server FCM success with device receipt.
6. Coordinate a controlled restart only after approval, verify persistent deduplication and post-bootstrap 47/47 or 50/65 coverage as appropriate. Restart authorization is separate from building this APK.

## Remaining release gates

- Timestamp-matched real TradingView CEX/Binance membership comparison with equivalent filters; local Binance HTTP 451 remains an evidence limitation.
- Actual TradingView mobile behavior and update-in-place acceptance on the authorized device.
- Real FCM four-timeframe receipt and polling/restart deduplication.
- Railway credential security review/rotation coordination under the previously observed incident; no assertion this project was compromised.
- Healthy compatible backend, acceptance snapshots and explicit owner approval for coordinated cutover.

No production deploy, restart, rollback, variables mutation, PR merge or phone installation was performed for stage 6.

# YELLOW V2 stage 9 — Activity failure and recovery QA, 22 October 2026

Source parent: 09b8afd929ec0956c3487f5047bf9bca0f79c8a4. PR #20 remains DRAFT. Offline continuation only.

## Finding and correction

Phone screenshots show the version 9 incompatible-backend message while the main status banner remains green. The banner now starts yellow while waiting, turns yellow on either incompatible backend or feed/network failure, and returns green only when the already-validated live snapshot is published.

Refresh UI publication is extracted into package-local Activity methods, still called on the UI thread from the existing refresh path. Validation remains before the success callback. Routes, strict filters, strategy, Firebase, package and layout are unchanged.

Two Robolectric Activity tests cover:
- Initial waiting label and yellow status.
- Valid snapshot publication, both backend-incompatible and HTTP 503 transitions, clearing HOME/UNIVERSE/counts/refresh timestamp, then recovery restoring rows, healthy state, green status and clearing incompatibility.

These complement the stage 8 snapshot validation tests; they exercise actual Activity state and TextViews rather than only message helpers. No external API, Firebase send or TradingView application is involved.

## Validation and artifact boundary

Local complete scanner suite: 190/190 pass. Offline Firebase/signing/upgrade-policy tests: 15/15 pass. Diff whitespace checks pass.

Temporary local Android build tooling from earlier stages is no longer available, so new Android tests must pass the existing GitHub CI compile/Robolectric/signing-protection job. The expected Android suite is 17 tests (7 notifier, 4 routing, 4 snapshot, 2 Activity publication); consult the current-head CI linked in PR metadata for the actual result.

This source follow-up is NOT inside the already supplied signed versionCode 9 APK from run 39791325937. No new signed APK is built in this stage. Keep the installed version 9; consolidate any further Android corrections before the next candidate build. The next distributed candidate must increment versionCode above 9 and reverify the original signer. Do not rebuild and distribute this changed source as the already supplied version 9 artifact.

## Unchanged release gates

Physical update without uninstall, actual mobile TradingView routing, real FCM four-timeframe receipt/deduplication, comparable real CEX/Binance snapshots, compatible backend and controlled restart/security review remain open. CI cannot substitute for these.

No Railway access/mutation, production deploy/restart, merge, credential change or trading signal transmission occurred.

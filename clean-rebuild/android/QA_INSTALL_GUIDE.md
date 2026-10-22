# BANKSAWAN YELLOW Clean — offline QA handoff

## Verified build
- Commit: d1dcc1e0cbbfa6f6e9f15f7bee3acb1b67e49d39
- GitHub Actions: https://github.com/minionecompany-design/banksawan-yellow-relay/actions/runs/39722748275
- Android clean QA: SUCCESS (JVM tests, debug assemble, safe package assertion, emulator navigation)
- Artifacts: yellow-clean-OFFLINE-DEBUG-NOT-RELEASE and yellow-clean-android-offline-emulator-evidence
- Package ID: id.banksawan.yellow.qa; **not** production id.banksawan.yellow.

## Manual install for authorized testers
1. Open the verified GitHub Actions run while logged in with repo access.
2. Download the artifact **yellow-clean-OFFLINE-DEBUG-NOT-RELEASE** and extract the ZIP.
3. Install app-debug.apk only as a disposable OFFLINE QA app. Check Android package ID is **id.banksawan.yellow.qa**.
4. Keep the existing YELLOW V2 installation untouched.
5. Confirm HOME, UNIVERSE, back navigation, 360dp/412dp screenshots, and no false market signals.
6. Do not enable notifications, Railway connectivity, real trading or Firebase from this APK.

## Hard gates pending
- Visually inspect emulator screenshot artifacts for exact V2 layout parity; successful structural smoke tests do not imply pixel parity.
- Android runtime TradingView deep-link test on actual device for PLAY and FOGO, including foreground/background transitions.
- End-to-end persistent FCM outbox, delivery retries, background dedup and opt-in controls.
- Secure Railway deployment in isolated environment after credential rotation and entitlement verification.
- Pine TradingView parity with independent market data, signed release with original certificate.
- **No release APK** until explicitly approved and all gates pass.

## QA mobile TradingView shortcut — manual, offline

Only use a **new** CI-passing debug build containing the opt-in PLAY/FOGO test
(and package `id.banksawan.yellow.qa`), not an older debug ZIP.

1. Keep YELLOW V2 installed. Install the isolated QA APK beside it.
2. On the HOME screen tap **UJI SHORTCUT PLAY / FOGO (SIMULASI)**.
   A large `SIMULASI QA — BUKAN SINYAL PASAR` label must appear;
   no real scanner event, FCM or price claim is generated.
3. On the **PLAYUSDT** card tap **BUKA TRADINGVIEW**. Verify the **chart
   symbol visible inside the current installed TradingView mobile application**
   is PLAYUSDT perpetual Binance, not FOGO. If Android presents a browser/app
   chooser, record that behavior separately as a handoff issue.
4. Return to QA HOME and repeat for **FOGOUSDT**. The destination must be
   FOGOUSDT perpetual Binance, not PLAY.
5. Return and **TUTUP KARTU SIMULASI**. HOME must go back to unavailable;
   synthetic candidates must not remain or trigger notifications.
6. Record the app version, whether TradingView/browser/chooser opened, and
   actual header symbol for both clicks. Do not trade these simulated cards.

The emulator's private QA receiver can prove Android ACTION_VIEW and immutable
PendingIntent identity, but **cannot prove TradingView's third-party mobile
deep-link behavior**. This manual device check is still mandatory for release.

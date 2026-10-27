# YELLOW v14 — Classic HOME + live lamps (2026-10-27)

Scope: one existing package id.banksawan.yellow, versionCode 14, permanent YELLOW V2 signing key.

- HOME contains: symbol, three research-quality lamps with labels, price LONG A, 24h change, timeframe, signal time, BUKA TRADINGVIEW and ANALISIS.
- HOME MUST NOT render ENTRY, SL, TP1/TP2/TP3, resistance warnings, expired-entry banners or no-plan status text.
- All levels, stop distance, 4-TF trends, relative volume, support/resistance, expired marker and paper outcome remain in the existing ANALISIS dialog.
- Lamp evaluation is unchanged: backend recomputes per original event on existing HOME API reads. GREEN means basic evidence supports a setup at that quote, not permission to enter or a guaranteed gain.
- Backend LIVE v13 pinned source, Railway volume, Pine scanner, four TF, 50-slot cap, eligibility filter, FCM and TradingView URI remain identical. No Railway redeploy is necessary for v14 UI.
- HOME update alone does not improve measured trading accuracy.

Release acceptance:
1. Scanner + Android Robolectric + release guard pass on exact release commit.
2. HOME text tests show no entry/SL/TP in card, but keep symbol, timestamp, buttons and lamp.
3. Existing ANALISIS detail still includes entry/SL/TP and stale warning; lamp refuses fake/expired/out-of-zone signals.
4. Signed v14 APK is upgradeable from v13, package id and certificate identical, release mode LIVE FCM, never debug.
5. Real device install and subsequent natural LONG A remain field acceptance checks.

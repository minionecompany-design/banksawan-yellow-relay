# BANKSAWAN YELLOW V2 — One-APK scoped update (22 Oct 2026)

## Owner's final instruction
No YELLOW CLEAN rebuild, LAB, BR or ONE. **One installed BANKSAWAN YELLOW APK**.

- Android reference: `889cad23d7303084104e9d2b51ef85a1994136cb`,
  permanent signed build on 17 October 2026.
- Backend reference before 1M publication-off change:
  `633404dba077a577af44ad55b99976e50bcb9f68`.
- The Android code blob SHA of MainActivity, YellowNotifier, YellowFirebaseService
  and app/build.gradle at those two references is identical.
- Preserve V2 visual UI / HOME / UNIVERSE layout and Android application
  ID `id.banksawan.yellow`, Firebase topic `banksawan-yellow-v2`,
  server YELLOW API and original permanent signing certificate.

## Eligibility policy (STRICT, do not silently round)
Official Binance GLOBAL USD-M FUTURES, quote USDT, PERPETUAL,
`TRADING`, ticker price in `(0,10)` USDT, rolling 24h percent change
**strictly greater than +1.00%** and rolling 24h quote asset turnover
**strictly greater than 10,000,000 USDT**.

Source of proof for turnover: REST `/fapi/v1/ticker/24hr`
`quoteVolume`, or all-market USD-M WebSocket ticker `q`, not
candlestick `volume` or Pine 20-candle `volumeRatio`.
Absent, stale, mismatched, invalid or insufficient turnover:
**fail closed**, never invent a historical 24h turnover for a signal.
This applies to membership, scanner admission, event journal, polling
feed, HOME display, FCM sender and Android receivers.

Four independently evaluated **LONG_A** lanes:
`1m,5m,15m,1h`. Internal Pine PROTECT/LONG_B/OUT_FINAL state is
retained but those signal types are NEVER notified to user.
No fabricated quote-volume proof; no notifications for closed-candle
events outside their TTL or for different symbols.

## Universe N and active scanning capacity
`N=total eligible Binance USD-M instruments`, not number of live
subscriptions. Scanner cap **50**. The actual target after complete
healthy bootstrap is `min(N,50)`; e.g. `27/27`, `47/47`, `50/50`,
`50/65`. UI must report incomplete BOOTSTRAPPING/QUEUED truthfully
until the scanner catches up. The existing guarded Binance REST
bootstrap budget remains active; no bypass of 418/429/451 protections.
Railway may have an explicit legacy `YELLOW_MAX_TRACKED` variable
set to 200; change to **50** as part of a separately authorized
coordinated deploy. The application now rejects >50 to fail closed.

## TradingView compatibility limitation
Old HOME button used
`https://www.tradingview.com/chart/?symbol=BINANCE%3ASYMBOL.P`
with Android implicit ACTION_VIEW. User reports PLAY opens FOGO
**after updating the TradingView Android app**, but the causal root
cause is not yet confirmed. Android code now generates a new URL
**for the currently displayed symbol on every press**:
`https://www.tradingview.com/symbols/PLAYUSDT.P/?exchange=BINANCE`
(example for PLAY), attempts to open installed package
`com.tradingview.tradingviewapp`, and falls back to browser if app
not available. **Long pressing the unchanged button** explicitly
requests Chrome for diagnosis / a fallback route. No unsupported app
URI schemes or hidden symbol substitution. A website symbol detail
page is not guaranteed to open the full interactive chart screen
directly on every app version: test on the user's updated TradingView
before declaring fixed. Acceptance pairs: PLAY→PLAY, FOGO→FOGO,
repeat, reverse order and switching backgrounds.
Original UI layout, label, style and HOME candidate identity unchanged.

## Android package and signing
Old signed V2 v0.10: `versionCode=6`.
Update candidate: `versionCode=8`,
`versionName=0.12.0-v2-4tf-q10m`.
Only release with the old `id.banksawan.yellow` package and original
protected permanent signer, matching certificate SHA-256 from
the installed app. CI debug APK is **NOT an in-place update** over
production. A successful Android compile alone does not prove
signing, FCM delivery or TradingView behavior.

## Release gate — not yet LIVE
1. Offline scanner tests and Android build/test workflow green.
2. Validate Binance REST/WS quote turnover, strict threshold
   boundaries and CEX membership under identical screen settings
   and close timestamps (vendor volume/time differences possible).
3. Real-device QA on the latest TradingView app, with PLAY/FOGO
   per-symbol chart routing and browser fallback.
4. Verify full 4TF FCM and foreground polling are deduplicated and
   delivered within TTL, and successful restart recovers exact state.
5. Approve one coordinated backend deployment and signed APK
   update, observing `YELLOW_MAX_TRACKED=50` and 1M publication
   as active. **Do not install an update app pointing to the old
   volume-less V2 server.** It will correctly fail closed.
6. No merge, Railway change, FCM push or signing secrets handling
   in the feature-branch work without acceptance. Keep original V2
   production untouched until cutover completes.

## Offline QA
`.github/workflows/yellow-v2-scoped-qa.yml` runs all
`scanner/test/*.test.js`, Android source contract checks and Java
debug compilation. The workflow does **not** publish an installable
production signed APK and has **zero Binance, Railway, and real FCM
network calls**.

# YELLOW v0.11 product filter correction

Scope: BANKSAWAN YELLOW (`id.banksawan.yellow`), not LAB or BR.

The user confirmed the screenshot policy: active Binance USDT perpetuals,
price strictly below 30 USDT, rolling 24h price change strictly above zero,
and rolling 24h quote turnover strictly above 10,000,000 USDT.
Quote turnover is Binance REST `quoteVolume` / all-market ticker WS `q`,
not base asset volume and not the candle-volume ratio used by Pine.

The same filter controls universe admission, live event acceptance, persistent
HOME records, polling, FCM dispatch and the updated Android display/receiver.
Live event volume is taken from the most recent ticker at or before the signal
candle close. Missing/invalid volume fails closed; no historical volume is
invented. Existing HOME records without volume proof are hidden at the API,
while the original journal and dedupe records remain intact.

The Pine state machine still advances independently; product filtering does
not fabricate replacement LONG A events. Existing ten-hour per-event HOME TTL
and five-minute notification TTL remain unchanged. Production publication
remains `YELLOW_ALERT_TIMEFRAMES=5m,15m,1h`; the Android notifier also refuses 1m.
No new Binance requests or sockets are added. The existing 50-symbol live cap
is unchanged and must not be described as full-universe scanning.

## Validation

- 180 Node tests, including strict threshold boundaries, REST/WS quote turnover,
  missing volume replacing old data, as-of snapshots, ledger persistence,
  legacy HOME suppression and FCM rejection before networking.
- 11 existing Python release/signing tests.
- PR CI must compile Android and run the existing signing safety checks.
- Release versionCode 7 / versionName 0.11.0-volume-filter.

## Coordinated release

1. Review PR CI including Android compilation.
2. Run the existing main-branch `build-yellow-v9-fcm.yml` controller with the exact
   reviewed source SHA. It uses the original protected permanent signing key.
   Do not distribute the disposable-key PR CI APK.
3. Verify package, versionCode 7, FCM enabled and the same certificate as v0.10.
4. Deploy the reviewed backend commit to the existing Singapore YELLOW service.
   Preserve the volume and publication-timeframe variables. Check deployment
   SUCCESS plus fresh /api/status, productPolicy and volume-filtered universe.
5. Install the signed update over the existing APK. The old v0.10 client still
   has <10 / >=1% display checks, so it can omit new valid <30 / >0% candidates.
   An updated client against an old server fails closed because volume is absent.

TradingView's reported PLAY -> FOGO mobile-link issue is separate and is not
claimed resolved by this filter release.

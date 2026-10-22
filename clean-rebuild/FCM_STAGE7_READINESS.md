# YELLOW Clean — Stage 7 Firebase FCM integration contract (offline preparation)

STATUS: **NOT CONNECTED**, **NO FCM MESSAGES SENT**, **NO LIVE**. Stage 6 Railway is blocked independently by provider availability. Production YELLOW V2 must not be touched.

## Single source of truth

- Binance Global USD-M USDT perpetual access and entitlement must be verified before live connection. No VPN, proxy, alternate feed workaround, or unauthorized data.
- Eligibility: 0 < price < 10, rolling 24h change >= +1%, rolling 24h quote volume strictly >10M USDT, TRADING, USDT PERPETUAL; all eligible appear in UNIVERSE, at most 50 tracked.
- Accepted event only `LONG_A` on `1m`, `5m`, `15m`, `1h` with immutable `SYMBOL:TF:CLOSED_AT_MS:LONG_A` ID. No LONG B/PROTECT/HOT/OUT FINAL or automated entry.
- HOME and FCM use the identical accepted event journal, symbol, timeframe, candle timestamp and TradingView destination. A card for PLAY may NEVER route to FOGO.

## Offline components already implemented

- `src/offline-delivery-outbox.js`: durable serial queue with atomic replace, restart restore, claim lease tokens, bounded retry delay, unique event identity and explicit ACK. **One logical dispatcher only**; not yet fan-out to devices.
- `src/fcm-payload.js`: pure data-only FCM payload with string fields `schemaVersion`, `signal`, `eventId`, `symbol`, `timeframe`, `barClosedAtMs`, `tradingViewUrl`. No device token or Firebase SDK.
- Android `CleanPushContract`: validates those fields, rejects symbol/URL mismatches and LONG B. This is a **parser**, not an FCM receiver or notification display implementation.
- `clean-rebuild/core/offline-http.js`: deliberately returns UNAVAILABLE/NO_FEED; no source feed or Firebase credentials.

## Mandatory before enabling FCM

1. Create/configure a separate authorized Firebase project and register the actual Android application ID and permitted signing fingerprints. Never commit `google-services.json`, server credentials, service accounts or device tokens to GitHub logs.
2. Integrate official Firebase Messaging SDK and foreground/background handlers in *new* QA package first, opt-in notifications on Android 13+, and proper notification channel. Distinguish data messages from Android notification auto-display.
3. Persist device-subscription consent and delivery state per recipient; token rotation, token revocation, unsubscribe and cleanup must work. Current outbox is **not** per-device.
4. After durable accepted LONG A journal write, idempotently enqueue eligible events; replay the journal on restart to repair between journal and queue. Each recipient delivery needs a unique `eventId + recipientId` dedupe key, not only the symbol.
5. Sender uses Firebase Admin credentials exclusively server-side. A successful provider response is not proof of handset display. Retry only transient failures with backoff and expiry; permanently reject invalid tokens.
6. Client validates full payload, stores accepted event IDs durably and builds explicit immutable `PendingIntent` identities per event. Suppress duplicate HOME cards and OS notifications after reboot; carefully avoid marking delivery before UI handling if that would lose an event.
7. A crash after FCM accepts a message but before sender ACK can duplicate a delivery. **Exactly once is not guaranteed**; design client and backend idempotency accordingly.
8. Verify each of PLAY → FOGO → PLAY against actual updated TradingView on user's phone. Emulator QA receiver alone cannot certify third-party TradingView handoff.
9. Durable outbox needs persistent storage (volume/database) before Railway deploy, explicit resource costs approval, isolated service, rotated keys and secrets, monitoring/health checks, and deployment rollback.
10. Only after source entitlement, signal/Pine parity QA, device delivery tests and original APK signing certificate are verified may a production release gate be reviewed.

No paid resources, Railway deployments, Firebase tokens, or real FCM messages are created at this stage.

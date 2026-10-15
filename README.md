# BANKSAWAN YELLOW V6 — LIVE SHADOW CANDIDATE

**Status per 15 Oktober 2026: source + mocked tests complete. BELUM DEPLOY, BELUM SELESAI acceptance pasar nyata.**

This is the new isolated BANKSAWAN YELLOW implementation, compatible with the existing YELLOW GitHub development branch, with a separate Railway project and APK `id.banksawan.yellow`.

## What it does

- Market: Binance USD-M perpetual, only actively trading USDT contracts, Binance rolling 24-hour change **>= +1%**, price **<10 USDT**, >= +5% priority HIGH.
- Long A signal from **any one** of 1m/5m/15m/1h independently. Confirmation conditions INSIDE Pine v1.3 are evaluated; no chain of TF signal events required. Only CLOSED target candles are evaluated.
- Binance Futures REST bootstrap is gated behind a **persistent 418/429/451 circuit breaker**, 60 locally accounted weight/min, minimum 750ms gap, remote IP request-weight ceiling 400/min. **This does not guarantee safety across Railway egress/shared BR infrastructure.** No additional REST retries on hard-block statuses.
- Binance market WS (post-2026 path `/market/ws`) supplies USD-M `!ticker@arr` and closed klines for 1M/5M/15M/1H. Joined 24h ticker uses `st=1` USD-M only.
- At startup, 170 historical candles per timeframe are downloaded for every selected symbol, 24 monitored symbols initially (configurable up to 200 after approval); all eligible symbols are shown in UNIVERSE but coverage is disclosed (QUEUED vs SCANNING). Early 1% candidates can wait while limited warm-up progresses.
- Durable HOME and notification/event ledger: one 24-hour HOME card **per symbol** from first Long A, independent TF dedupe and 5-minute push expiry.
- Read-only YELLOW API `/api/home`, `/api/universe`, `/api/events?afterMs=`, `/api/status` for Android. No Binance requests from APK.
- Android HOME retains its TradingView shortcut. UNIVERSE is a three-column Binance-style list without any TradingView shortcut. Android foreground polling (10 seconds) and optional YELLOW-only Firebase background push share the same persisted claim.
- Firebase messaging is opt-in and requires independent YELLOW credentials. Disabled by default; no BR topic/credential reuse.

## Safe-by-default startup

The **root `npm start` is deliberately different from the old YELLOW repo**. It boots only `scanner/src/live-main.js`; an accidental deploy *fails closed* unless all conditions are met:

```text
YELLOW_LIVE_ENABLED=true
YELLOW_DATA_DIR=/data     # persistent Railway mounted volume
YELLOW_MAX_TRACKED=24     # limit initial active scanning capacity
YELLOW_FCM_ENABLED=false  # initially shadow; enable after FCM tests
# PORT supplied by Railway
```

**Do not start the old root `scanner.js`.** It has an older, higher-REST-use scheduler. The new root `package.json` intentionally replaces the legacy `npm start` command.

When FCM is approved separately:

```text
YELLOW_FCM_ENABLED=true
YELLOW_FCM_SERVICE_ACCOUNT_JSON=<private YELLOW service-account JSON in Railway Variables ONLY>
```

Do not paste the service account into GitHub source or ChatGPT. The Android Firebase `google-services.json` is supplied via the GitHub Actions secret `YELLOW_FIREBASE_GOOGLE_SERVICES_JSON_BASE64` and not committed.

For Android LIVE builds: set **GitHub repository variable** `YELLOW_LIVE_API_URL=https://<dedicated-yellow-domain>` and run the workflow `.github/workflows/android-debug.yml`. For debug builds without this variable, DEMO_MODE remains on; do not confuse a debug demo with live acceptance. Each CI debug APK may have a different signing certificate: do not rely on it for permanent upgrades.

## Safety warnings and release gates

1. **No full market coverage at 24 default scan slots.** Show honest coverage. Only gradually raise capacity after Binance telemetry checks. A new project does not bypass IP rate limits or network restrictions.
2. **No Pine parity certification yet.** Pine `request.security` on lower frames can behave differently on historical vs realtime bars. Compare chronological live Long A timestamps against TradingView and recorded Binance as-of tickers before enabling FCM, and do not claim strategy profitability from tests.
3. **No automated trading** or order endpoints; Long A observations are not instructions to buy.
4. Historical bootstrap cannot reconstruct the full earlier Pine tradeState when ticker history is unavailable; the scanner starts new independent states and does not replay historical alerts. It can miss near-startup signals.
5. Binance `HTTP 418/429/451` latches halt persistently. Normal WebSocket disconnections halt (no unbounded reconnect), pending supervised recovery. Do not auto-restart aggressively.
6. Persisted JSON ledger assumes **exactly one service replica + persistent volume**. Do not scale to multiple replicas without a PostgreSQL-backed cross-process atomic ledger.
7. Require natural proof across all four timeframe lanes and physical-device tests (foreground, background, screen-off, FCM+pollen race, device reboot, offline-to-online, 24-hour HOME TTL) before calling production accepted.
8. Check Railway billing before adding a running service and volume; do not exceed the user's budget. All BR #205 resources are frozen and outside this codebase.

## Local tests (no Binance, no FCM)

```bash
cd scanner
npm test
```

Source uses Node 22+ builtins. Tests use fake HTTP, fake WebSocket, synthetic chronological candles, and a cryptographic local fake service account; they do **not** test live market detection. This package must be built through GitHub Actions for Android; the local environment does not include Android SDK.

## Railway project

A **new empty project** `banksawan-yellow-v2` was created; project ID `f90b3116-25bc-4af8-ade4-0552625d60ca`. No service, volume, database, or deployment is included here. This is intentionally separate from BR `successful-enchantment`.

See `docs/LIVE_RELEASE_GATES.md` for evidence and the first steps to accept a live shadow pilot safely.

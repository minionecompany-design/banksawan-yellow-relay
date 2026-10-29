# BANKSAWAN YELLOW V4 — Offline acceptance record

**Status:** OFFLINE DEVELOPMENT. **Not an installable Android APK, not live market detection, and not a TradingView-parity acceptance.**

## Changes implemented in V4

1. `scanner/src/binance-fixture-adapter.js`: strictly converts stored Binance USD-M `/fapi/v1/klines` rows to closed candles (`endMs = closeTime + 1`), validates nonnegative volume, prices, timestamp alignment, duplicate/gapped observations, and candle as-of cutoff. Separately recorded Binance 24h ticker snapshots with observed timestamps are mandatory for *historical eligible* proofs. Verifies OHLCV consistency of native higher TF vs stored one-minute candles when both are fully covered.
2. `scanner/src/offline-acceptance-server.js`: read-only HOME/UNIVERSE/status endpoints marked `simulation:true`; optional authenticated **localhost-only** replay event import, disabled unless an offline token is set. No Binance calls, no FCM calls, no trading functions. Uses the durable single-process `offline-home-journal` to show one HOME card per symbol for 24 hours and reject repeated events.
3. `scanner/scripts/run-offline-acceptance.js`: process binds `127.0.0.1`; accepts local replay only when `YELLOW_OFFLINE_REPLAY_TOKEN` is explicitly supplied (minimum 24 characters). Local acceptance is intentionally **not** a remote API or secure production ingest.
4. Android UI fixes: `DEMO` label shown only in demo builds; backend-connected view labels correctly and distinguishes an empty HOME from an empty UNIVERSE. HTTPS is required for any future backend URL. Offline responses with `simulation:true` are always rejected as real data by Android.
5. New suites: Binance saved-fixture normalization, 24h persistence over a local HTTP server, guarded replay, API read/status, and static Android release-contract checks.

## Reproducible offline commands

```bash
cd scanner
npm test
npm run proof
npm run demo        # default demo, 127.0.0.1:4173
npm run acceptance  # offline read API, 127.0.0.1:4183; replay input DISABLED
```

Example read-only smoke with `npm run acceptance` running in one terminal:

```bash
curl -s http://127.0.0.1:4183/health
curl -s http://127.0.0.1:4183/api/home
```

The server returns `mode: OFFLINE_ACCEPTANCE`, `simulation: true`, `binanceRequests: 0`, `fcmsSent: 0`. Do not connect Android in live mode to these endpoints. The debug Android defaults to its own explicit offline demo.

## Safety boundaries and unfinished gates

- No GitHub write permissions in this session (GitHub connector returned 403). The old `banksawan-yellow-relay` main branch was not modified.
- No new Railway project or service has been created. BR #205 must not be changed or burdened with extra Binance requests.
- This environment lacks Gradle and Android SDK; no actual debug APK can be compiled here. `.github/workflows/android-debug.yml` is prepared for GitHub Actions after the **user** uploads this package to a separate development branch. Test installing the APK on a phone afterward; don't mistake the screenshot/HTML preview for an installable APK.
- No real Binance OHLC/ticker fixture replay completed here. The repository contains `APR`, `BTR`, `USELESS` gzip fixtures but not enough historical recorded `24hr` as-of ticker snapshots for a fully causal signal-eligibility verdict. Future replay must separate geometry-only parity from genuine +1% Binance filter proof.
- Pine `request.security` lower-timeframe semantics may differ in historical versus realtime chart view. The existing parallel evaluator deliberately uses `CAUSAL_REALTIME`; equality against a loaded TradingView screenshot remains unverified.
- No Android physical notification, FCM, reconnect delivery, battery/doze or signing proof. These gates remain **BLOCKED**, not passed by unit tests.
- No deploy, no live market data request, no database maintenance, no scanner changes on BR #205.

## Acceptance status

- Automated offline tests: **62 passed, 0 failed** on the V4 working package (Node 22).
- Actual Android SDK/Gradle build: **NOT RUN — environment unavailable**.
- Historical market / Pine parity: **NOT PROVEN**.
- Binance API safety under two independently active scanners: **NOT PROVEN**.
- APK/FCM in hand: **NOT YET**.

## Next concrete actions

1. User can create a branch `yellow-long-a-v2-20261015` in `minionecompany-design/banksawan-yellow-relay` using the GitHub web UI, then upload *unzipped* package contents **to the branch, not main**. Workflow `.github/workflows/android-debug.yml` should build a debug APK after a push to that branch. Do not provide BR's signing key or Firebase secrets for demo debug build.
2. Once GitHub Actions outputs an actual APK artifact, install it beside BR on Android and verify two tabs, 1K icon, no network requests in DEMO, and TradingView launch. Do not call it a live scanner yet.
3. Complete offline parity evidence with locally supplied historical klines and as-of 24h ticker, verify detection times and prices for positive/negative examples across 1M/5M/15M/1H; without snapshots, evaluate raw Pine parity only, not the 24h filter.
4. Engineer a data plane that does not increase BR #205 Binance requests, then write a separately authenticated and bounded YELLOW backend. Deploy only after explicit approval and capacity/cost planning.

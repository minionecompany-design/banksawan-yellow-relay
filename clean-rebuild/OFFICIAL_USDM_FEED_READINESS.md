# Stage 6/8 — Offline official USD-M input readiness (22 Oct 2026)

**Current state: NOT LIVE.** Pure parsers and offline tests exist; no source connection,
Railway service, authenticated data entitlement or Firebase send operation.

## Official sources and ground truth

- USD-M exchange identity from `GET /fapi/v1/exchangeInfo`: only
  `quoteAsset=USDT`, `contractType=PERPETUAL`, `status=TRADING`.
- Rolling 24-hour price change from `GET /fapi/v1/ticker/24hr`:
  `lastPrice`, `priceChangePercent`, **`quoteVolume`** (quote USDT), not
  `volume` (base units).
- OHLCV from `GET /fapi/v1/klines` for independent
  `1m,5m,15m,1h` sources only. Kline tuples: open time, OHLCV, close
  time = open + duration - 1. Last unfinished bar is excluded.
- Source URLs: Binance Developers USD-M futures REST Market Data documentation.
- **Caution:** Binance's current documentation notes that `/fapi/v1/klines`
  may accept broader UM/CM symbols. A returned bar is **not** proof of USD-M
  identity. The symbol must separately appear in official exchangeInfo as
  USD-M USDT perpetual TRADING.

## Core offline source modules

- `src/official-usdm-feed.js`: detects bad provenance, stale timestamps,
  incomplete or duplicate ticker coverage, bad USDT quote volume and
  wrong contract type. Returns UNAVAILABLE with `eligible=null` when invalid.
- `src/official-usdm-scan-gate.js`: admitted symbols and snapshot become
  ineligible for processing when the feed loses authorization, becomes stale,
  or fails data validation. An offline scanner must be invoked via this gate
  for the new source safety checks to apply.
- `src/official-usdm-klines.js`: four TFs; validates tuple shape, contiguous
  closed candles, nonnegative volume and consistent OHLC. Suppresses last
  still-forming candle; forbids injected gaps or quote/spot substitutions.
- `src/product-policy.js`: full eligible universe: `0<price<10`,
  `change24hPct>=1`, `quoteVolume24h>10000000`. Only at most 50 tracked
  slots; no artificial 50-symbol cap on HOME/UNIVERSE eligibility.

## IMPORTANT limitations / release holds

1. The offline `source` and `accessAuthorized` fields are validation gates
   provided by the caller, **NOT legal proof** of Binance access or that
   requests were made to the official domain. Until source ownership,
   entitlement, endpoint HTTPS/TLS and freshness are independently verified,
   **no LIVE feed is allowed**.
2. `clean-rebuild/core/offline-http.js` remains intentionally
   `UNAVAILABLE/NO_FEED`, even though the pure parsers exist. No Railway
   deployment has been created.
3. No REST rate-limit planner, reconnect/WebSocket manager, closed-bar catch-up
   scheduler or cross-timeframe persistent cursor pipeline has been deployed.
   The official all-symbol 24-hour ticker endpoint has higher API weight,
   so quota and exponential backoff must be designed before operation.
4. There is **NO Pine v1.3 parity proof** on independent recorded market
   candles, especially `request.security` lookahead and multi-TF 1m semantics.
   Do not call the current synthetic-positive tests trading accuracy.
5. No Firebase SDK, server credential, recipient fanout or real notifications
   have been authorized. Durable outbox is offline only.
6. Final frozen UI is described in `android/UI_SPEC_V2.md`. No visual redesign.
7. The production `banksawan-yellow-v2` Railway project and original
   installed YELLOW V2 APK have not been modified.

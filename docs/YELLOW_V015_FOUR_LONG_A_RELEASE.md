# BANKSAWAN YELLOW GOLD v0.15 — kembali ke empat LONG A (keputusan operator 22 Oktober 2026)

Status: **SOURCE/CI REVIEW ONLY, NOT LIVE, NO SIGNED APK CLAIM**. Continues YELLOW GOLD PR #16 screener work and original four-lane architecture. **1M PROTECT → LONG B experiment cancelled by operator**, no LAB/BR/ONE edits.

## Nonnegotiable product behavior
- Binance USD-M USDT perpetual TRADING, official 24h price change `>= +1.00%`, `0 < lastPrice < 10 USDT`, and as-of official USDT quote turnover `> 10,000,000` (strict); no synthetic base turnover.
- Scan at most **50 concurrently tracked symbols**. UI differentiates **all eligible universe** from the tracked subset; eligible count may be greater than 50, but those extra symbols are not scanned for LONG A.
- All four **independent, closed-candle LONG A** publishing lanes: **1m/5m/15m/1h**. Old deployed `YELLOW_ALERT_TIMEFRAMES=5m,15m,1h` must not silently suppress 1m after the authorized release. Per-lane Pine/MTF rules remain unchanged.
- **LONG B 1m never notifies** and `oneMinuteLongBEnabled=false`; PROTECT and OUT_FINAL are not alert types. Old LONG B journal data is preserved; no migration, deletion or replay.
- Retain existing 5-minute delivery TTL, 10h per-event HOME TTL, dedupe, FCM topic, foreground polling, private journal, API guard.
- Android HOME **BUKA TRADINGVIEW** remains the external `BINANCE:<SYMBOL>.P` chart action. Its actual symbol-opening accuracy depends on the TradingView mobile app; historical PLAY→FOGO app issue is not claimed fixed.

## Android release
- `applicationId=id.banksawan.yellow`, `versionCode=11`, `versionName=0.15.0-four-long-a`.
- A build-only **OFFLINE HOLD** controller in this development branch uses the existing private permanent keystore and certificate, empty API URL, DEMO_MODE true, alerts false, FCM false. This is **not a usable live replacement** for the existing v0.13 installation.
- Never distribute CI debug as an upgrade. Sign with same old certificate, prove `apksigner` fingerprint, `aapt` package/code/name, SHA-256 and install/update behavior before release.
- The default/main signer workflow may have a **LIVE-configured** body. Do not use the old main LIVE signer for this PR or claim that branch-specific signing is available until verified.

## Deployment hard stops
- The current YELLOW Railway service was pinned to older commit `b31412b...` at last authorized read, not this source. Deploying APK alone cannot fix its missing `quoteVolume24h` schema.
- Prior operator handoff reports explicit Binance restriction on global USD-M Futures read-only REST/WS for this Indonesian operator. **No LIVE market calls or backend deployment** until authorized written provider clearance for operator/use/host is independently reviewed. No VPN, other-country egress, account or LAB/BR/ONE bridge.
- Verify complete protected volume `/data` backup and restore, FCM config, rollback and resource budget before any authorized coordinated release.
- Do not change Railway, source connection, 451/418/429 guards, old data, secrets, notification topic, or region during source-only review.

## Mandatory QA
1. Four TF LONG A on closed candle and q10M boundary, 1M formerly muted now pub/sub/FCM/polling, LONG B rejected on both backend and Android.
2. Distinguish eligible vs max 50 tracked; partial, unavailable, stale source are not `0 COIN`.
3. Correct TradingView symbol URL and Android upgrade identity; no cross-symbol notification ID.
4. Full Node scanner tests, Android JVM and compile; emulator screenshots at 360dp and 412dp, same SHA; permanent signer only after gates pass.
5. Natural Pine parity/FCM device delivery only once data access is legal. A green offline CI does not prove actual live notifications or financial outcome.

## Safe fallback
If v0.15 fails, retain operator-approved 1M silent/5m-15m-1h LONG A baseline with current strict q10M product policy and old persistent data. Do not blindly downgrade old backend or uninstall app.

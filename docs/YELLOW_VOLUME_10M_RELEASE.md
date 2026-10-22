# BANKSAWAN YELLOW v0.12 — restore +1% UP and strict >10M 24h quote volume

Scope **BANKSAWAN YELLOW GOLD only**, never LAB, BR or ONE. Follow-up to PR #14 where rolling 24h quote volume >10M was added but a different universe policy (>0% / <30 USDT) was accidentally introduced.

## Shared YELLOW product eligibility (backend = scanner = HOME = FCM = Android)

- Official active USD-M USDT-settled **PERPETUAL** contract identity, status TRADING.
- Last price: **0 < price < 10 USDT** (10.000 exactly is NOT eligible).
- Official rolling 24h percent change: **P >= +1.00%** (1.00 is eligible; 0.99 is NOT). This is NOT a 1h candle change, a 1m momentum candle, or a daily quota.
- Official rolling 24h **USDT quote turnover**: **q > 10,000,000 USDT** (10,000,000 exactly is NOT eligible). Read from REST `/fapi/v1/ticker/24hr.quoteVolume` and Binance USD-M WS ticker `q`, never base volume `v`, synthetic candle volume or Coinalyze.
- Invalid, stale or missing volume evidence must fail closed for both universe and signal delivery.
- Binance product restriction/permissions must be independently satisfied before activating any market-data calls; this PR is source-only and does not change egress location or runtime.

`scanner/src/product-policy.js` is the common server gate. `scanner/src/long-a.js` derives its `SETTINGS` from that central policy and both Pine-like LONG A lane evaluators use the same inclusive >=+1 threshold. `scanner/src/live-market.js` checks actual **as-of** q again when accepting a LONG A event; volume is persisted in HOME and passed to polling, FCM, and Android. Android independently filters the same fields; release app and server must be updated in a coordinated release.

Existing 10-hour per-event HOME TTL, 5-minute notification TTL, no false historical volume backfill, stored dedupe/cursors, request budget, and TradingView routing remain unchanged. **1M notifications remain disabled in main YELLOW**: only 5M, 15M, 1H are published. LAB alone owns the 1M research focus.

**Universe cardinality != concurrently scanned symbol count**: the YELLOW deployment still has an independent max-tracked capacity, which must be displayed honestly; meeting eligibility does not prove the symbol was scanned.

## Code and APK versioning

- Source branch: `fix/yellow-gold-1pct-volume10m-20261022`, based on existing PR #14 merged YELLOW production branch `yellow-long-a-v2-20261015`.
- Android package remains `id.banksawan.yellow`.
- **New versionCode 8 / versionName 0.12.0-plus1-volume10m**, higher than the previously built v0.11 (versionCode 7); this allows an Android upgrade once signed with the same protected permanent certificate.
- New PR validation workflow builds an **offline, unsigned-release-incompatible debug smoke APK** without access tokens, a live URL or FCM enabled. DO NOT install that debug artifact over the existing signed YELLOW app.
- The proper deliverable is the main branch's existing **manual, protected** `.github/workflows/build-yellow-v9-fcm.yml`: dispatch with the exact fully reviewed 40-character source SHA; the workflow checks permanent signer certificate, API_BASE_URL, FCM flags, package ID, release mode, APK signature and receipt. No secrets or keystore ever published.
- **Signed v0.12 APK has NOT been produced by this branch alone** until the protected workflow run succeeds; CI debug is not the new installed app.

## Release gate, not automatic deployment

1. Run PR scanner/Android tests. Verify inclusive threshold 1.00%, reject 0.99%, strict q 10M and price exactly 10.00. Confirm FCM/HOME notifications for 1M remain blocked.
2. Review proposed change and secure signing controller run, then verify new APK certificate matches installed APK (versionCode 8).
3. Only after explicit go/no-go with applicable market-data permissions, perform a **separately approved** LAB/BR-isolated YELLOW backend deploy to the existing Railway Singapore service. Preserve persistent volume and guard, FCM settings and last-good rollback; do not force external provider calls just to test a restricted endpoint.
4. Verify actual read-only YELLOW /api/status PRODUCT_POLICY version, candidate count, filter as-of q, 5M/15M/1H output and frontend before distributing/installing signed APK.
5. Never claim historical zero-volume HOME events satisfy the new policy. Never claim this filter fixes separate TradingView mobile PLAY→FOGO external app behavior.

**Present source status**: implementation in review PR, not production-deployed. LIVE cannot be marked ready simply because offline tests and APK compilation succeed.

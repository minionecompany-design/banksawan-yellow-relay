# YELLOW V2 — UNIVERSE ↔ TradingView CEX cross-check (offline review only)

**Owner screen:** Exchange Binance; Perpetual contracts; Quote currency USDT;
`Chg, 24h > 1%`; `Price < 10 USDT`; `Vol in USD, 24h > 10M USD`.

**Sources must be contemporaneous.** A screenshot with `Chg 24h >0%`
(e.g. 27 eligible shown) **cannot certify** membership for the final
`>1%` filter. A CEX count is not a fixed constant. Binance USD-M
`quoteVolume` is in USDT, while TradingView screen states volume in USD;
provider calculation and timing can create legitimate differences.

## Offline comparison
Collect **locally** at nearly the same time:
- `exchange.json`: read-only Binance USD-M `/fapi/v1/exchangeInfo`
  response (symbol ID, quoteAsset, contractType, status)
- `ticker24hr.json`: Binance USD-M `/fapi/v1/ticker/24hr`
  array with lastPrice, priceChangePercent and `quoteVolume`
- `cex.json`: full CEX export as a JSON array of strings like
  `BINANCE:PLAYUSDT.P` or `PLAYUSDT.P` (perpetual only).
- `--binance-at-ms` and `--cex-at-ms`: real **epoch milliseconds**
  when each snapshot was collected; no guessed observation times.

Run (offline; never queries Binance, TradingView or Railway):
```bash
node scanner/scripts/audit-cex-universe.mjs \
  --exchange-info exchange.json \
  --binance-tickers ticker24hr.json \
  --binance-at-ms 1780000000000 \
  --cex-symbols cex.json \
  --cex-at-ms 1780000000500
```
**Timestamps above are placeholders.** Do not use them as live market
evidence. The CLI rejects differences over 120 seconds, duplicates, spot
symbols, non-Binance CEX objects and unreadable inputs.

Output includes `eligibleCount`, `expectedCoveredWhenHealthy`,
`cexCount`, `onlyBinance`, `onlyCex` and
`exactMembershipMatch`. This audits membership only; it does not
simulate Android FCM, Pine correctness or guarantee data vendor parity.

## Runtime status meaning
- `eligible`: total N official Binance symbols passing all six rules.
- `covered`: currently subscribed symbols **that are still eligible**.
- `allocatedScanSlots`: all active kline subscriptions (may temporarily
  include former eligible symbols due to churn grace).
- `uncoveredEligible`: eligible instruments not yet subscribed.
- Full steady-state target when N≤50: `N/N`, contingent on healthy
  guarded Binance request budget, stable connectivity and successful
  four-timeframe initialization. When N>50: `50/N`; no claimed full
  coverage.

A difference between `covered` and `allocatedScanSlots` means real
resources can still be occupied by symbols leaving the eligible set.
It is **not** a signal event, a second APK or an excuse to fabricate
50 active candidates.

**QA evidence:** offline CI tests under `scanner/test/cex-universe-audit.test.js`
and `scanner/test/v2-rest-ws-universe-coverage.test.js` cover 27/47/65,
strictly >1%, 10M boundary, REST/WS updates, CM/UM isolation,
as-of ticker state, and transitional coverage honesty.

## Still requires human/phone checks
The new Android HOME shortcut opens the Binance `SYMBOLUSDT.P`
specific TradingView symbol page, first via the TV app if installed,
otherwise via a browser. **It has not yet proven correct on the user's
updated mobile TradingView build.** Test PLAY→PLAY, FOGO→FOGO, multiple
switches, and press-and-hold browser fallback before signing release.
The browser symbol page may not land directly on a Superchart; do not
promise it will.

**Production unchanged.** No APK install, Railway update or signed
release is included in this audit.

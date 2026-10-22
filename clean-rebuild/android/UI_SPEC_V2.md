# BANKSAWAN YELLOW Clean — V2 UI decision (approved 22 Oct 2026)

## UI FREEZE — NO MORE DESIGN ITERATIONS
- Treat the two last user-provided full-screen BANKSAWAN YELLOW mockups (HOME and UNIVERSE) as the final visual baseline. Prioritize completing backend, Railway staging and Firebase FCM over further UI iterations.
- Do not invent LIVE data, market prices, historical signal timestamps or crypto logos just to fill this reference; offline QA must show unavailable state.
- Keep safe top/bottom insets; do not overlap status bar clock/battery or navigation buttons. Exact pixel parity with two illustrated mockups remains subject to actual device screenshot acceptance, not just source inspection.

## Visual design
- Match old YELLOW V2: dark navy, yellow brand title and selected tab, green status/price-change badges, blue BUKA TRADINGVIEW buttons.
- **FINAL APPROVED VISUAL REFERENCE (22 Oct, latest user screenshots):** HOME tab has a small house icon, UNIVERSE has a small globe icon, both WITH labels HOME and UNIVERSE; selected yellow, unselected navy. This replaces the earlier text-only instruction. Do not change this layout unless the user explicitly revises it.
- **No IDR prices or Rupiah conversions anywhere**. Only USDT price, plus Binance rolling 24h percent change.
- HOME: title, concise status, independent accepted LONG A signal cards, each with its own symbol, timeframe, closed-bar time and deep link. Never fabricate price or percent values when absent from the event contract.
- UNIVERSE: compact Binance-inspired vertical rows of symbol, optional small Perp label, USDT last price, and green/red 24h percent. No wide, horizontally scrolling table. Quote volume >10M USDT and TRACKED/ELIGIBLE status remain backend validation criteria and are NOT cluttering columns.
- Distinguish eligible universe count from at most 50 actively tracked. Display no fake counts when the feed is unavailable.
- Safe top and bottom insets are applied to the root layout so text does not overlap Android clock/battery or navigation bar. Verify on physical Samsung handset and Android emulator 360dp/412dp.
- For offline builds, a compact banner must disclose OFFLINE QA / UNAVAILABLE. Do not render LIVE SHADOW until an actually verified, entitled live source exists.
- QA manual PLAY/FOGO charts are intentionally labeled SIMULASI and require opt-in. They are not real market signals.
- Keep original V2 launcher icon source as agreed; do not edit installed legacy APK or existing Railway production. New QA applicationId ends with .qa.

## Data integrity
- Real coin logos/names require an independently verified mapping or official asset. Never invent logos/names based solely on a trading symbol.
- All eligible coins displayed, up to 50 tracked for scan; no 24h volume or tracked status displayed as extra columns.
- No LONG B/PROTECT/OUT FINAL/HOT, no automated trading.

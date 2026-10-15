BANKSAWAN YELLOW V6 — PATCH GATE LIVE (15 OCT 2026)

Repo: minionecompany-design/banksawan-yellow-relay
Branch: yellow-long-a-v2-20261015

The only required replacements/additions are:
  scanner/src/live-market.js
  scanner/src/live-main.js
  scanner/test/live-websocket-contract.test.js
  .github/workflows/yellow-live-safety.yml

What changed:
- Kline dynamic subscription uses official /market/stream (not /market/ws).
- Receives both combined and raw kline payloads. Invalid SUBSCRIBE ACK causes halt.
- Detects silent market streams and fails closed, without REST fallback.
- A halted process closes API and exits: Railway restarts must stay NEVER.
- 3 offline tests added; local 84/84 PASS.

Do not merge to main or attach GitHub source to Railway until this patch has
been committed to the development branch and live-safety workflow succeeds.
No Binance REST calls or FCM pushes were made when creating this patch.

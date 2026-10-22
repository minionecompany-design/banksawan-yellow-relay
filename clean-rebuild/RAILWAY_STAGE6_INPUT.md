# Railway Stage 6 handoff — EMPTY, OFFLINE, ISOLATED (22 October 2026)

**DO NOT DEPLOY TO EXISTING** `banksawan-yellow-v2`. Wait for Railway to recover, create **new staging only**. A staging service may incur Railway usage even when offline: ask the owner before creating an active service or resource. Firebase does not require Railway to be operational for its separate Android setup.

## Input checklist (Railway dashboard)

| Setting | Value |
|---|---|
| Workspace | The owner's own authorized Railway Hobby workspace |
| New project | `banksawan-yellow-clean-staging` |
| Service name | `yellow-clean-offline-api` |
| Source repo | private `minionecompany-design/banksawan-yellow-relay` |
| Source branch | `rebuild/yellow-clean-v1-stage0-20261022` (PR #18; do not merge to production) |
| Root Directory | `clean-rebuild/core` |
| Builder | Railpack, Node.js 22 |
| Start Command | `node offline-http.js` |
| Config file | `railway.toml` inside root directory |
| Healthcheck | `/health` (HTTP 200 means process responding, NOT live scanner ready) |
| Port | Railway-managed `PORT`, do not hardcode |
| Domain | none until deliberate staging acceptance |
| Database / Volume | none for offline NO_FEED API; **never run event journal or FCM outbox on ephemeral filesystem in LIVE** |
| Environment | separate staging environment only; auto deploy from production branch must remain disabled |
| Existing YELLOW V2 service | untouched |

### Plain-text NONSECRET staging variables

```env
BIND_HOST=0.0.0.0
YELLOW_LIVE_ENABLED=false
FCM_SENDING_ENABLED=false
FEED_MODE=OFFLINE
```

`offline-http.js` deliberately returns:
- `GET /health` -> `{"state":"OFFLINE_QA","ready":false,"live":false,"source":"NONE"}`.
- `GET /v1/home` -> `dataState:"UNAVAILABLE"`, `count:null`, no signal.
- `GET /v1/universe` -> `dataState:"UNAVAILABLE"`, `coverage.eligible:null`, no fake symbol.
- `YELLOW_LIVE_ENABLED=true` -> refuses process startup.

`FCM_SENDING_ENABLED=false` and `FEED_MODE=OFFLINE` are reserved deployment safeguards. **Do not mistake them for a complete policy switch**: actual LIVE software and additional authorization/secret gates do not yet exist.

## Never enter into dashboard until approved

- Binance/API credentials or bypass proxies (official authorized global USD-M entitlement must be established first).
- Firebase service-account JSON or registration tokens (never paste into chat/screenshots/commits; eventual server-side secrets only in approved secret store).
- Legacy YELLOW V2 keys, Firebase configuration, project IDs or production database URLs.
- Default domain, PostgreSQL, or persistent volume at this smoke-test-only stage.

## Deployment acceptance — not LIVE acceptance

Once Railway recovers, create only the new isolated service and confirm the three explicit *NO_FEED* responses. A green Railway deployment does NOT mean a working scanner or an FCM push. Do not turn on `LIVE`. Secure persistent database/outbox, source entitlement, scheduler/closed-candle streams, FCM consent+fanout, real TradingView phone handoff and verified Pine parity remain release blockers.

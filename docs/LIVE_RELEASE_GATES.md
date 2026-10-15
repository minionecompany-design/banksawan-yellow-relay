# BANKSAWAN YELLOW V6 — AUDIT & RELEASE GATES (15 Oct 2026)

## Evidence obtained, offline only

- GitHub YELLOW V5 app previously built successfully as demo on commit `280a7bc` (no real Binance signal proof). V6 Android FCM and live polling changes are new and **not yet compiled in GitHub Actions**.
- 81 automated tests PASS in the candidate V6 source. Results include old 62 tests, guard persistence for 418/429/451, mock request-weight ceiling and IP headroom, market UM/CM ticker filtering, candle gaps, 24h HOME under concurrent claims, live readonly API, opt-in FCM signing/delivery mock, and safe start.
- Real Binance requests during this work: **0**; real FCM sends: **0**.
- Prior YELLOW legacy repo has true 1m/5m/15m/1h formulas and regression fixtures, but we have not proven full Pine parity on observed historical 24h ticker snapshots.

## User-locked contract

| Topic | Immutable target |
|---|---|
| Market | Binance USD-M PERPETUAL, USDT quote |
| Universe | Binance rolling 24-hour change >= +1%, price <10 USDT |
| Priority | >=+5% HIGH; still must satisfy raw LONG A |
| Long A | 1m OR 5m OR 15m OR 1h independently (MTF confirmations inside formula) |
| HOME | One card/symbol, first seen +24h. TF event dedupe does not extend card. |
| UNIVERSE | Binance-style table: symbol, last price, 24h percent; NO TradingView. |
| TradingView | HOME card shortcut only |
| Branding | User's 1K image, independent Android package |
| Infra | YELLOW new Railway project, no BR #205 changes |

## Launch gates (do not bypass)

**G0 — Current:** New Railway project only. GitHub main and BR unchanged. No live requests.

**G1 — Code:** Upload entire V6 *repository patch* onto YELLOW development branch; do not touch `main`. GitHub Actions compile Android V6 successfully. Confirm no Firebase secret is published and `npm start` points at the guarded entrypoint. Check configuration and mobile installation.

**G2 — Permission and cost:** Operator explicitly approves creating/running one YELLOW Railway service and mounted persistence volume, the monthly budget, and initiating separate low-rate Binance data consumption. Confirm region can access Binance; never bypass HTTP 451.

**G3 — Live read-only shadow:** Start with `YELLOW_MAX_TRACKED=24` and `YELLOW_FCM_ENABLED=false`, single replica, persistent volume. Verify `/api/status`, actual exchange coverage and data-age, no 418/429/451, reliable WS and candle bar closure, disk and memory usage. Halt if any hard-block.

**G4 — Pine parity:** Gather at least multiple real chart examples per TF and matched negative controls. Compare Pine indicator's **realtime** signal/time/price and scanner event, using historical Binance ticker percent as-of that bar (not today's percent). Diagnose discrepancies in RSI/Wilder, 5M/15M/1H request.security when context is lower than chart TF, timing windows, gaps, and tradeState warmup. No fabricated parity score.

**G5 — Push:** Provide YELLOW-only Firebase service account via Railway secrets and Android `google-services.json` via GitHub secret; test foreground polling, background FCM, screen-off, collision dedupe, expiry, reconnect, and reboot. Push is disabled until G4 and physical-device acceptance.

**G6 — Coverage and cost:** Increase scanning slots gradually only after telemetry proves both availability and Railway usage safe. Pilot 24 symbols is **NOT** a claim to monitor every eligible pair. Use the coverage fraction from `/api/status` and compare missed candidates. Stop at rate-limit warnings.

**G7 — Real outcome:** Observe natural LONG A candidates for 24h each, compare peak gain from first confirmed signal and worst adverse excursion, quality/safety and misses. Finalize algorithm only after evidence. Never treat trading profitability as proven by unit tests.

## Blockers remaining

- GitHub connector write returned 403. V6 source must be uploaded by the owner or the GitHub connection reauthorized with write permissions.
- No new Railway service, volume, or domain yet; no agreed cost expansion.
- No real Pine parity proof yet. Existing Python/Node tests used synthetic data; some GitHub regression fixtures have real candles but not as-of 24h ticker chronology.
- V6 Android FCM dependencies/build not yet tested by GitHub Actions. If compile fails, fix before live APK rollout.
- Single-process persisted JSON home is safe only with one replica and mounted volume; HA/multireplica requires database migration.
- Unexpected WS disconnect currently fail-stops and needs supervised recovery. Test long-running reliability and plan bounded recovery before 24/7 acceptance.

## How to run the safe local gate

```bash
cd scanner
npm test
# no network connections are attempted by test suite
```

## Config checklist

- Railway project `banksawan-yellow-v2` empty and independent.
- Running only one new backend service with mounted `/data` when approved.
- `YELLOW_LIVE_ENABLED=true`, `YELLOW_DATA_DIR=/data` with persistent volume, `YELLOW_MAX_TRACKED=24`, `YELLOW_FCM_ENABLED=false`.
- No changes to BR #205 GitHub, Railway, database, request limiter, or Android release path.
- Use `/health/live` for Railway process liveness, `/health` and `/api/status` for actual market readiness.
- Read `requestGuard.statusCounts`, circuit reason, data gaps, `covered/eligible`, memory and disk before raising traffic.

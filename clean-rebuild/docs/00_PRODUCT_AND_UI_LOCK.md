# BANKSAWAN YELLOW — CLEAN REBUILD, CONTRACT LOCK v1
Date: 2026-10-22 (WIB). Stage 0: specification + frozen UI references. NOT DEPLOYABLE.

## Operator decisions (supersede PR #15/#16/#17 experiments)
- Replace existing YELLOW v2 with a clean new architecture in stages. Do **not** erase/shutdown the old working app before replacement is proven.
- Keep icon, HOME and UNIVERSE appearance **visually identical** to YELLOW v2, including yellow/black theme, two bottom tabs and existing TradingView chart shortcut. **Do not redesign**.
- Reimplement, do not blindly port old scanner state/episode logic.
- LONG A 1m, 5m, 15m, 1h: four **independent** notifications on confirmed closed candles; MTF conditions inside each original Pine formula preserved. No LONG B, PROTECT, OUT FINAL or HOT publication.
- Official USD-M USDT perpetual TRADING contracts only. Product admission strictly `0 < price < 10 USDT`, rolling 24h price change `>= 1%`, official rolling 24h **quoteVolume > 10,000,000 USDT**. No using base volume as quote volume.
- At most 50 **active tracked** instruments; UNIVERSE displays only filter-passing symbols and clearly distinguishes tracked vs eligible counts. Default sort by 24h change descending. Eligible universe may be >50; user-facing `50/376` without explaining denominators is forbidden.
- HOME shows signals actually accepted under the policy, one symbol/timeframe attributed correctly, not invented opportunities. Preserve data TTL/dedupe semantics until explicit review; don't silently choose original 24h vs latest 10h HOME behavior.
- Correct TradingView symbol action on every HOME card and notification: symbol from the **same validated event**, e.g. `BINANCE:PLAYUSDT.P`; no stale shared callback or another symbol. Verify actual device opening and behavior after TradingView app update.
- APK remains new build but upgrade-compatible with current `id.banksawan.yellow` installation using **same permanent signing certificate**, increasing versionCode beyond all installed builds. Keep launcher icon assets byte-identical. No debug APK delivery. If new APK is distributed before replacing backend, incompatible schema must be reported rather than showing fake empty market.
- LAB, BR, ONE not touched. New YELLOW implementation isolated from them.

## Design freeze references (do not mutate)
Reference snapshot: Git commit `ba39a5fc95bc65f689065e82c3d6c071c5e6818f` (YELLOW v0.14 UI implementation and assets). Historical mobile screenshots supplied by operator. Reference source assets must be copied **unaltered** into clean project:
- `android/app/src/main/res/drawable-nodpi/yellow_logo.png` blob `420bea168f038009384883b9992df168140d3000`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` blob `5c574cf064f890daf2a4cac99dcad0f5af7b2d39`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` blob `735eeeeae6e6a0a255f4ef76563de96140328532`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` blob `4cb5fdc9cb076be9c6a83b1155b559c056b95290`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` blob `ce9df105cc772ec35876f0c4387e27446f6e417a`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` blob `656d422e9c0d253e55e7f2f2a105670f2ee337f9`
- HOME/UI implementation reference `android/app/src/main/java/id/banksawan/yellow/MainActivity.java` at same SHA; use reference behavior without copying legacy networking or state code.
- Colors, placement, typography, bottom HOME/UNIVERSE buttons, HOME cards and Universe table appearance require screenshot comparison at 360dp and 412dp.

## Architecture and acceptance (small, evidence-driven stages)
STAGE 0 (now): lock spec, asset references, safety/rights blockers and pass/fail acceptance, no old code changes.
STAGE 1: new isolated backend core from scratch (types, exact filter, 4 independent lane evaluators, 50 slot allocator, continuity/backfill and persistent dedupe) using *offline fixtures only*. Define API v1 status/universe/home/events with versioned JSON schemas, single contract source, clear stale/unavailable vs true empty.
STAGE 2: reuse only UI/icon visual assets in clean new Android source; backend contract tests vs JVM parser; notification FCM + foreground dedupe; TradingView each event symbol binding and real-device acceptance.
STAGE 3: integration stress QA: monotonic closed-candle events, stale/as-of data guards, 24h turnover boundary tests, track rotation, restart/old data isolation, safe stop, anti-replay, CI green exact SHA, signed upgrade certificate proof; screenshot diffs.
STAGE 4: deploy only after Railway incident resolved, old Railway secrets revoked/rotated at providers, least-privilege rebuild environment, backed up volume, verified source data licensing/geo entitlement. Obtain operator approval **at go-live stage**. No routing around geographical restrictions.

## Safety and release hard gates
- **LIVE NO-GO**: operator-specific authorization to access Binance global USD-M Futures read-only market data remains unverified for Indonesian operator. Region/proxy/VPN reassignment, borrowed keys or routed LAB/BR/ONE feeds are prohibited workarounds. Design must permit a separately licensed compliant source through explicit data contract, never silent substitution.
- **Railway incident** 21/22 Oct: platform disclosed possible environment variable compromise and build outage. Treat old Railway credentials as exposed pending rotation. No new Railway service/deploy, secret copy, environment exports, nor deleting old volume.
- Old YELLOW remains untouched and recoverable until replacement acceptance. Stage branch is isolated, does not run LIVE or install APK.
- Evidence for each stage: code commit, passing tests, exact artifacts, failures, rollback and operator review. Do not claim signed APK or natural parity based on offline tests alone.

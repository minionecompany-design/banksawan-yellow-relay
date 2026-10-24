# YELLOW V2 — continuation of PR #20, stage 3

Parent reviewed: `e9c94608db90c29b85ba4cd95b7c93eb2d9ae08b`.
Scope remains one update of `id.banksawan.yellow`. No strategy, Android
UI, API route, Firebase topic or signing configuration changes in this stage.
PR stays draft. No merge, Railway operation, production FCM send, APK build
with protected credentials, or phone installation was performed.

## Findings and fixes

1. `bootstrap()` previously relied on the caller's serial work loop for the
   50-symbol cap. Concurrent calls could allocate 65 symbols. Reserve capacity
   synchronously using `covered.size + inProgress.size` before any REST await.
   Normal operation still initializes one symbol at a time through RequestGuard;
   the concurrent fixture is a defensive regression, not a new live fetch mode.
2. Refreshed exchange metadata removed delisted subscriptions but retained their
   fresh tickers/history. Such symbols could still appear eligible for up to
   the ticker freshness window. Purge both caches and require current metadata
   membership in `universe()`.
3. An obsolete exchangeInfo request could mutate a newer feed generation before
   the later ticker-response generation check. Check halt/generation immediately
   after exchangeInfo returns, before changing metadata or subscriptions.

All three regressions fail on the parent source and pass on this change.
No Pine conditions or state transition rules were changed.

## Executed offline evidence

`node --test scanner/test/*.test.js`: **180/180 pass**.

`python3 -m unittest discover -s scripts -p 'test_verify_yellow*.py'`:
**15/15 pass**.

New coverage goes beyond the earlier mocked bootstrap tests:

- 47 eligible and 65 eligible: real `bootstrap()` with four normalized REST
  candle fixtures per symbol, CandleBook and checkpoint disk I/O. Observed
  47/47 and 50/65, exactly 188 and 200 guarded kline fixture requests,
  four subscription parameters per symbol, and no historical notification.
- A fresh market instance resumes all four matching checkpoint cursors for
  each covered symbol, maintaining the cap without historical event sends.
- 65 concurrent bootstrap requests allocate at most 50 slots.
- Metadata removal purges the subscription, current ticker and as-of history.
- Delayed exchangeInfo from an older generation cannot replace current metadata.
- PLAY and FOGO, each on 1m/5m/15m/1h at the same closed candle: 24 concurrent
  acceptance attempts produce eight durable events, eight HOME records,
  eight polling IDs and eight mocked data-only FCM sends. Duplicate attempts
  after a ledger restart are rejected. The next 1m candle remains a new event.

These tests validate local behavior and the FCM request payload only. They do
not prove Google delivery, Android receipt, OS background behavior or TradingView
app routing. Bootstrap fixtures do not measure live Binance latency or budget
availability. Existing RequestGuard tests remain in the passing full suite.

## Original V2 artifact identity verified

Read-only recovery of the original release:

- GitHub Actions run: `39011959483` (17 October 2026).
- Artifact ID: `12093670036`, `banksawan-yellow-permanent-LIVE-FCM-release`.
- `source-commit.txt`: `889cad23d7303084104e9d2b51ef85a1994136cb`.
- Downloaded APK SHA-256 matches its `apk-sha256.txt` receipt:
  `bab529b9d8dccefa055053d3f4a121f4d46931de1a1bd05193f9104888d8c87b`.
- Android SDK 35 `apksigner verify --print-certs` succeeded. Certificate digest
  matches the original `signer-sha256.txt` receipt:
  `E01D7A096FE4C50736726BAAB406AF91E0444D9FAD462B787D17D937063E8E4F`.
- SDK `aapt dump badging` reports `id.banksawan.yellow`, versionCode `6`,
  versionName `0.10.0-event-home`.

This verifies the identified original build, not which APK is installed on
the owner's phone. No private signing key or Firebase secret was accessed.

The existing main-branch release controller
`.github/workflows/build-yellow-v9-fcm.yml` was inspected read-only. It accepts
an exact source SHA and checks protected signing/Firebase inputs. It was NOT
dispatched. Its generic version floor is >5; the V2-specific local gate below
instead requires >6, the same package and the independently verified V2 signer.

## Prepared read-only upgrade gate

After an authorized release build, run with Android SDK executables available:

```bash
python3 scripts/verify-yellow-v2-upgrade.py path/to/app-release.apk
```

Optional tool paths: `YELLOW_APKSIGNER`, `YELLOW_AAPT`.

The script pins the original public certificate above, requires a valid APK
signature, `id.banksawan.yellow`, versionCode >6, and a non-debuggable release.
It never signs, installs, uploads or contacts any service. Running it against
the verified original APK correctly fails with `YELLOW_V2_VERSION_NOT_NEWER`;
the original signer verification itself passes. This is preparation, not proof
that a new signed candidate exists or passed the gate.

## External evidence still required — release remains blocked

1. **Contemporaneous CEX/Binance snapshots:** the one read-only request to
   `https://fapi.binance.com/fapi/v1/exchangeInfo` returned HTTP **451** in this
   execution environment. No further Binance endpoint/IP/proxy attempt was made.
   No live Binance/CEX equality was claimed. Use the existing
   `audit-cex-universe.mjs` with complete snapshots collected in a permitted
   environment and actual observation timestamps within 120 seconds. CEX must
   use Binance, perpetual, USDT, >1%, price<10 and 24h volume>10M.
2. **Updated TradingView Android:** record app version, Android version, cold
   launch PLAY→PLAY, FOGO→FOGO, alternating and repeated clicks, return from
   background, and long-press browser fallback. Source URL binding does not
   prove an external app honors the link. No connected phone was available.
3. **Real FCM + polling deduplication:** use an authorized device/test recipient
   and controlled backend; record the event IDs and received notifications for
   all four lanes, repeated delivery, foreground polling overlap and restart.
   Do not inject synthetic events into the existing production topic to claim
   this test passed. No device receipt or production send occurred here.
4. **New signed artifact:** only after the release tests and required approval,
   build the reviewed SHA with the existing protected V2 key and Firebase
   configuration. Verify the resulting artifact with the upgrade gate; validate
   update-in-place on the owner's known installed V2. Current source versionCode
   is 8. No Clean package or second app is permitted.
5. **Coordinated cutover:** the strict new client rejects volume-less old server
   events. Backend and APK require a coordinated approved transition; do not
   install the update against the unchanged old production backend as a live
   compatibility test. Production remains untouched until QA passes and the
   owner authorizes the transition.

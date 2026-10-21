# YELLOW GOLD v0.14 — release candidate / LIVE NO-GO

22 October 2026 (WIB). Continues PR #15 exact source `51a5949068e11038a9154c5724be0d0d56a1b896`. No LAB, BR or ONE scope. No production merge/deploy, provider endpoint requests, region changes, feature toggles or storage mutation.

## Root cause, with evidence limits

Read-only Railway service inspection confirmed branch `yellow-long-a-v2-20261015` pinned to `b31412b36634b207852901aac2cf37325e4c6870`, deployment `798a6f91-6ec5-4f57-90bf-b4d75be5c00e`, status SUCCESS. This is NOT the v0.13 backend.

At that exact old source, `eligibleUniverse` emits symbol, price, change and priority, but no `quoteVolume24h`; normalization and HOME ledger also predate the quote evidence contract. Android v0.13 applies finite quoteVolume24h >10M in UNIVERSE and HOME. Missing field becomes NaN and every legacy row is filtered. The UI previously called this “0 COIN”, despite a successful HTTP response. This is a version/schema mismatch, not proof of no market candidates. The old status and coverage counters count the backend's old rules without quote filtering: user-observed 376 is that old snapshot's eligible count, 50 is separately covered capacity. No target of 97 is encoded; TradingView's >0% screenshot is a different filter and time snapshot.

`legacy-b31412b.json` is a **synthetic schema-shaped reproduction**, not a captured real-time response. Node and actual Android JVM parser tests reproduce absent-volume rejection, independently of symbol parsing. We did not retrieve restricted live prices to reproduce the historical number 376. HOME may additionally be genuinely empty after its TTL; absence of historic quote evidence alone is sufficient to hide old HOME rows, but exact contents at the user's screenshot time cannot be reconstructed honestly.

## Contract and UI

`/api/universe` now includes `schemaVersion=yellow-universe-v1`, productPolicy, generatedAtMs, source/active contract/USDT quote and margin identity, quoteVolume24h, tickerObservedAtMs, tracked boolean and coverage. One in-memory snapshot per response; no fetch, subscription, ranking strategy or capacity change. Full eligible rows are not sliced to tracked capacity. Sorting is change descending with symbol tie-break. Search and all five column sorts happen locally.

Data states: OK means complete valid evidence; PARTIAL shows only verified fresh rows and labels the count incomplete; STALE/DATA_UNAVAILABLE use null eligible, not a fake zero. Stale boundary is >=30 seconds; future >10 seconds rejected. Missing/invalid quote cannot use base volume as a fallback. Missing identity is not guessed. `/api/status` advertises schema and snapshot eligibility; `covered` remains actual tracked count, which may exceed current eligible because pinned B episodes are retained. Tracked-eligible ratio never divides actual tracked episodes by current candidates incorrectly.

Android parser validates policy/schema before showing numbers; old backend reads BACKEND BELUM KOMPATIBEL. UI has horizontally scrollable fixed-width columns, 48+ dp touch targets, five sorts, symbol search, separate eligible/tracked and explicit partial/stale errors. Layout uses dp and Android system insets. Preview is synthetic, not Samsung hardware proof. Home, events, FCM validators, Pine evaluators, episode reducer, journal and TTL logic are unchanged from PR #15. A partial universe does not disable otherwise valid HOME or foreground notifications.

## Offline signed hold

Package `id.banksawan.yellow`, versionCode **10**, versionName `0.14.0-universe`. Branch-specific manual `build-yellow-v9-fcm.yml` controller is adapted from the protected controller: requires exact source SHA equal to workflow SHA, same permanent key/pinned certificate, exact package/code/name and nondebuggable release. It builds **OFFLINE HOLD** with empty API_BASE_URL, DEMO_MODE=true, ALERTS_ENABLED=false, FCM_ENABLED=false. No provider access and no production route. Permanent keys/config are temporary and never artifacts. Independent artifact/old-v0.13 certificate verification is required after build; do not infer from workflow name alone.

This APK is an offline inspection build, not live release approval. Installing it would replace v0.13 with an offline-only UI while preserving application identity/data. Do not represent it as live or advise a production install. A later authorized live APK should increase versionCode again, retain the key, and be reviewed separately. The old main controller is LIVE-configured and must NOT be used for this hold build. Dispatch the reviewed branch only after its exact commit CI passes.

## Data permission hard gate — NO-GO

PR #15 HANDOFF/audit reports Binance Support explicitly told this verified Indonesian operator that global USD-M Futures REST/WS including read-only is restricted. No superseding operator-specific written authorization was supplied in this request or PR discussion. We cannot independently authenticate that support transcript; its reported restriction is not overridden by a reachable Singapore server.

Official sources reviewed: https://www.binance.com/id/terms (eligibility §2, geographic restrictions §20.5, prohibition on circumventing restrictions including VPN); https://www.binance.com/en/blog/futures/5356979487504248448 (Futures market data page disclaimer: certain countries/users restricted). These public pages do not grant this operator a specific read-only futures-data license. No alternative source selected, no proxy/egress/account workaround. **LIVE NO-GO until written provider authorization for operator, derivatives read-only REST/WS, intended app use and hosting is verified.** No natural-market or phone FCM proof claimed.

## Railway / persistence / cost audit

Observed mount: volume `ea9edf2d-7294-443f-854c-001265c06405` (`yellow-journal-singapore`) at `/data`, 512 MB, `asia-southeast1-eqsg3a`. One replica, CPU 0.5, memory 500 MB; no staged changes. Existing start command `node scanner/src/live-main.js`. FCM/API variable names present; secret values not requested or printed. Feature YELLOW_1M_LONG_B_ENABLED absent from variable names; remains default OFF. No runtime files or journal were read/rewritten/deleted, no migration. Capacity config was not increased. No additional Railway resource provisioned. Existing running backend is not authorized anew by this audit.

**Backup is NOT independently verified.** Available connector has no volume-backup listing or file snapshot operation; mounted volume alone is not a backup, and deployment rollback does not restore journal contents. Backup/restore proof remains a second operational hold before future LIVE. Existing successful deployment ID is recorded, but current rollback capability must be refreshed before action.

## Future rollout and rollback (do not execute while NO-GO)

1. Verify written data entitlement and explicit operator LIVE approval. Obtain current config, source SHA and backup inventory; stop publication through an approved maintenance window and take a consistent protected backup of all `/data` including guard, HOME/claims, lane checkpoints and episode journal. Record checksum/time and test restore in an isolated no-network/no-FCM fixture environment. Never export secrets into artifacts.
2. CI must pass at exact backend/client source. Verify release signature against installed APK and increase code for any later live configuration. Keep endpoint/package/topic identities; review feature flag separately. Stage only GOLD exact commit in existing environment; review diff and mount before accepting deployment.
3. Verify terminal SUCCESS and approved API contract freshness, complete/partial counts, old ledger handling, no historical replay, valid naturally occurring episode and real phone foreground/background delivery. Do not force a pattern to manufacture a success.
4. On failure, stop new publication per approved plan, restore previously recorded source/config on SAME volume. Never delete/recreate `/data`; do not restore an older claims ledger casually (could replay notifications). Assess journal format compatibility before any data restore. Rollback target currently `b31412b...`, deployment above, has old schema: v0.14 will explicitly say BACKEND BELUM KOMPATIBEL. Rolling backend back alone cannot make v0.14 compatible. Android downgrade from versionCode10 to9 is not a normal upgrade; do not uninstall/clear data. A repair build with higher code/same signer is the client rollback path.
5. Keep PR draft/unmerged until hard gates pass. Handoff completion evidence belongs in PR comments with exact release SHA, CI/signing run IDs and public hashes.

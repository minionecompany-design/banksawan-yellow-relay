# YELLOW V2 — staged completion and API acceptance

Continues PR #20 from `d8b504ae21e46dbbdeb4ba520d860ada54b4f103`.
This stage adds offline operator validation only. No Android UI, signal logic,
production API behavior, signing configuration or Railway setting is changed.

## Completed while deployment is restricted

- Previous source CI: run `39774631105`, SUCCESS, including 11 Android behavior
  tests. Original package/signing reference remains `889cad23`; backend strategy
  reference remains `633404db`. One update APK, no Clean/LAB/BR/ONE.
- New tool: `scanner/scripts/audit-v2-api-contract.mjs`, consuming a saved JSON
  snapshot. It does not fetch, write, generate signals, install an APK, contact
  Binance/FCM or operate Railway.
- Independent acceptance checks: healthy connected feed, 50-symbol capacity,
  complete eligible UNIVERSE, strict >1% / 0<price<10 / quote turnover>10M,
  timestamps, honest allocated-versus-covered counts, steady min(N,50)/N,
  HOME/polling volume and event identity, duplicate IDs and expiry.
- 47/47 and 50/65 acceptance, healthy 0/0 without fabricated kline traffic,
  strict boundary rejection, missing data, stale feeds, malformed identity,
  snapshots whose membership changed, and actual current HTTP API serialization
  are tested. Full Node suite: **188/188 pass**.
- Production negative control: four existing public read-only API replies were
  saved on 22 October 2026, capturedAtMs `1792671178408`. The tool correctly
  rejected missing quote turnover in UNIVERSE/HOME and legacy slot reporting.
  In that sample, UNIVERSE had 40 eligible rows, all marked SCANNING. The tool
  derived 40 covered from rows; this does not make the legacy status counters
  valid or prove TradingView membership. No extra Binance request was triggered
  by reading these API routes, and no production mutation occurred.

This negative control shows that the old backend cannot be accidentally accepted
as the completed new API contract simply because its process is healthy.
An expected CLI exit 1 for that old response is not a test failure or downtime.

## Input and operator command

Save complete successful JSON replies from the same intended test deployment:

| JSON field | Source |
|---|---|
| `capturedAtMs` | Actual epoch milliseconds when collection completed |
| `status` | `/api/status` response body |
| `universe` | `/api/universe` response body |
| `home` | `/api/home` response body |
| `events` | `/api/events` response body |

Capture the replies close together. The tool compares local capture and server
UNIVERSE timestamps within 120 seconds, then checks feed ages relative to the
server timestamp. Do not invent missing volume, timestamps or event arrays.
The input contains public API state only; never add credentials.

```bash
node scanner/scripts/audit-v2-api-contract.mjs --snapshot saved-api-snapshot.json
```

Exit 0: this saved API contract passes. Exit 1: acceptance conditions not met.
Exit 2: unreadable/malformed CLI input. A changed membership between independent
API calls requires recapture during a stable interval; it is not automatically
a scanner defect. Partial bootstrap is reported as not ready, not silently
counted as full coverage. A healthy empty UNIVERSE can pass 0/0.

**A PASS is not release approval.** The report explicitly lists evidence this
tool cannot establish: deployed commit identity, CEX membership, real four-TF
device receipt, external TradingView app behavior, APK signer/update and
credential security. Empty polling/HOME arrays do not prove delivery or its
absence: earlier events may already have expired from those views.

## Next stages, preserving the owner's final contract

1. **Comparable market evidence:** use the existing `audit-cex-universe.mjs`
   with real Binance and TradingView exports collected in an allowed environment,
   matching filters and actual timestamps. Do not retry a blocked Binance route
   through another IP or production relay. No current comparison is claimed.
2. **Credentials and test-backend readiness:** review the Firebase credential
   under the Railway disclosure documented in stage 4; plan a coordinated
   replacement. Prepare an authorized test backend with the new API contract
   when hosting operations are available. Preserve the old production service.
3. **Signed update candidate:** use the existing protected V2 build path and
   exact reviewed source. Verify original signer, `id.banksawan.yellow`, newer
   versionCode and release mode with `verify-yellow-v2-upgrade.py`.
4. **Phone acceptance:** test updated TradingView with alternating PLAY/FOGO,
   browser fallback, real four-TF FCM receipt and polling/restart deduplication
   against the matching test backend. Robolectric is supporting evidence only.
5. **Final review and approved cutover:** present evidence and the intended
   deployment before requesting the owner's final production approval. After
   approval, validate the new backend before distributing/installing its APK
   update. An old volume-less backend must not be paired with the strict new
   client. Existing rollback/recovery options must be reviewed before cutover.

PR remains DRAFT. No production merge, restart, redeploy, variable/credential
change, new paid service, signed APK build or phone installation in this stage.

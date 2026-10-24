# YELLOW V2 — Railway read-only audit and Android behavior QA

Continues PR #20 from `0f782b9398c6c295ee5770d2dcea69d8ba69caea`.
One APK, existing UI, Firebase topic, API routes, package and permanent signer
remain the contract. No production rollback or deployment was requested by this
stage. No LAB, BR or ONE service was changed.

## Confirmed CI for the stage 3 source

GitHub Actions run `39770455575` succeeded on `0f782b9`:

- scanner job `119796366984`: 180 Node tests, policy tests, 15 Python checks;
- android-compile job `119796366692`: existing Android debug compilation,
  package/version checks and rejection of release signing without the key.

This supersedes the earlier observation that the run had not yet appeared.
It is not proof of a signed release or real phone delivery.

## Actual production identity and health, read only

Project: `banksawan-yellow-v2` (`f90b3116-25bc-4af8-ade4-0552625d60ca`).
Environment: production (`1fb5e959-c676-49c5-a1de-1dedbcb12410`).
Service: `yellow-live-shadow-yc94` (`5a0486e7-27d9-43fd-8d05-f80ffe381a26`).
Deployment: `798a6f91-6ec5-4f57-90bf-b4d75be5c00e`, SUCCESS.
Live commit: `b31412b36634b207852901aac2cf37325e4c6870`, source branch
`yellow-long-a-v2-20261015` (PR #12, 1m notification suppression).

The base `633404db` is a prior REMOVED deployment in history, not the current
live revision. PR #20 is the update under review, not deployed. There were no
staged changes. The service has a 512 MB volume at `/data` in Southeast Asia.
Restart policy is NEVER. No restart, redeploy, variable write, key revocation,
file deletion on the volume or new service creation was performed.

Existing public read-only API sampled on 22 October 2026 around 18:44 WIB:

- `/health`: HTTP 200, ok, circuit closed.
- `/api/status`: ticker and kline connected; no WS recovery; last data fresh.
- RequestGuard: 3052 calls, HTTP 200 for all 3052, circuitOpen=false.
- FCM: enabled, attempted=136, sent=136, failed=0. These are server-side
  HTTP delivery counters, not proof that Android displayed all messages.
- Alert lanes: `5m,15m,1h`; 153 LONG_A events suppressed by the old 1m policy.
- Legacy coverage reports 50 covered / 47 eligible, ratio >1; uncoveredEligible=2.
  It counts retained ineligible subscriptions as covered. PR #20 separates
  actual eligible coverage from allocated slots. Do not report this snapshot
  as 47/47 or claim the new strict quote-volume filter is already live.
- `/api/universe`: 47 rows; the old response lacks `quoteVolume24h`.
- `/api/home`: three records in that sample; legacy records lack quote turnover.

These endpoints only read existing process state. They do not request Binance
data on behalf of the audit. No blocked Binance request was retried through
another network or relayed through production. The earlier local HTTP 451 is
not evidence of a Railway scanner HTTP 451.

## Railway incident affecting release timing

Owner screenshot shows "Limited Access — Deploys have been paused due to an
upstream issue" while the existing service is Online. Official status checked
22 October 2026 reports an ongoing platform incident, slower queued deployments,
builds available for Pro/Enterprise and restoration pending for Hobby/Free/Trial.
The project's billing tier was not inferred from this banner.

Primary sources:

- https://status.railway.com/ (latest observed update: 22 October, 11:01 UTC).
- https://blog.railway.com/p/security-disclosure-wednesday-october-21st

The disclosure reports possible unauthorized access to some environment secrets
and recommends rotation and log review. This audit does not establish whether
this project was affected. The YELLOW service variable-name inventory includes
`YELLOW_FCM_SERVICE_ACCOUNT_JSON`; no secret value was retrieved. Review and
coordinate replacement of that Firebase service-account credential before an
approved release. Do not assume APK signing credentials were exposed: they are
provided by the separate protected GitHub release path, not this service's
listed Railway variables. Existing successful FCM counters do not prove the
credential is uncompromised. Do not repeatedly trigger deployment retries.

## Android behavior testing scope

The first execution against the unchanged notifier ran 11 tests: 10 passed;
the hash-collision regression failed with expected 2 notifications, actual 1.
`AQUSDT` and `B2USDT` are deliberately synthetic symbol-shaped test IDs with
equal Java hash codes; no market listing or real FCM send is assumed.
The old `manager.notify(id.hashCode(), ...)` could overwrite a different event.
The fix uses Android's complete event ID as the notification tag and a fixed
integer ID. Existing durable event claims are preserved; UI, signal policy,
notification content, channel, Firebase topic, package and signer are unchanged.

After the fix, local Java 17 / Android SDK 35 execution passed all **11/11**
tests: seven notifier tests and four routing tests, no skips or errors. The
concurrency test exercises 24 simultaneous attempts for the same event; exactly
one succeeds. Full Node regression passed **180/180** and Python verification
passed **15/15**. `git diff --check` passed. No release signing was performed.

The scoped CI now includes Robolectric JVM Android tests and publishes only
test reports, never a debug APK. No Firebase config, signing key or live API URL
is supplied to this test job. Tests exercise the production notifier and actual
button click handlers on Android SDK 35 framework shadows:

- two symbols × four independent TF notifications;
- duplicate delivery through the common notifier entry point and durable claims;
- notification permission rejection without consuming a claim;
- strict filter/identity rejection and sound-test isolation;
- distinct event IDs with equal Java hash codes;
- repeated PLAY/FOGO click sequences, explicit browser gesture, missing-TV-app
  fallback, and refusal of malformed symbol input.

Framework-shadow tests validate our Android code paths and emitted Intents.
They do not run the installed TradingView app, receive real Google FCM, certify
background power-management behavior or prove an update-in-place on the owner's
phone. Those real-device release gates remain open.

Test setup follows https://robolectric.org/getting-started/; JUnit and Robolectric
are `testImplementation` dependencies and are not packaged in the release APK.

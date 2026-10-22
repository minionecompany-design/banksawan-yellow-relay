# Firebase Stage 7 handoff — BANKSAWAN YELLOW Clean (22 Oct 2026)

**FCM STATUS: Firebase SDK receiver is compiled into QA source, but NOT CONNECTED / NOT REGISTERED / NOT SENDING / NO LIVE.**
The Firebase plugin or user-accessible Firebase Console is required to create or bind the project. This handoff makes the inputs deterministic; it is NOT proof that a Firebase project exists.

## Firebase Console: create the dedicated NEW project

1. In <https://console.firebase.google.com/> use **Add project**, name it `banksawan-yellow-clean` (project ID may be automatically suffixed for uniqueness), and keep it separate from YELLOW V2 and the deleted LAB/BR/ONE projects.
2. Prefer the no-cost **Spark** plan while only preparing FCM and registering the Android app. **Do not enable** Firestore, Cloud Functions, billing, Analytics, or other paid features for this exercise without explicit cost review.
3. Add **Android app QA** with EXACT applicationId `id.banksawan.yellow.qa`. This matches the isolated debug APK from this repository. For a future signed release, register a **second** Android app with `id.banksawan.yellow` only after the original V2 signing certificate/upgrade compatibility has been verified. Do not replace production APK or re-use the V2 Firebase project.
4. Download the Android app's `google-services.json` in a secure local location (not in GitHub PR, messages, or public links). This is **client configuration, not the Firebase Admin credential**; do not confuse the two.
5. For Android 13+ the app must request POST_NOTIFICATIONS after user consent. Receiving a device identifier/registration token is NOT consent to deliver notification alerts.
6. Cloud Messaging / FCM API should be enabled and available in the project. Any server-side service account or application-default credentials must be stored as protected server secrets only, never put in APK, files, or CI logs.
7. Only test FCM using a single explicitly consenting **QA device** first, then verify PLAY/FOGO target per message against the actually installed TradingView app. Do not trust emulator private intent receiver as proof of external app behavior.

## Current code prepared

| Component | File | State |
|---|---|---|
| Accepted LONG A persisted journal | `core/src/event-journal.js` | offline tests |
| Crash repair accepted → outbox | `core/src/reconcile-long-a.js` | offline tests |
| Offline outbox retry + leases | `core/src/offline-delivery-outbox.js` | offline tests |
| Data-only per-event FCM payload | `core/src/fcm-payload.js` | offline tests |
| Disabled-by-default mock FCM dispatcher | `core/src/offline-fcm-dispatch.js` | offline tests |
| Android strict push parser | `android/app/src/main/java/id/banksawan/yellow/clean/CleanPushContract.java` | JVM tests |
| Android immutable per-event PendingIntent QA | `android/app/src/main/java/id/banksawan/yellow/clean/QaPendingIntentProbe.java` | emulator tests |
| Firebase Messaging SDK / passive FirebaseMessagingService | `android/app/build.gradle`, `CleanFirebaseMessagingService.java` | implemented, QA consent OFF by default |
| Android QA consent / persistent event dedup | `CleanFcmConsent.java`, `CleanAlertLedger.java` | passive code exists, **no opt-in user interface or token registration** |
| Per-device durable fanout | not yet added | **BLOCKED** |
| Real backend send + delivery on handset | not yet added | **BLOCKED** |

## GitHub/Android SDK integration rules
- Android Firebase BoM pinned to **34.19.0**, Messaging dependency included. Gradle plugin **4.5.0** is applied conditionally only if `clean-rebuild/android/app/src/debug/google-services.json` exists **locally**. It must match debug applicationId `id.banksawan.yellow.qa`. This config is gitignored; **never commit any Firebase Admin service-account file**.
- Firebase auto-init and Analytics are DISABLED in AndroidManifest. The SDK receiver discards all pushes until local explicit QA opt-in AND OS notification permission are present. No consent UI or registration/refresh token upload exists yet, so the current CI APK CANNOT receive end-to-end FCM.
- When enabled in a subsequent milestone, receiver validates data-only `yellow-clean-v1` LONG A payload and binds notification click to a private per-event intent with the exact trading chart URI. Persisted dedup trades strict exactly-once semantics for crash-window safety: a crash after marking an event before showing notification may drop display. Device delivery QA remains mandatory.
- No Google Analytics, Crashlytics, Firestore, Cloud Functions or other unrelated SDK has been added.

The current mock transport accepts an injected test recipient only; it cannot safely address multiple devices and is intentionally not connected to any Firebase network endpoint.

## Security and activation gates

- Until separate Firebase configuration is validated, do NOT turn on FCM in Railway. Current Stage 6 `offline-http.js` explicitly REFUSES startup if `FCM_SENDING_ENABLED=true`, `FEED_MODE=LIVE`, or `YELLOW_LIVE_ENABLED=true`.
- Production needs durable per-recipient records, opt-in/unsubscribe, rotated identifier handling, invalid recipient cleanup, retry limits, expiry, and **client-side persistent dedup** by `eventId` to avoid repeated OS notifications.
- A successful FCM Admin `send()` returns a provider acceptance ID, not delivery/display proof; retain this distinction.
- LIVE source access rights for official Binance global USD-M from Indonesia, streaming candle completeness, Pine LONG A parity, and actual TradingView mobile deep links are separate approval gates.

## Railway when the provider recovers

Open `clean-rebuild/RAILWAY_STAGE6_INPUT.md`. First deploy ONLY the `NO_FEED` offline API in a brand-new isolated project. Do not paste any credentials until the Firebase project exists, permissions are configured and the server sender is implemented and tested. Google Cloud Messaging setup can proceed separately **before** Railway returns.

**References:** Firebase official Android FCM setup
https://firebase.google.com/docs/cloud-messaging/android/get-started
and Admin FCM send
https://firebase.google.com/docs/cloud-messaging/send/admin-sdk

## Cloud Messaging V1 screenshot acceptance (22 October 2026)

The owner's Firebase Console confirms:
- Firebase project `banksawan-yellow-clean` exists on Spark plan.
- Android app `id.banksawan.yellow.qa` has been registered.
- **Firebase Cloud Messaging API (V1): Enabled**.
- **Cloud Messaging API (Legacy): Disabled**. Legacy need not be enabled.
- **Web Push certificates:** irrelevant for this Android-only APK; do not generate.
- Do NOT open Manage Service Accounts or download Admin service-account JSON merely to build the Android QA APK.

## Controlled local Firebase client config — next gate

The downloaded `google-services.json` is a **client configuration**, NOT Firebase Admin credentials. To keep it out of source control, use a repository Actions secret. In the owner-authorized private GitHub repo, open **Settings → Secrets and variables → Actions → New repository secret**:
- Name: `YELLOW_QA_GOOGLE_SERVICES_JSON`
- Value: full contents of the previously downloaded `google-services.json` from the **QA Android app**.
- Do not paste the JSON into chat, commits, issues or PR comments.
- Source path for local Android Studio builds, if used instead:
  `clean-rebuild/android/app/src/debug/google-services.json` (ignored by git).
- The JSON must include Firebase `project_id: banksawan-yellow-clean` and Android client `id.banksawan.yellow.qa` or the QA workflow fails closed.

The isolated GitHub workflow `.github/workflows/yellow-clean-firebase-qa.yml` contains strict package/project checks and produces a debug-only artifact; it does **not** enable FCM opt-in, upload registration tokens, or send any push. It uses `workflow_dispatch`. GitHub normally requires a dispatchable workflow to be registered on the repository's default branch; if the workflow is not yet selectable while only in the PR branch, **do not merge PR #18 into production to work around that**. Review and approve a safe staging activation method separately.

**Next milestone after signed-off QA build:** implement explicit opt-in and Android permission UI without changing the user-locked HOME/UNIVERSE visual layouts, perform device registration with a user-authorized backend, and test one real data-only FCM message with exact event ID/TradingView URL. A Firebase project being enabled is not proof of device notification delivery.

## Stage 7 next: phone QA consent panel (source added; acceptance pending)

The **locked** HOME and UNIVERSE visuals remain unchanged. In a NEWLY
BUILT Firebase QA debug APK (`id.banksawan.yellow.qa`), long-press the
`OFFLINE QA` status banner to open a **separate, nonexported FCM QA panel**:

1. Choose **AKTIFKAN FCM QA (IZIN NOTIFIKASI)**. On Android 13+, grant
   notification permission in the system dialog. Neither auto-enrollment nor
   token generation happens before explicit consent.
2. The device may contact Firebase to acquire an FCM registration token.
   The panel confirms presence without showing its value. The user can
   explicitly choose **SALIN TOKEN PERANGKAT (PRIVAT)**, but must **never
   paste that token into chats/screenshots/issues/logs**. There is no
   automatic backend upload or real FCM sender yet.
3. Choose **UJI NOTIFIKASI LOKAL • PLAY (SIMULASI)** to test Android
   notification permission, per-event identity and private chart-click
   handler **without sending anything through Firebase or Binance**.
   This is not a real market candidate, and the notification states
   `TES LOKAL • BUKAN SINYAL PASAR`. Test event IDs are stored in a
   separate simulator ledger and cannot suppress real LONG_A event IDs.
4. Choose **NONAKTIFKAN FCM QA / CABUT IZIN APLIKASI** to revoke local
   consent, turn off FCM auto-init, and request token deletion. Local gating
   stops notifications immediately; successful provider-side token deletion
   must be verified later. Android's OS notification permission may need
   separate revocation in app settings.
5. **No real FCM** has been sent, no recipient subscription backend exists,
   and no transport/token database has been created. For genuine remote
   tests the sender must be a secured Google IAM/Firebase Admin process
   with per-device consent, an allowed message destination and rate limits.
   Firebase Console's notification-composer test may send a notification
   payload (not the strict data-only LONG A contract), so cannot by itself
   prove end-to-end LONG A delivery.

No default-on FCM behavior is permitted; do not reuse YELLOW V2 Firebase
project or signing secrets. If a build's Firebase app configuration is
missing, the panel visibly says so and prevents enrollment.

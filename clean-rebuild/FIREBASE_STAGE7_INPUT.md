# Firebase Stage 7 handoff — BANKSAWAN YELLOW Clean (22 Oct 2026)

**FCM STATUS: NOT CONNECTED / NOT SENDING / NO LIVE.**
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
| Real Firebase SDK/FirebaseMessagingService | not yet added | **BLOCKED: Firebase project config** |
| Token/FID or recipient registration and consent | not yet added | **BLOCKED** |
| Per-device durable fanout | not yet added | **BLOCKED** |
| Real backend send + delivery on handset | not yet added | **BLOCKED** |

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

# Explicit Firebase QA build trigger — 22 October 2026

The repository owner confirmed that GitHub Actions repository secret
`YELLOW_QA_GOOGLE_SERVICES_JSON` exists. This file intentionally triggers the
isolated Firebase QA debug build using a branch-scoped push workflow, because
`workflow_dispatch` for new workflow files in a PR branch may not appear
until the file exists on the default branch. **Do not merge the PR into
production for this.**

Acceptance criteria:
- Firebase client config belongs to project `banksawan-yellow-clean`.
- Android client package is exactly `id.banksawan.yellow.qa`.
- Debug-only APK; original `id.banksawan.yellow` app untouched.
- No real FCM send, no token registration, no device subscription, no Binance.
- Never echo the client JSON or load any old `YELLOW_FIREBASE_*` secrets.

This trigger is a user-authorized QA build only. The GitHub Actions result
must be inspected and accepted before suggesting a new phone APK.

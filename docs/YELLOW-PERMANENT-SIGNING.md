# Permanent YELLOW signer migration

The user approved preparing a new permanent signer and one-time reinstall on 17 October 2026 at 11:56 WIB. This approval does not authorize merging, deployment, uninstalling the current APK, or replacing Firebase credentials.

The installed APK is package `id.banksawan.yellow`, versionCode 5 / 0.9.0-ui-refresh, APK SHA256 `44cf03084ea63f8450948a6e8c1a7c48f3a0c90722f011e7627a493c6adcff70`. Its old Android Debug certificate SHA256 is `18493C452FA5D0138AD54750215E41A3A1CA07FA340CAA8502D426C0D5C81A3A`. The original artifact matches exactly, but no old private key is present in it. A new signer cannot update that old installation in place.

## Key ownership

Run `scripts/Prepare-Yellow-Signing.ps1` on the user's Windows computer. It finds keytool, generates RSA 3072 PKCS12 alias `yellow-permanent`, asks for a password interactively, exports a public certificate and records its SHA256. Private key and password are never sent to chat, committed, logged, or uploaded as an Actions artifact. The keystore is generated only once; the script refuses to overwrite it. Its private directory is Documents/BANKSAWAN-YELLOW-SIGNING. Keep a private encrypted backup and store the password separately.

If export fails after key creation, keep the existing keystore and export its certificate separately. Do not rerun key generation or delete the key. A missing keytool is an explicit error; do not silently substitute a different signer.

## GitHub setup after local creation

Use this repository's Settings → Secrets and variables → Actions, not BR's repository.

| Secret | Value |
| --- | --- |
| YELLOW_SIGNING_KEYSTORE_B64 | Encrypted PKCS12 bytes as base64; the setup script's `-CopyForGitHub` mode copies it without printing it |
| YELLOW_SIGNING_STORE_PASSWORD | The password chosen locally; do not paste it into chat |
| YELLOW_SIGNING_CERT_SHA256 | The public certificate SHA256 from the setup result |

Existing YELLOW_FIREBASE_PROJECT_ID and YELLOW_FIREBASE_GOOGLE_SERVICES_JSON_BASE64 remain unchanged. Alias is fixed to `yellow-permanent`; PKCS12 key password equals the store password. The certificate fingerprint pins the expected signing key and makes accidental key replacement fail closed.

## One release path

The existing main-branch `.github/workflows/build-yellow-v9-fcm.yml` controller is proposed to become the single permanent-signed Firebase release builder. It accepts an exact reviewed 40-character source commit; checks out that commit without persisted git credentials; verifies the YELLOW Firebase package/project and certificate; builds `assembleRelease`; verifies APK integrity, expected signer, live/FCM flags, package, non-debuggable mode and versionCode >5; uploads only APK and public receipts; then deletes temporary keystore/config. It never deploys Railway, sends an FCM message, or moves a production branch.

The production-branch legacy android-debug.yml distributors are retired (manual-only, jobs disabled) to prevent accidental random-debug-key APKs being published alongside the signed build. PR review CI may compile with a disposable TEST-ONLY key; it never distributes that test APK or reads production signing secrets.

The controller and source changes are separate review branches targeting their existing main/production branches. Both remain unmerged until explicit approval. The signed build cannot run until the user's local key is created, the three GitHub secrets are configured, and the reviewed controller is available on the default branch. There is no generated production key or signed release APK yet.

## Migration and acceptance

Prepare and verify the signed release APK first. Only then perform the approved one-time reinstall on the phone; local notification claims/settings reset, while server-side HOME/event claims on /data are not deleted. Re-enable notification permission and validate the existing YELLOW-only FCM topic. Never uninstall BR. Subsequent YELLOW updates must retain the same package/certificate and increase versionCode.

Physical latency, FCM receipt and natural repeated LONG A remain pending. The earlier Pine v1.3 versus screenshot v1.3.7 parity limitation remains separate from APK signing.

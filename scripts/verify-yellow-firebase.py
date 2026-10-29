"""Fail-closed validation of YELLOW-only Firebase Android config.

Never prints project secrets/identifiers or the JSON; this script runs in GitHub CI
before the FCM-enabled APK is compiled. Python stdlib only.
"""
import json
import pathlib
import sys

PACKAGE = "id.banksawan.yellow"


def verify(document, expected_project):
    if not isinstance(document, dict) or not expected_project or not isinstance(expected_project, str):
        raise ValueError("INVALID_EXPECTED_FIREBASE_PROJECT")
    info = document.get("project_info")
    project = info.get("project_id") if isinstance(info, dict) else None
    if not project or project != expected_project:
        raise ValueError("FIREBASE_PROJECT_ID_MISMATCH")
    clients = document.get("client")
    if not isinstance(clients, list):
        raise ValueError("MISSING_FIREBASE_ANDROID_CLIENTS")
    matches = [c for c in clients if isinstance(c, dict) and isinstance(c.get("client_info"), dict)
               and isinstance(c["client_info"].get("android_client_info"), dict)
               and c["client_info"]["android_client_info"].get("package_name") == PACKAGE]
    if len(matches) != 1:
        raise ValueError("YELLOW_ANDROID_PACKAGE_NOT_UNIQUE_OR_MISSING")
    if not matches[0]["client_info"].get("mobilesdk_app_id"):
        raise ValueError("MISSING_FIREBASE_MOBILE_APP_ID")
    return True


def main():
    if len(sys.argv) != 3:
        print("Usage: verify-yellow-firebase.py google-services.json EXPECTED_FIREBASE_PROJECT_ID", file=sys.stderr)
        return 2
    try:
        verify(json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf8")), sys.argv[2])
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"YELLOW_FIREBASE_CONFIG_REJECTED: {type(exc).__name__}", file=sys.stderr)
        return 1
    print("YELLOW_FIREBASE_ANDROID_CONFIG_PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Read-only release gate against the verified original V2 public identity.

Usage: python3 scripts/verify-yellow-v2-upgrade.py CANDIDATE.apk
YELLOW_APKSIGNER and YELLOW_AAPT may point to Android SDK executables.
No private key, Firebase credential, install, signing or network operation.
"""
import importlib.util
import os
import pathlib
import re
import subprocess
import sys

# Verified from GitHub Actions run 39011959483, artifact 12093670036.
# source-commit.txt: 889cad23d7303084104e9d2b51ef85a1994136cb
# APK SHA256: bab529b9d8dccefa055053d3f4a121f4d46931de1a1bd05193f9104888d8c87b
V2_CERT_SHA256 = 'e01d7a096fe4c50736726baab406af91e0444d9fad462b787d17d937063e8e4f'
V2_PACKAGE = 'id.banksawan.yellow'
V2_VERSION_CODE = 6


def verify_badging(text):
    package = re.search(r"^package: name='([^']+)' versionCode='(\d+)'", text, re.M)
    if not package or package.group(1) != V2_PACKAGE:
        raise ValueError('YELLOW_V2_PACKAGE_MISMATCH')
    version = int(package.group(2))
    if version <= V2_VERSION_CODE:
        raise ValueError('YELLOW_V2_VERSION_NOT_NEWER')
    if re.search(r'^application-debuggable\b', text, re.M):
        raise ValueError('YELLOW_V2_DEBUGGABLE_RELEASE')
    return version


def main():
    if len(sys.argv) != 2:
        print('Usage: verify-yellow-v2-upgrade.py CANDIDATE.apk', file=sys.stderr)
        return 2
    try:
        spec = importlib.util.spec_from_file_location('yellow_signer', pathlib.Path(__file__).with_name('verify-yellow-apk-signature.py'))
        signer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(signer)
        result = subprocess.run([os.environ.get('YELLOW_APKSIGNER', 'apksigner'),
                                 'verify', '--print-certs', sys.argv[1]],
                                text=True, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise ValueError('YELLOW_APK_SIGNATURE_INVALID')
        signer.verify_output(result.stdout, V2_CERT_SHA256)
        result = subprocess.run([os.environ.get('YELLOW_AAPT', 'aapt'), 'dump', 'badging', sys.argv[1]],
                                text=True, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise ValueError('YELLOW_APK_BADGING_INVALID')
        version = verify_badging(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print('YELLOW_V2_UPGRADE_REJECTED: ' + str(exc), file=sys.stderr)
        return 1
    print('YELLOW_V2_UPGRADE_PASS package=' + V2_PACKAGE + ' versionCode=' + str(version)
          + ' signerSHA256=' + V2_CERT_SHA256.upper())
    return 0


if __name__ == '__main__':
    sys.exit(main())

"""Verify APK integrity and exact expected signer with Android SDK apksigner.

Only public certificate digest is printed; the private keystore is never read.
"""
import hmac
import os
import re
import subprocess
import sys


def expected_digest(value):
    digest = value.strip().replace(':', '').lower()
    if not re.fullmatch(r'[0-9a-f]{64}', digest):
        raise ValueError('INVALID_EXPECTED_SIGNER_SHA256')
    return digest


def verify_output(output, expected):
    expected = expected_digest(expected)
    digests = re.findall(r'^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-fA-F]+)\s*$', output, re.M)
    if len(digests) != 1 or not hmac.compare_digest(digests[0].lower(), expected):
        raise ValueError('YELLOW_APK_SIGNER_MISMATCH')
    return expected


def main():
    if len(sys.argv) != 3:
        print('Usage: verify-yellow-apk-signature.py APK EXPECTED_SHA256', file=sys.stderr)
        return 2
    try:
        expected_digest(sys.argv[2])
        tool = os.environ.get('YELLOW_APKSIGNER', 'apksigner')
        result = subprocess.run([tool, 'verify', '--print-certs', sys.argv[1]],
                                text=True, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise ValueError('YELLOW_APK_SIGNATURE_INVALID')
        digest = verify_output(result.stdout, sys.argv[2])
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print('YELLOW_SIGNING_REJECTED: ' + str(exc), file=sys.stderr)
        return 1
    print('YELLOW_APK_SIGNER_PASS SHA256=' + digest.upper())
    return 0


if __name__ == '__main__':
    sys.exit(main())

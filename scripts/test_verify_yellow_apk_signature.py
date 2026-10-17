import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('signer', pathlib.Path(__file__).with_name('verify-yellow-apk-signature.py'))
signer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signer)


class SignerTests(unittest.TestCase):
    def test_exact_public_certificate(self):
        self.assertEqual(signer.verify_output('Signer #1 certificate SHA-256 digest: ' + 'ab' * 32, 'AB:' * 31 + 'AB'), 'ab' * 32)

    def test_wrong_key_fails(self):
        with self.assertRaisesRegex(ValueError, 'MISMATCH'):
            signer.verify_output('Signer #1 certificate SHA-256 digest: ' + 'ab' * 32, 'cd' * 32)

    def test_multiple_signers_fail(self):
        with self.assertRaisesRegex(ValueError, 'MISMATCH'):
            signer.verify_output('\n'.join('Signer #' + str(n) + ' certificate SHA-256 digest: ' + 'ab' * 32 for n in [1, 2]), 'ab' * 32)

    def test_empty_certificate_fails(self):
        with self.assertRaisesRegex(ValueError, 'MISMATCH'):
            signer.verify_output('', 'ab' * 32)

    def test_bad_expected_digest_fails(self):
        for value in ['', 'x' * 64, 'ab' * 31]:
            with self.assertRaisesRegex(ValueError, 'INVALID'):
                signer.expected_digest(value)


if __name__ == '__main__':
    unittest.main()

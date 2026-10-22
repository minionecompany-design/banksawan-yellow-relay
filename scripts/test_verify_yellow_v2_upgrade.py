import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('upgrade', pathlib.Path(__file__).with_name('verify-yellow-v2-upgrade.py'))
upgrade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upgrade)


class UpgradePolicy(unittest.TestCase):
    def test_newer_v2_release(self):
        self.assertEqual(upgrade.verify_badging("package: name='id.banksawan.yellow' versionCode='8' versionName='0.12'\n"), 8)

    def test_downgrade_or_reinstall_is_not_an_upgrade(self):
        for version in [0, 5, 6]:
            with self.subTest(version=version), self.assertRaisesRegex(ValueError, 'VERSION_NOT_NEWER'):
                upgrade.verify_badging("package: name='id.banksawan.yellow' versionCode='" + str(version) + "'\n")

    def test_second_app_is_rejected(self):
        for package in ['id.banksawan.yellow.clean', 'id.banksawan.yellow.lab', 'id.banksawan.br']:
            with self.subTest(package=package), self.assertRaisesRegex(ValueError, 'PACKAGE_MISMATCH'):
                upgrade.verify_badging("package: name='" + package + "' versionCode='99'\n")

    def test_debug_and_unreadable_badging_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'DEBUGGABLE_RELEASE'):
            upgrade.verify_badging("package: name='id.banksawan.yellow' versionCode='8'\napplication-debuggable\n")
        with self.assertRaisesRegex(ValueError, 'PACKAGE_MISMATCH'):
            upgrade.verify_badging('not an APK')


if __name__ == '__main__':
    unittest.main()

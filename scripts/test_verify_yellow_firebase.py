import unittest
from importlib import import_module
from pathlib import Path
import importlib.util

spec = importlib.util.spec_from_file_location("verify", Path(__file__).with_name("verify-yellow-firebase.py"))
verify_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_mod)

class FirebaseValidatorTest(unittest.TestCase):
    def config(self, project="yellow-test", package="id.banksawan.yellow"):
        return {"project_info": {"project_id": project}, "client": [
            {"client_info": {"mobilesdk_app_id": "1:123:android:xyz",
                             "android_client_info": {"package_name": package}}}]}

    def test_valid(self):
        self.assertTrue(verify_mod.verify(self.config(), "yellow-test"))

    def test_reject_other_firebase_project(self):
        with self.assertRaisesRegex(ValueError, "PROJECT_ID_MISMATCH"):
            verify_mod.verify(self.config("br-project"), "yellow-test")

    def test_reject_other_android_package(self):
        with self.assertRaisesRegex(ValueError, "ANDROID_PACKAGE"):
            verify_mod.verify(self.config(package="id.banksawan.br"), "yellow-test")

    def test_reject_duplicate_android_clients(self):
        doc = self.config()
        doc["client"].append(doc["client"][0])
        with self.assertRaisesRegex(ValueError, "NOT_UNIQUE"):
            verify_mod.verify(doc, "yellow-test")

    def test_reject_no_expected_project_id(self):
        with self.assertRaises(ValueError):
            verify_mod.verify(self.config(), "")

    def test_reject_missing_mobile_app_id(self):
        doc = self.config()
        del doc["client"][0]["client_info"]["mobilesdk_app_id"]
        with self.assertRaisesRegex(ValueError, "MISSING_FIREBASE_MOBILE_APP_ID"):
            verify_mod.verify(doc, "yellow-test")

if __name__ == '__main__':
    unittest.main()

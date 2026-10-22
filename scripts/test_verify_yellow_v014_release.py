import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('release',pathlib.Path(__file__).with_name('verify-yellow-v014-release.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
B="package: name='id.banksawan.yellow' versionCode='11' versionName='0.15.0-four-long-a'"
C='boolean DEMO_MODE = true; boolean ALERTS_ENABLED = false; boolean FCM_ENABLED = false; String API_BASE_URL = "";'
class Release(unittest.TestCase):
 def test_exact(self): self.assertTrue(m.verify(B,C))
 def test_wrong_versions_package_debug(self):
  for b in [B.replace("'11'","'10'"),B.replace("'11'","'12'"),B.replace('id.banksawan.yellow','id.banksawan.lab'),B+' application-debuggable']:
   with self.assertRaises(ValueError):m.verify(b,C)
 def test_live_flags_or_endpoint_rejected(self):
  for c in [C.replace('DEMO_MODE = true','DEMO_MODE = false'),C.replace('ALERTS_ENABLED = false','ALERTS_ENABLED = true'),C.replace('FCM_ENABLED = false','FCM_ENABLED = true'),C.replace('""','"https://example.org"')]:
   with self.assertRaises(ValueError):m.verify(B,c)

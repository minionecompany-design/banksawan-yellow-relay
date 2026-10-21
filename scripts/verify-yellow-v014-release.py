"""Exact v0.14 offline-hold release gate. No secrets or market access."""
import re,sys,pathlib

def verify(badging,config):
    if not re.search(r"package: name='id\.banksawan\.yellow' versionCode='10' versionName='0\.14\.0-universe'",badging):
        raise ValueError('WRONG_PACKAGE_OR_EXACT_VERSION')
    if 'application-debuggable' in badging: raise ValueError('DEBUG_NOT_RELEASE')
    for key,value in [('DEMO_MODE','true'),('ALERTS_ENABLED','false'),('FCM_ENABLED','false')]:
        if not re.search(r'\b'+key+r'\s*=\s*'+value+r'\s*;',config): raise ValueError('UNSAFE_HOLD_'+key)
    if not re.search(r'\bAPI_BASE_URL\s*=\s*""\s*;',config): raise ValueError('HOLD_MUST_HAVE_NO_ENDPOINT')
    return True
if __name__=='__main__':
    verify(pathlib.Path(sys.argv[1]).read_text(),pathlib.Path(sys.argv[2]).read_text())
    print('YELLOW_V014_PACKAGE_VERSION_OFFLINE_HOLD_PASS')

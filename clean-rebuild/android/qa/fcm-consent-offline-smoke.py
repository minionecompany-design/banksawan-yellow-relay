#!/usr/bin/env python3
"""No-Firebase-config QA: long press existing status banner to reach
private FCM opt-in panel, verify no automatic enrollment or token UI.
No external service or notifications are contacted.
"""
import pathlib,re,subprocess,time
from xml.etree import ElementTree as ET
OUT=pathlib.Path("clean-rebuild/android/qa/screenshots")
OUT.mkdir(parents=True,exist_ok=True)
def adb(*args,raw=False):
 p=subprocess.run(["adb",*args],check=True,capture_output=True)
 return p.stdout if raw else p.stdout.decode(errors="replace")
def dump(tag):
 adb("shell","uiautomator","dump","/sdcard/window.xml")
 data=adb("exec-out","cat","/sdcard/window.xml",raw=True)
 (OUT/(tag+".xml")).write_bytes(data)
 (OUT/(tag+".png")).write_bytes(adb("exec-out","screencap","-p",raw=True))
 return ET.fromstring(data)
def nodes(root):
 return [x for x in root.iter("node")]
def texts(root):
 return " ".join(n.attrib.get("text","") for n in nodes(root))
def middle(n):
 m=re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]",n.attrib.get("bounds",""))
 if not m: raise AssertionError("BAD_BOUNDS")
 return ((int(m[1])+int(m[3]))//2,(int(m[2])+int(m[4]))//2)
adb("shell","am","force-stop","id.banksawan.yellow.qa")
adb("shell","am","start","-n","id.banksawan.yellow.qa/id.banksawan.yellow.clean.CleanMainActivity")
time.sleep(2)
root=dump("fcm-before-longpress")
status=next((n for n in nodes(root) if "OFFLINE QA" in n.attrib.get("text","")),None)
assert status is not None,"QA_STATUS_MISSING"
x,y=middle(status)
adb("shell","input","swipe",str(x),str(y),str(x),str(y),"1000")
time.sleep(1)
qa=dump("fcm-optin-private-screen")
t=texts(qa)
assert "YELLOW CLEAN" in t and "TES FCM" in t,("PRIVATE_FCM_SCREEN_MISSING",t)
assert "Firebase belum terkonfigurasi" in t,("FCM_DEFAULT_DISABLE_MISSING",t)
enable=next((n for n in nodes(qa) if n.attrib.get("text","")=="AKTIFKAN FCM QA (IZIN NOTIFIKASI)"),None)
assert enable is not None and enable.attrib.get("enabled")=="false",("UNCONFIGURED_FCM_ENABLED",t)
back=next((n for n in nodes(qa) if n.attrib.get("text","")=="KEMBALI KE YELLOW"),None)
assert back is not None
x,y=middle(back)
adb("shell","input","tap",str(x),str(y))
time.sleep(1)
after=dump("fcm-return-locked-home")
assert "BANKSAWAN YELLOW" in texts(after) and "DATA TIDAK TERSEDIA" in texts(after)
print("FCM_QA_CONSENT_DENY_BY_DEFAULT_AND_PRIVATE_PANEL_PASS")

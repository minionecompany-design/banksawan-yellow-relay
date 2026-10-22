#!/usr/bin/env python3
"""Offline emulator structural QA. Never claims pixel-identical V2 parity."""
import pathlib, re, subprocess, time
from xml.etree import ElementTree as ET
OUT=pathlib.Path('clean-rebuild/android/qa/screenshots')
OUT.mkdir(parents=True,exist_ok=True)
PACKAGE='id.banksawan.yellow'
def adb(*args,output=False):
    p=subprocess.run(['adb',*args],capture_output=True,check=True)
    return p.stdout if output else p.stdout.decode(errors='replace')
def dump(tag):
    adb('shell','uiautomator','dump','/sdcard/window.xml')
    content=adb('exec-out','cat','/sdcard/window.xml',output=True)
    (OUT/(tag+'.xml')).write_bytes(content)
    png=adb('exec-out','screencap','-p',output=True)
    (OUT/(tag+'.png')).write_bytes(png)
    root=ET.fromstring(content)
    return root
def texts(root):
    return [n.attrib.get('text','') for n in root.iter('node') if n.attrib.get('text')]
def tap_label(root,label):
    for n in root.iter('node'):
        if n.attrib.get('text','')==label and n.attrib.get('class','')=='android.widget.Button':
            bbox=n.attrib.get('bounds','')
            m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',bbox)
            if m:
                x=(int(m.group(1))+int(m.group(3)))//2
                y=(int(m.group(2))+int(m.group(4)))//2
                adb('shell','input','tap',str(x),str(y))
                time.sleep(1)
                return
    raise AssertionError('TAB_NOT_FOUND:'+label)
for width,height,tag in [(1080,2400,'360dp'),(1236,2748,'412dp')]:
    adb('shell','wm','size',f'{width}x{height}')
    adb('shell','wm','density','420' if width==1080 else '440')
    adb('shell','am','force-stop',PACKAGE)
    adb('shell','am','start','-n',PACKAGE+'/.clean.CleanMainActivity')
    time.sleep(2)
    root=dump(tag+'-home')
    t=' '.join(texts(root))
    assert 'BANKSAWAN YELLOW' in t and 'HOME' in t and 'UNIVERSE' in t, ('HOME_SHELL_MISSING',t)
    assert 'DATA TIDAK TERSEDIA' in t, ('FAKE_LIVE_HOME',t)
    tap_label(root,'UNIVERSE')
    root=dump(tag+'-universe')
    t=' '.join(texts(root))
    for phrase in ['UNIVERSE','Eligible Universe:', 'Actively Tracked:', 'Symbol','Last Price']:
        assert phrase in t, ('UNIVERSE_TABLE_MISSING',phrase,t)
    assert 'PLAYUSDT' not in t and 'FOGOUSDT' not in t, ('FABRICATED_MARKET_DATA',t)
    tap_label(root,'HOME')
    root=dump(tag+'-returned-home')
    assert 'BELUM ADA SINYAL' in ' '.join(texts(root)) or 'DATA TIDAK TERSEDIA' in ' '.join(texts(root))
adb('shell','wm','size','reset')
adb('shell','wm','density','reset')
print('OFFLINE_CLEAN_ANDROID_360_412_SMOKE_PASS')

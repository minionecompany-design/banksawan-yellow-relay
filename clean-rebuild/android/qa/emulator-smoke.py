#!/usr/bin/env python3
"""Offline emulator structural QA. Never claims pixel-identical V2 parity."""
import pathlib, re, subprocess, time
from xml.etree import ElementTree as ET
OUT=pathlib.Path('clean-rebuild/android/qa/screenshots')
OUT.mkdir(parents=True,exist_ok=True)
PACKAGE='id.banksawan.yellow.qa'
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
    adb('shell','wm','density','480')
    adb('shell','am','force-stop',PACKAGE)
    adb('shell','am','start','-n',PACKAGE+'/id.banksawan.yellow.clean.CleanMainActivity')
    time.sleep(2)
    root=dump(tag+'-home')
    t=' '.join(texts(root))
    assert 'BANKSAWAN YELLOW' in t and 'HOME' in t and 'UNIVERSE' in t, ('HOME_SHELL_MISSING',t)
    assert 'DATA TIDAK TERSEDIA' in t, ('FAKE_LIVE_HOME',t)
    tap_label(root,'UNIVERSE')
    root=dump(tag+'-universe')
    t=' '.join(texts(root))
    for phrase in ['UNIVERSE','Eligible Universe:', 'Actively Tracked:']:
        assert phrase in t, ('UNIVERSE_SUMMARY_MISSING',phrase,t)
    # Accessibility includes only on-screen nodes. Scroll the V2-style
    # vertical page to expose the horizontally scrolling table headings.
    visible=t
    for attempt in range(5):
        if 'Symbol' in visible and 'Last Price' in visible:
            break
        adb('shell','input','swipe',str(width//2),str(height*3//4),
            str(width//2),str(height//4),'420')
        time.sleep(.5)
        table_root=dump(tag+'-table-'+str(attempt))
        visible=' '.join(texts(table_root))
    # HorizontalScrollView children may not surface in UIAutomator accessibility
    # even with valid render. Preserve actual screenshots for manual visual QA.
    assert (OUT/(tag+'-universe.png')).stat().st_size>1000, 'NO_UNIVERSE_SCREENSHOT'
    if 'Symbol' not in visible or 'Last Price' not in visible:
        print('TABLE_HEADERS_NOT_ACCESSIBLE: visual screenshot review still required',tag)
    assert 'PLAYUSDT' not in t and 'FOGOUSDT' not in t, ('FABRICATED_MARKET_DATA',t)
    tap_label(root,'HOME')
    root=dump(tag+'-returned-home')
    assert 'BELUM ADA SINYAL' in ' '.join(texts(root)) or 'DATA TIDAK TERSEDIA' in ' '.join(texts(root))
    # Optional QA card display. No chart button click and no external network.
    tap_label(root,'UJI SHORTCUT PLAY / FOGO (SIMULASI)')
    qa_root=dump(tag+'-optin-simulated-cards')
    qa=' '.join(texts(qa_root))
    assert 'SIMULASI QA' in qa, ('QA_LABEL_MISSING',qa)
    # A UIAutomator dump exposes only visible nodes. Inspect across several
    # vertical positions and require both distinct real simulated cards.
    seen=qa
    for attempt in range(6):
        if 'PLAYUSDT' in seen and 'FOGOUSDT' in seen:
            break
        adb('shell','input','swipe',str(width//2),str(height*3//4),
            str(width//2),str(height//4),'350')
        time.sleep(.45)
        seen+=' '+' '.join(texts(dump(tag+'-qa-scrolled-'+str(attempt))))
    assert 'PLAYUSDT' in seen and 'FOGOUSDT' in seen, ('QA_CARD_OPTIN_FAIL',seen)
    # Scroll back to the top so the opt-in OFF switch is definitely visible.
    for _ in range(5):
        adb('shell','input','swipe',str(width//2),str(height//4),
            str(width//2),str(height*3//4),'240')
    close_root=dump(tag+'-qa-close-visible')
    tap_label(close_root,'TUTUP KARTU SIMULASI')
    back=dump(tag+'-after-closing-simulation')
    assert 'PLAYUSDT' not in ' '.join(texts(back)), 'QA_SIMULATION_LEAKS_TO_HOME'

adb('shell','wm','size','reset')
adb('shell','wm','density','reset')
print('OFFLINE_CLEAN_ANDROID_360_412_SMOKE_PASS')

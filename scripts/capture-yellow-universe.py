"""Offline emulator UI proof; never launches a live-configured APK."""
import subprocess,time,pathlib,xml.etree.ElementTree as ET,re
out=pathlib.Path('docs/v014/emulator');out.mkdir(parents=True,exist_ok=True)
def adb(*args):return subprocess.check_output(['adb',*args])
def nodes():
 adb('shell','uiautomator','dump','/sdcard/yellow-ui.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/yellow-ui.xml')).iter('node')
def tap(text):
 for _ in range(15):
  for n in nodes():
   if n.get('text','')==text:
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));return
  time.sleep(1)
 raise AssertionError('UI target absent: '+text)
def capture(name):
 data=adb('exec-out','screencap','-p');assert data.startswith(b'\x89PNG');(out/(name+'.png')).write_bytes(data)
 (out/(name+'.xml')).write_bytes(adb('shell','cat','/sdcard/yellow-ui.xml'))
adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk')
for width,height,label in [(1080,2400,'360dp'),(1236,2748,'412dp')]:
 adb('shell','wm','size',f'{width}x{height}');adb('shell','wm','density','480')
 adb('shell','am','force-stop','id.banksawan.yellow')
 adb('shell','am','start','-n','id.banksawan.yellow/.MainActivity');tap('UNIVERSE')
 for _ in range(15):
  text=' '.join(n.get('text','') for n in nodes())
  if 'PLAYUSDT' in text:break
  time.sleep(1)
 assert 'Eligible Universe: 4' in text and 'Actively Tracked: 2 / 50' in text,text
 capture(label+'-left')
 # Scroll the shared table to the quote-volume/status columns.
 # Android UIAutomator may omit non-accessible HorizontalScrollView nodes.
 # Anchor gesture to the visible results-counter immediately above the table.
 labels=[n for n in nodes() if 'hasil' in n.get('text','') and 'Geser tabel' in n.get('text','')]
 assert labels,'UNIVERSE table counter is not visible'
 _,_,_,counterBottom=map(int,re.findall(r'\\d+',labels[0].get('bounds')))
 screenHeight=int(adb('shell','wm','size').decode().strip().split(':')[-1].strip().split('x')[1])
 y=min(counterBottom+70,screenHeight-300)
 adb('shell','input','swipe',str(width-45),str(y),'35',str(y),'550');time.sleep(1)
 text=' '.join(n.get('text','') for n in nodes());assert 'TRACKED' in text and 'ELIGIBLE' in text,text
 capture(label+'-right')
 # Search operates on local snapshot and retains fixture totals.
 for n in nodes():
  if n.get('class')=='android.widget.EditText':
   x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));break
 adb('shell','input','text','PLAY');adb('shell','input','keyevent','4');time.sleep(1)
 text=' '.join(n.get('text','') for n in nodes());assert '1 hasil' in text,text
 capture(label+'-search')
print('OFFLINE_ANDROID_UI_PASS 360dp + 412dp; no Samsung hardware claim')

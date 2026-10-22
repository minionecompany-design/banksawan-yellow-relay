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
 # Bring table cells into the accessibility viewport before horizontal scrolling.
 # The top of the page and the table are inside a vertical scroll container.
 def visible_text():return ' '.join(n.get('text','') for n in nodes())
 for attempt in range(5):
  if 'PLAYUSDT' in visible_text():break
  adb('shell','input','swipe',str(width//2),str(height-220),str(width//2),'330','420');time.sleep(.6)
 if 'PLAYUSDT' not in visible_text():
  capture(label+'-table-missing')
  print('UNIVERSE_VISIBLE_TEXT:',visible_text(),flush=True)
  raise AssertionError('UNIVERSE fixture row did not become accessible after vertical scroll; see captured screen and XML')
 capture(label+'-left')
 # Swipe across a visible table row. UIAutomator may omit container nodes.
 matches=[n for n in nodes() if n.get('text','')=='PLAYUSDT']
 assert matches,'Expected first fixture row is inaccessible'
 x1,y1,x2,y2=map(int,re.findall(r'\d+',matches[0].get('bounds')))
 y=(y1+y2)//2
 adb('shell','input','swipe',str(width-35),str(y),'35',str(y),'550');time.sleep(1)
 text=visible_text()
 assert 'TRACKED' in text or 'ELIGIBLE' in text,'Right status column not visible after horizontal swipe: '+text
 capture(label+'-right')
 # Return to visible search field; UIAutomator only reports on-screen controls.
 for attempt in range(6):
  fields=[n for n in nodes() if n.get('class')=='android.widget.EditText']
  if fields:break
  adb('shell','input','swipe',str(width//2),'360',str(width//2),str(height-180),'420');time.sleep(.6)
 assert fields,'UNIVERSE search field missing after scrolling to top'
 x1,y1,x2,y2=map(int,re.findall(r'\d+',fields[0].get('bounds')))
 adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
 adb('shell','input','text','PLAY');adb('shell','input','keyevent','4');time.sleep(1)
 text=' '.join(n.get('text','') for n in nodes());assert '1 hasil' in text,text
 capture(label+'-search')
print('OFFLINE_ANDROID_UI_PASS 360dp + 412dp; no Samsung hardware claim')

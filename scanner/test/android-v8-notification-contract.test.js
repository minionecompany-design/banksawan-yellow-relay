import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = path=>readFile(new URL('../../'+path, import.meta.url),'utf8');

test('V8 Android foreground notifications poll YELLOW read-only events every 10s, independently of trading',async()=>{
  const java=await source('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
  assert.match(java,/eventsTask=.*?pollLongAEvents\(\).*?10_000/s);
  assert.match(java,/BuildConfig\.ALERTS_ENABLED/);
  assert.match(java,/\/api\/events\?afterMs=/);
  assert.match(java,/oneB&&tf\.equals\("1m"\)/);
  assert.match(java,/!oneB&&\(tf\.equals\("5m"\)/);
  assert.match(java,/YellowNotifier\.claimAndNotify\(this,signal,id,symbol,tf/);
  assert.match(java,/handler\.removeCallbacks\(eventsTask\)/);
});

test('V9 sound self-test remains separate from LONG A, with no HOME button',async()=>{
  const main=await source('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
  const notifier=await source('android/app/src/main/java/id/banksawan/yellow/YellowNotifier.java');
  assert.doesNotMatch(main,/TES SUARA NOTIFIKASI \(BUKAN SINYAL\)/);
  assert.match(main,/testNotificationSound\(\)/);
  assert.match(notifier,/"yellow_sound_test_v8"/);
  assert.match(notifier,/setContentTitle\("TES SUARA BANKSAWAN YELLOW"\)/);
  assert.match(notifier,/Uji notifikasi lokal, BUKAN sinyal LONG A/);
  assert.match(notifier,/NotificationManager\.IMPORTANCE_HIGH/);
  assert.match(notifier,/setSound\(defaultSound\(\),soundAttributes\(\)\)/);
  const testMethod=notifier.split('public static boolean testSound(Context context)')[1].split('public static boolean claimAndNotify')[0];
  assert.doesNotMatch(testMethod,/BINANCE|fetch\(|\/api\/|claim|HOME|LONG_A"/);
});

test('V8 build enables foreground sound, but does not contain Firebase credentials or request Binance in CI',async()=>{
  const wf=await source('.github/workflows/android-debug.yml');
  const gradle=await source('android/app/build.gradle');
  assert.match(wf,/YELLOW_ALERTS_ENABLED: 'true'/);
  assert.match(wf,/test ! -f android\/app\/google-services\.json/);
  assert.match(wf,/banksawan-yellow-v8-SOUND-PROOF-debug/);
  assert.match(gradle,/versionCode 9/);
  assert.match(gradle,/allowAlerts && file\('google-services\.json'\)\.exists\(\)/);
  assert.doesNotMatch(wf,/fapi\.binance\.com|BR_FCM|successful-enchantment/);
});

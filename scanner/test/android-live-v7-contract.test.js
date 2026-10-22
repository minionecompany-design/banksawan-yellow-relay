import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const r=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('V8 workflow enables foreground LONG A while keeping FCM off and Binance out of CI',async()=>{
 const wf=await r('.github/workflows/android-debug.yml');
 assert.match(wf,/YELLOW_API_BASE_URL: [\'\"]?https:\/\/yellow-live-shadow-yc94-production\.up\.railway\.app/);
 assert.match(wf,/YELLOW_ALERTS_ENABLED: 'true'/);
 assert.match(wf,/test ! -f android\/app\/google-services\.json/);
 assert.match(wf,/YELLOW LIVE foreground only\. Firebase background disabled in this build/);
 assert.match(wf,/banksawan-yellow-v8-SOUND-PROOF-debug/);
 assert.doesNotMatch(wf,/BR_FCM|banksawan-radar|successful-enchantment/);
});

test('V7 validates market status, live mode and stale feeds before rendering',async()=>{
 const src=await r('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
 assert.match(src,/loadJson\("\/api\/status"\)/);
 assert.match(src,/!statusReply\.optBoolean\("ok",false\)/);
 assert.match(src,/lastTickerDataAtMs/);
 assert.match(src,/lastKlineDataAtMs/);
 assert.match(src,/!tickerFresh \|\| !klineFresh/);
 assert.match(src,/REJECT_NON_LIVE_API_PAYLOAD/);
 assert.match(src,/home=new JSONArray\(\);universe=new JSONArray\(\)/);
 assert.match(src,/SERVER \/ FEED TIDAK SIAP/);
});

test('V8 foreground sound test is opt-in and never creates a false LONG A' ,async()=>{
 const gradle=await r('android/app/build.gradle');
 const src=await r('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
 assert.match(gradle,/buildConfigField 'boolean', 'ALERTS_ENABLED'/);
 assert.match(gradle,/allowAlerts && file\('google-services\.json'\)\.exists\(\)/);
 assert.match(src,/BuildConfig\.ALERTS_ENABLED/);
 assert.doesNotMatch(src,/LIVE SHADOW • PENELITIAN, BUKAN SINYAL ENTRY/);
 assert.match(gradle,/versionCode 10/);
 const notifier=await r('android/app/src/main/java/id/banksawan/yellow/YellowNotifier.java');
 assert.match(notifier,/TEST_CHANNEL=\"yellow_sound_test_v8\"/);
 assert.match(notifier,/testSound\(Context context\)/);
 assert.match(notifier,/BUKAN sinyal LONG A/);
 assert.match(src,/testNotificationSound\(\)/);
 assert.doesNotMatch(src,/TES SUARA NOTIFIKASI \(BUKAN SINYAL\)/);
 assert.match(src,/BuildConfig\.ALERTS_ENABLED/);
});

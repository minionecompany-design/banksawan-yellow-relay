import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const r=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('V7 GitHub workflow builds YELLOW LIVE SHADOW without any scanner calls or FCM',async()=>{
 const wf=await r('.github/workflows/android-debug.yml');
 assert.match(wf,/YELLOW_API_BASE_URL: https:\/\/yellow-live-shadow-yc94-production\.up\.railway\.app/);
 assert.match(wf,/YELLOW_ALERTS_ENABLED: 'false'/);
 assert.match(wf,/YELLOW_FCM_ENABLED: 'false'/);
 assert.match(wf,/YELLOW_LIVE_ENABLED: 'false'/);
 assert.match(wf,/banksawan-yellow-v7-LIVE-SHADOW-debug/);
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

test('V7 pilot keeps all alerts off even when connected to HTTPS live API',async()=>{
 const gradle=await r('android/app/build.gradle');
 const src=await r('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
 assert.match(gradle,/buildConfigField 'boolean', 'ALERTS_ENABLED'/);
 assert.match(gradle,/allowAlerts && file\('google-services\.json'\)\.exists\(\)/);
 assert.match(src,/BuildConfig\.ALERTS_ENABLED/);
 assert.match(src,/LIVE SHADOW • PENELITIAN, BUKAN SINYAL ENTRY/);
 assert.match(gradle,/versionCode 3/);
});

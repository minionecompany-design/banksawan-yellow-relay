import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const f=path=>new URL('../../'+path,import.meta.url);
test('Android identity isolated from BR and HTTP disabled by default',async()=>{
  const gradle=await readFile(f('android/app/build.gradle'),'utf8');
  const manifest=await readFile(f('android/app/src/main/AndroidManifest.xml'),'utf8');
  assert.match(gradle,/applicationId 'id\.banksawan\.yellow'/);
  assert.match(gradle,/suppliedUrl = System\.getenv\('YELLOW_API_BASE_URL'\) \?: ''/);
  assert.match(gradle,/!suppliedUrl\.startsWith\('https:\/\/'\)/);
  assert.match(gradle,/buildConfigField 'boolean', 'DEMO_MODE'/);
  assert.match(manifest,/android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(manifest,/id\.banksawan\.radar/);
});
test('Android has only HOME and UNIVERSE, 1K icon, Binance .P TradingView shortcut',async()=>{
  const activity=await readFile(f('android/app/src/main/java/id/banksawan/yellow/MainActivity.java'),'utf8');
  const icon=await readFile(f('android/app/src/main/res/drawable-nodpi/yellow_logo.png'));
  assert.match(activity,/new String\[\]\{"home","universe"\}/);
  assert.match(activity,/"https:\/\/www\.tradingview\.com\/chart\/\?symbol="/);
  assert.match(activity,/"BINANCE:"\+symbol\+"\.P"/);
  assert.match(activity,/getTimeZone\("Asia\/Jakarta"\)/);
  assert.ok(icon.byteLength>1000);
  assert.doesNotMatch(activity,/"pantau"|"kandidat"|"bukti"/i);
});
test('Android rejects offline simulation on configured HTTPS backend and labels live separately',async()=>{
  const activity=await readFile(f('android/app/src/main/java/id/banksawan/yellow/MainActivity.java'),'utf8');
  assert.match(activity,/response\.optBoolean\("simulation",false\)/);
  assert.match(activity,/Harga sinyal \\(DEMO\\):/);
  assert.match(activity,/"Harga "\\+eventType/);
  assert.match(activity,/System\.currentTimeMillis\(\)/);
});

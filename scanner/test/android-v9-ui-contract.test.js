import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('V9 UI removes marked header and HOME clutter, retaining live status',async()=>{
 const main=await src('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
 for(const old of ['ImageView','banner.setVisibility','Hilang otomatis:',
  'LONG A MTF • Scanner independen','LIVE SHADOW • PENELITIAN, BUKAN SINYAL ENTRY',
  'LONG A TERAMATI • RISET 24 jam per simbol','TES SUARA NOTIFIKASI (BUKAN SINYAL)']){
  assert.ok(!main.includes(old),'unexpected visible UI '+old);
 }
 assert.match(main,/BANKSAWAN YELLOW/);
 assert.match(main,/status.setText\("Eligible: "/);
 assert.match(main,/status.setText\(universeError/);
 assert.match(main,/\/api\/home/);
 assert.match(main,/\/api\/universe/);
});

test('V9 cards show BR aligned small left labels and bold right values',async()=>{
 const main=await src('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
 assert.match(main,/left=text\(label,12,MUTED,false\)/);
 assert.match(main,/right=text\(value,14,Color.WHITE,true\)/);
 assert.match(main,/Gravity.END\|Gravity.CENTER_VERTICAL/);
 assert.match(main,/row.addView\(left/);
 assert.match(main,/row.addView\(right/);
 assert.match(main,/Mulai HOME/);
 assert.match(main,/"Timeframe "\+eventType/);
 assert.match(main,/LONG A awal \(senyap\)/);
 assert.match(main,/tradingView\(symbol,box\)/);
});

test('V9 keeps safety and notification behavior unchanged',async()=>{
 const main=await src('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
 const gradle=await src('android/app/build.gradle');
 assert.match(main,/homeExpiresMs/);
 assert.match(main,/YellowNotifier\.claimAndNotify\(this,signal,id,symbol,tf/);
 assert.match(main,/\/api\/events\?afterMs=/);
 assert.match(main,/getJSONArray\("events"\)/);
 assert.match(main,/BuildConfig.FCM_ENABLED/);
 assert.match(main,/lastTickerDataAtMs/);
 assert.match(main,/lastKlineDataAtMs/);
 assert.match(main,/root.setOnApplyWindowInsetsListener/);
 assert.match(main,/WindowInsets.Type.statusBars/);
 assert.match(main,/WindowInsets.Type.navigationBars/);
 assert.match(gradle,/versionCode 11/);
 assert.match(gradle,/versionName '0.15.0-four-long-a'/);
});

test('Android accepts server-advertised scanner capacity 50 or 200 but rejects invalid coverage',async()=>{
 const main=await src('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
 assert.match(main,/maximum>200/);
 assert.match(main,/covered>maximum/);
 assert.match(main,/newCovered>maximum/);
 assert.doesNotMatch(main,/maximum>24/);
 assert.doesNotMatch(main,/newCovered>24/);
 assert.match(main,/!tickerFresh \|\| !klineFresh/);
});

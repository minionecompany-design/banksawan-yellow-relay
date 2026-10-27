import test from 'node:test';
import assert from 'node:assert/strict';
import {trafficLight} from '../src/entry-traffic-light.js';
const now=1793016004000;
const fixture=()=>({
 availability:'READY',timeframe:'5m',expiresAtMs:now+600_000,
 frames:['1m','5m','15m','1h'].map(timeframe=>({timeframe,availability:'READY',trend:'UP',relativeVolume:2})),
 levels:{interaction:'BREAKOUT'},warnings:[],
 plan:{referenceEntry:1,entryLow:.99,entryHigh:1.02,stopLoss:.98,tp1:1.05,tp2:1.10,tp3:1.15,
       riskPct:2,roomToResistanceR:2}
});
const ticker=(price=1,at=now)=>({lastPrice:price,observedAtMs:at});
test('GREEN only with full fresh four-TF context, volume, adequate room and a price inside entry zone',()=>{
 assert.deepEqual(trafficLight(fixture(),ticker(),now),{status:'GREEN',reason:'KONDISI_TEKNIS_MENDUKUNG',checkedAtMs:now});
});
test('partial, absent, expired, stale ticker, off-zone and weak confirmation remain YELLOW',()=>{
 const a=fixture();
 assert.equal(trafficLight(null,ticker(),now).status,'YELLOW');
 assert.equal(trafficLight({...a,availability:'PARTIAL'},ticker(),now).status,'YELLOW');
 assert.equal(trafficLight({...a,expiresAtMs:now},ticker(),now).reason,'SKENARIO_KEDALUWARSA');
 assert.equal(trafficLight(a,null,now).reason,'HARGA_LIVE_TIDAK_SEGAR');
 assert.equal(trafficLight(a,ticker(1,now-30_000),now).status,'YELLOW');
 assert.equal(trafficLight(a,ticker(1.03),now).reason,'DI_LUAR_ZONA_ENTRY');
 assert.equal(trafficLight({...a,levels:{interaction:'INSIDE_RANGE'}},ticker(),now).status,'YELLOW');
 assert.equal(trafficLight({...a,plan:{...a.plan,roomToResistanceR:null}},ticker(),now).status,'YELLOW');
 assert.equal(trafficLight({...a,frames:a.frames.map(f=>f.timeframe==='5m'?{...f,relativeVolume:1}:f)},ticker(),now).status,'YELLOW');
});
test('real contraindications are RED without changing the original LONG A',()=>{
 const a=fixture();
 assert.equal(trafficLight(a,ticker(.97),now).reason,'HARGA_TEMBUS_SL');
 assert.equal(trafficLight(a,ticker(1.06),now).reason,'HARGA_SUDAH_MENCAPAI_TP1');
 assert.equal(trafficLight({...a,frames:a.frames.map(f=>f.timeframe==='1h'?{...f,trend:'DOWN'}:f)},ticker(),now).reason,'TREN_BESAR_MELAWAN');
 assert.equal(trafficLight({...a,levels:{interaction:'BREAKDOWN'}},ticker(),now).reason,'BREAKDOWN');
 assert.equal(trafficLight({...a,warnings:['RESISTANCE_WITHIN_1R']},ticker(),now).reason,'RESISTANCE_TERLALU_DEKAT');
 assert.equal(trafficLight({...a,plan:{...a.plan,riskPct:10}},ticker(),now).reason,'RISIKO_SL_TIDAK_SESUAI');
});
test('non-primary timeframe disagreement never gets GREEN',()=>{
 const a=fixture();
 a.frames[0].trend='DOWN';a.warnings=['TREND_CONFLICT'];
 assert.equal(trafficLight(a,ticker(),now).status,'YELLOW');
});

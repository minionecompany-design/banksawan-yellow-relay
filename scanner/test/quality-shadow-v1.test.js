import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLongAQuality} from '../src/quality-shadow-v1.js';
const periods={'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000};
const end=Date.UTC(2026,9,17,10);
function fixture({tf='1m',symbol='AGTUSDT',kind='early',vol=190,extend=false}={}){
 const period=periods[tf];
 const bars=Array.from({length:61},(_,i)=>{
   let close=1;
   if(kind==='early')close=1+.0006*Math.sin(i*.65);
   if(kind==='continuation')close=1+i*.00035+.0003*Math.sin(i*.5);
   if(kind==='weak')close=1+i*.0015+.001*Math.sin(i*.6);
   if(i===60){close=extend?1.39:close+.002;}
   const open=i===60?close-.001:close-.0003;
   return {endMs:end-(60-i)*period,open,close,high:close+.0005,low:open-.0005,
     volume:i===60?vol:100};
 });
 const event={symbol,timeframe:tf,signal:'LONG_A',barClosedAtMs:end,
   id:symbol+':'+tf+':'+end+':LONG_A',price:bars.at(-1).close};
 return {event,bars};
}
test('offline annotation is research-only; does not send or suppress events',()=>{
 const {event,bars}=fixture(); const a=inspectLongAQuality(event,bars);
 assert.equal(a.status,'ASSESSED');assert.equal(a.deliveryAction,'NONE');
 assert.equal(a.grade,'GOLD_RESEARCH');assert.equal(a.flags.structure,true);
 assert.equal(a.flags.release,true);assert.equal(a.flags.notChasing,true);
});
test('early/base and continuation are alternative routes (not both required)',()=>{
 const f=fixture({kind:'early'});const a=inspectLongAQuality(f.event,f.bars);
 const b=fixture({kind:'continuation',vol:170});const y=inspectLongAQuality(b.event,b.bars);
 assert.equal(a.paths.earlyBase,true);
 assert.equal(y.paths.continuation,true);
});
test('weak or stretched LONG A can be ranked but never blocked by research engine',()=>{
 const weak=fixture({kind:'weak',vol:80}); const a=inspectLongAQuality(weak.event,weak.bars);
 const late=fixture({extend:true});const b=inspectLongAQuality(late.event,late.bars);
 assert.equal(a.deliveryAction,'NONE');assert.equal(b.deliveryAction,'NONE');
 assert.equal(b.flags.notChasing,false);
 assert.notEqual(b.grade,'GOLD_RESEARCH');
});
test('rejects prices that do not match the closed signal candle',()=>{
 const {event,bars}=fixture();
 assert.equal(inspectLongAQuality({...event,price:event.price*1.01},bars).reason,'EVENT_PRICE_MISMATCH');
});
test('future bars cannot improve or change a past classification',()=>{
 const {event,bars}=fixture(); const r=inspectLongAQuality(event,bars);
 const period=periods[event.timeframe];
 const appended=[...bars,{...bars.at(-1),endMs:end+period,close:44,high:44.5,low:43,open:43}];
 assert.deepEqual(inspectLongAQuality(event,appended),r);
});
test('reject invalid, non-LONG_A, missing or gapped histories fail closed',()=>{
 const {event,bars}=fixture();
 assert.equal(inspectLongAQuality({...event,signal:'LONG_B'},bars).status,'UNVERIFIED');
 assert.equal(inspectLongAQuality(event,bars.slice(-25)).status,'UNVERIFIED');
 const gap=[...bars]; gap[22]={...gap[22],endMs:gap[22].endMs+1};
 assert.equal(inspectLongAQuality(event,gap).reason,'INVALID_OR_GAPPED_CANDLES');
 assert.equal(inspectLongAQuality(event,undefined).status,'UNVERIFIED');
});
for(const tf of Object.keys(periods)){
 test(tf+': one lane can be independently annotated, no cross-TF event prerequisite',()=>{
  const {event,bars}=fixture({tf});const a=inspectLongAQuality(event,bars);
  assert.equal(a.status,'ASSESSED');assert.equal(a.deliveryAction,'NONE');
 });
}


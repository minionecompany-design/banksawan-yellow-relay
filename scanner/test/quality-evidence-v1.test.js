import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateQualityEvidence} from '../src/quality-evidence-v1.js';
const frames={'1m':60000,'5m':300000,'15m':900000,'1h':3600000};
const END=Date.UTC(2026,9,17,12);
function sample(tf='1m',price=1){
 const p=frames[tf];
 const bars=Array.from({length:61},(_,i)=>{const close=price*(1+.0001*Math.sin(i));return {
   endMs:END-(60-i)*p,open:close*.9999,high:close*1.00015,low:close*.9998,close,volume:i===60?180:100};});
 const event={symbol:'AGTUSDT',timeframe:tf,barClosedAtMs:END,signal:'LONG_A',
   id:'AGTUSDT:'+tf+':'+END+':LONG_A',price:bars.at(-1).close};
 const futureBars=Array.from({length:240*60000/p},(_,i)=>{
  const close=event.price*(1+.05*(i+1)/(240*60000/p));return {endMs:END+(i+1)*p,open:close*.999,
    high:close*1.002,low:close*.998,close,volume:100};
 });
 return {event,bars,futureBars};
}
test('no raw future candles means no measured outcome, not fake success',()=>{
 const a=sample();delete a.futureBars;
 const r=evaluateQualityEvidence([a]);
 assert.equal(r.measured4h,0);assert.equal(r.records,1);
 assert.equal(r.results[0].outcomes['240'].reason,'FUTURE_CANDLES_NOT_PROVIDED');
});
test('each independent TF can be evaluated without simultaneous other LONG_A',()=>{
 const r=evaluateQualityEvidence(Object.keys(frames).map(tf=>sample(tf)));
 assert.equal(r.assessed,4);assert.equal(r.measured4h,4);
 for(const tf of Object.keys(frames))assert.equal(r.byTimeframe[tf].measured240,1);
});
test('revising future candles cannot retroactively revise signal-time grade',()=>{
 const a=sample();const modified={...a,futureBars:a.futureBars.map(x=>({...x,high:x.high*3,low:x.low*.3}))};
 const x=evaluateQualityEvidence([a]).results[0],y=evaluateQualityEvidence([modified]).results[0];
 assert.deepEqual(x.quality,y.quality);
 assert.notEqual(x.outcomes['240'].maxFavorablePct,y.outcomes['240'].maxFavorablePct);
 assert.equal(x.quality.deliveryAction,'NONE');
});
test('duplicate event IDs cannot inflate a success rate',()=>{
 const a=sample();assert.throws(()=>evaluateQualityEvidence([a,a]),/DUPLICATE_EVENT_ID/);
});
test('incomplete / gapped / malformed forward bars are UNVERIFIED',()=>{
 const a=sample();a.futureBars.splice(88,1);
 const x=evaluateQualityEvidence([a]);assert.equal(x.measured4h,0);
 assert.equal(x.results[0].outcomes['240'].reason,'INCOMPLETE_FORWARD_HORIZON');
 const b=sample();b.futureBars[40]={...b.futureBars[40],high:0.0001};
 assert.equal(evaluateQualityEvidence([b]).results[0].outcomes['240'].reason,'INVALID_FORWARD_CANDLES');
});
test('no source data => zero observations; never production-ready',()=>{
 const r=evaluateQualityEvidence([]);
 assert.equal(r.records,0);assert.equal(r.measured4h,0);
 assert.equal(r.plus5MfeIn4h,0);assert.equal(r.readyForProduction,false);
});


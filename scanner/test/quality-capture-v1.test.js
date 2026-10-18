import test from 'node:test';
import assert from 'node:assert/strict';
import {QualityCaptureV1,TIMEFRAME_MS,CAPTURE_HORIZON_MS} from '../src/quality-capture-v1.js';
const START=Date.UTC(2026,9,17,12);
function data(tf='1m',symbol='AGTUSDT'){
 const p=TIMEFRAME_MS[tf],end=START;
 const bars=Array.from({length:61},(_,i)=>({endMs:end-(60-i)*p,open:1,high:1.01,low:.99,close:1,volume:100}));
 const event={id:symbol+':'+tf+':'+end+':LONG_A',symbol,timeframe:tf,signal:'LONG_A',barClosedAtMs:end,price:1};
 return {event,bars};
}
const future=(e,i)=>({endMs:e.barClosedAtMs+TIMEFRAME_MS[e.timeframe]*i,open:1,high:1.08,low:.96,close:1.02,volume:150});
test('capture real-form LONG_A without delivery hooks',()=>{
 const c=new QualityCaptureV1({clock:()=>START}),d=data();
 assert.equal(c.acceptLongA(d.event,d.bars).accepted,true);
 assert.equal(c.snapshot().records[0].bars.length,61);
 assert.equal(c.snapshot().mode,'RESEARCH_ONLY');
 assert.equal(Object.hasOwn(c,'sendEvent'),false);
});
test('all four timeframes independent, no other TF prerequisite',()=>{
 const c=new QualityCaptureV1({clock:()=>START});
 for(const tf of Object.keys(TIMEFRAME_MS)){const d=data(tf);assert.equal(c.acceptLongA(d.event,d.bars).accepted,true);}
 assert.equal(c.snapshot().records.length,4);
});
test('no LONG_B, mismatched price, gapped or insufficient candles',()=>{
 const c=new QualityCaptureV1({clock:()=>START}),d=data();
 assert.equal(c.acceptLongA({...d.event,signal:'LONG_B'},d.bars).reason,'INVALID_LONG_A');
 assert.equal(c.acceptLongA({...d.event,price:2},d.bars).reason,'EVENT_PRICE_MISMATCH');
 assert.equal(c.acceptLongA(d.event,[]).reason,'INSUFFICIENT_CLOSED_CANDLES');
 const gap=d.bars.map(x=>({...x}));gap[12].endMs+=1;
 assert.equal(c.acceptLongA(d.event,gap).reason,'INVALID_OR_GAPPED_CANDLES');
});
test('stale and future signals never replayed',()=>{
 const d=data();
 assert.equal(new QualityCaptureV1({clock:()=>START+301000}).acceptLongA(d.event,d.bars).reason,'NOT_FRESH_LONG_A');
 assert.equal(new QualityCaptureV1({clock:()=>START-1}).acceptLongA(d.event,d.bars).reason,'NOT_FRESH_LONG_A');
});
test('same symbol two TF accepted, identical ID once',()=>{
 const c=new QualityCaptureV1({clock:()=>START}),a=data('1m'),b=data('5m');
 assert.equal(c.acceptLongA(a.event,a.bars).accepted,true);
 assert.equal(c.acceptLongA(a.event,a.bars).reason,'DUPLICATE');
 assert.equal(c.acceptLongA(b.event,b.bars).accepted,true);
});
test('four hours future CLOSED bars, no future changes to pre-signal candles',()=>{
 let now=START;const d=data(),c=new QualityCaptureV1({clock:()=>now});
 c.acceptLongA(d.event,d.bars);const before=c.snapshot().records[0].bars;
 for(let i=1;i<=240;i++){const bar=future(d.event,i);now=bar.endMs;assert.equal(c.acceptClosedBar('AGTUSDT','1m',bar).updated,1);}
 const r=c.snapshot().records[0];
 assert.equal(r.captureStatus,'COMPLETE');assert.equal(r.futureBars.length,240);
 assert.deepEqual(r.bars,before);
 assert.equal(c.acceptClosedBar('AGTUSDT','1m',future(d.event,240)).updated,0);
});
test('missing future candle marks GAP rather than pretending an outcome',()=>{
 let now=START;const d=data(),c=new QualityCaptureV1({clock:()=>now});c.acceptLongA(d.event,d.bars);
 now=START+2*60_000;
 assert.equal(c.acceptClosedBar('AGTUSDT','1m',future(d.event,2)).updated,1);
 assert.equal(c.snapshot().records[0].captureStatus,'GAPPED');
 now+=60_000;assert.equal(c.acceptClosedBar('AGTUSDT','1m',future(d.event,3)).updated,0);
});
test('ignore open candle, wrong symbol, wrong timeframe, duplicate',()=>{
 let now=START;const d=data(),c=new QualityCaptureV1({clock:()=>now});c.acceptLongA(d.event,d.bars);
 const b=future(d.event,1);assert.equal(c.acceptClosedBar('AGTUSDT','1m',b).updated,0);
 now=b.endMs;
 assert.equal(c.acceptClosedBar('TIAUSDT','1m',b).updated,0);
 assert.equal(c.acceptClosedBar('AGTUSDT','5m',b).updated,0);
 assert.equal(c.acceptClosedBar('AGTUSDT','1m',b).updated,1);
 assert.equal(c.acceptClosedBar('AGTUSDT','1m',b).updated,0);
});
test('bounded records, FIFO evictions, snapshot immutable',()=>{
 const c=new QualityCaptureV1({clock:()=>START,maxRecords:2});
 for(const [tf,sym] of [['1m','AGTUSDT'],['5m','TIAUSDT'],['15m','AVAUSDT']]){
  const d=data(tf,sym);assert.equal(c.acceptLongA(d.event,d.bars).accepted,true);
 }
 const snap=c.snapshot();assert.equal(snap.records.length,2);assert.equal(snap.totals.evicted,1);
 snap.records[0].bars[0].close=999;
 assert.notEqual(c.snapshot().records[0].bars[0].close,999);
});
test('TTL eviction leaves no long-lived unbounded backlog',()=>{
 let now=START;const c=new QualityCaptureV1({clock:()=>now,retentionMs:CAPTURE_HORIZON_MS});
 const d=data();c.acceptLongA(d.event,d.bars);now+=CAPTURE_HORIZON_MS+1;
 assert.equal(c.snapshot().records.length,0);
});
test('restore independent states and resume future candle sequence',()=>{
 let now=START;const c=new QualityCaptureV1({clock:()=>now}),a=data('1m'),b=data('5m');
 c.acceptLongA(a.event,a.bars);c.acceptLongA(b.event,b.bars);
 now+=60_000;c.acceptClosedBar('AGTUSDT','1m',future(a.event,1));
 const restored=new QualityCaptureV1({clock:()=>now});assert.equal(restored.restore(c.snapshot()).restored,2);
 now+=60_000;assert.equal(restored.acceptClosedBar('AGTUSDT','1m',future(a.event,2)).updated,1);
 assert.equal(restored.snapshot().records.find(r=>r.event.timeframe==='1m').futureBars.length,2);
});
test('invalid restore never partially mutates stored evidence',()=>{
 const c=new QualityCaptureV1({clock:()=>START}),d=data();c.acceptLongA(d.event,d.bars);
 const doc=c.snapshot();doc.records[0].bars[2].close=100;
 const r=new QualityCaptureV1({clock:()=>START});
 assert.throws(()=>r.restore(doc),/INVALID_CAPTURE_RESTORE_CANDLES/);
 assert.equal(r.snapshot().records.length,0);
});

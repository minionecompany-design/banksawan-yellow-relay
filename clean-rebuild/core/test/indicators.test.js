import test from 'node:test';import assert from 'node:assert/strict';
import {sma,wilderRsi,metrics,validatedBars,asOfPreviousEnd,FRAME_MS} from '../src/indicators.js';
const bars=(tf='1m',n=120)=>Array.from({length:n},(_,i)=>({closed:true,closedAtMs:(i+1)*FRAME_MS[tf],close:2+i*.01,volume:100+i}));
test('MA and Wilder RSI warmup, constant series and rising series',()=>{
 assert.equal(sma([1,2,3],2),2.5);assert.equal(sma([1],2),null);
 assert.equal(wilderRsi(Array(20).fill(5)).at(-1),50);
 assert.equal(wilderRsi(Array.from({length:20},(_,i)=>i+1)).at(-1),100);
 const m=metrics(bars());assert.ok(m&&m.ma7>m.ma25&&m.ma25>m.ma99&&m.volRatio>0);
});
test('gapped, future/current or insufficient bars rejected',()=>{
 const sample=bars();assert.equal(validatedBars(sample,'1m',120*60_000),true);
 assert.equal(validatedBars(sample,'1m',119*60_000),false);
 const broken=bars();broken[50].closedAtMs+=1;assert.equal(validatedBars(broken,'1m',120*60_000),false);
 const unclosed=bars();unclosed.at(-1).closed=false;assert.equal(validatedBars(unclosed,'1m',120*60_000),false);
 assert.equal(metrics(bars('1m',30)),null);
});
test('as-of previous MTF never selects unfinished concurrent candle',()=>{
 assert.equal(asOfPreviousEnd(10*60_000,'5m'),5*60_000);
 assert.equal(asOfPreviousEnd(11*60_000,'5m'),10*60_000);
 assert.equal(asOfPreviousEnd(60*60_000,'1h'),0);
 assert.equal(asOfPreviousEnd(61*60_000,'1h'),60*60_000);
});

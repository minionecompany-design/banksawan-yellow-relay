import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LiveAnalysisDelivery} from '../src/live-analysis-delivery.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {CandleBook} from '../src/live-candle-book.js';
import {newEntryWatch,advanceEntryWatch} from '../src/entry-watch.js';
import {T,M} from './fixtures/analysis-companion.mjs';
import {event,context,bar} from './fixtures/entry-watch.mjs';

test('missing native MTF close waits, then delivers the same minute once without future context',()=>{
  const q=new LiveAnalysisDelivery(),b=bar(T+5*M,.98,1.002,1.003,250);
  const full=context(b.endMs,[b]),late=structuredClone(full);late.fiveMinute.pop();
  const calls=[];q.enqueue(b);q.enqueue(b);
  q.flush(late,b.endMs+1000,(...args)=>calls.push(args));
  assert.equal(calls.length,0);assert.equal(q.status().pending,1);
  q.flush(full,b.endMs+2000,(...args)=>calls.push(args));
  q.flush(full,b.endMs+3000,(...args)=>calls.push(args));
  assert.equal(calls.length,1);assert.deepEqual(calls[0][0],b);
  assert.equal(q.status().deferred,1);assert.equal(q.status().delivered,1);
});

test('never synthesize context, never backdate a late confirmation, preserve minute order',()=>{
  const q=new LiveAnalysisDelivery(),b=bar(T+M,.97,.98,.985),next=bar(T+2*M,.975,.981,.985);
  const full=context(next.endMs,[b,next]),missing={...full,oneHour:[]},calls=[];
  q.enqueue(b);q.enqueue(next);
  q.flush(missing,b.endMs+90000,(c)=>calls.push(c.endMs));assert.deepEqual(calls,[]);
  q.flush(missing,b.endMs+90001,(c,s)=>{calls.push(c.endMs);
    const w=advanceEntryWatch(newEntryWatch(event,T+4000),c,s,b.endMs+90001);
    assert.equal(w.plan,null);assert.equal(w.reason,'DATA_EMPAT_TF_BELUM_LENGKAP');
  });
  assert.deepEqual(calls,[b.endMs]);assert.equal(q.status().pending,1);
  q.flush(full,next.endMs+91000,(c,s)=>{
    calls.push(c.endMs);
    const w=newEntryWatch(event,T+4000);w.lastBarEndMs=c.endMs-M;
    assert.equal(advanceEntryWatch(w,c,s,c.endMs+91000).reason,'CANDLE_KONFIRMASI_TERLAMBAT');
  });
  assert.deepEqual(calls,[b.endMs,next.endMs]);assert.equal(q.status().timedOut,2);
});

test('pending delivery is bounded; skipped minutes cannot invent a plan',()=>{
  const q=new LiveAnalysisDelivery();
  for(let i=1;i<=10;i++)q.enqueue(bar(T+i*M,.98,1,1.01));
  assert.equal(q.status().pending,4);assert.equal(q.status().overflow,6);
  let w=newEntryWatch(event,T+4000);
  q.flush(context(T+10*M),T+10*M+1000,(c,s)=>{w=advanceEntryWatch(w,c,s,T+10*M+1000);});
  assert.equal(w.state,'DATA_GAP');assert.equal(w.plan,null);
});

test('all 24 socket arrival orders at an hourly boundary deliver exactly once after all four native closes',()=>{
  const keys=['oneMinute','fiveMinute','fifteenMinute','oneHour'];
  const permutations=xs=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];
  const end=T+60*M,b=bar(end,.98,1.002,1.003,250),full=context(end,[b]);
  for(const order of permutations(keys)){
    const q=new LiveAnalysisDelivery(),partial=structuredClone(full),calls=[];
    for(const key of keys)partial[key].pop();
    for(const [i,key] of order.entries()){
      partial[key].push(full[key].at(-1));if(key==='oneMinute')q.enqueue(b);
      q.flush(partial,end+1000+i*100,(c)=>calls.push(c.endMs));
      assert.equal(calls.length,i===3?1:0,order.join(','));
    }
    assert.deepEqual(calls,[end]);assert.equal(q.status().pending,0);
  }
});

test('real onKline delivery recovers confirmation when the native 5m close arrives second',async()=>{
  const candles=[bar(T+M,.97,.98,.985),bar(T+2*M,.975,.981,.985),
    bar(T+3*M,.978,.983,.986),bar(T+4*M,.98,.984,.987),bar(T+5*M,.98,1.002,1.003,250)];
  let w=newEntryWatch(event,T+4000),now=T+5*M+1000;
  for(const c of candles.slice(0,-1))w=advanceEntryWatch(w,c,context(c.endMs,candles.filter(x=>x.endMs<=c.endMs)),c.endMs+1000);
  const full=context(T+5*M,candles),book=new CandleBook(event.symbol),calls=[];
  for(const [tf,key] of [['1m','oneMinute'],['5m','fiveMinute'],['15m','fifteenMinute'],['1h','oneHour']])book.history[tf]=structuredClone(full[key]);
  book.history['1m'].pop();const five=book.history['5m'].pop();
  const legacyContext=book.snapshot();legacyContext.oneMinute.push(candles.at(-1));
  const missed=advanceEntryWatch(w,candles.at(-1),legacyContext,now);
  assert.equal(missed.plan,null);assert.equal(missed.reason,'DATA_EMPAT_TF_BELUM_LENGKAP');
  const market=new YellowLiveMarket({dataDir:await mkdtemp(path.join(os.tmpdir(),'yellow-analysis-order-')),
    clock:()=>now,wsClass:class{},guard:{closedReason:null,metrics:()=>({})},log:()=>{},
    analysisCompanion:{enabled:true,onClosedBar(symbol,tf,c,s){
      calls.push(c.endMs);w=advanceEntryWatch(w,c,s,now);return true;
    }}});
  const tracked={book,states:{}};market.covered.set(event.symbol,tracked);
  market.klineConnected=true;market.tickerConnected=true;
  let originalDrains=0;market.flushTracked=async()=>{originalDrains++;};
  const message=(tf,c,period)=>({k:{s:event.symbol,i:tf,x:true,t:c.endMs-period,T:c.endMs-1,
    o:String(c.open),h:String(c.high),l:String(c.low),c:String(c.close),v:String(c.volume)}});
  await market.onKline(message('1m',candles.at(-1),M));
  assert.equal(originalDrains,1,'original strategy runs while optional analysis waits');
  assert.equal(w.plan,null);assert.deepEqual(calls,[]);
  now+=1000;await market.onKline(message('5m',five,5*M));
  assert.equal(w.state,'CONFIRMED',w.reason);assert.deepEqual(calls,[T+5*M]);
  await market.onKline(message('5m',five,5*M));assert.deepEqual(calls,[T+5*M]);
});

test('optional delivery failure cannot halt the original strategy path',async()=>{
  const market=new YellowLiveMarket({dataDir:await mkdtemp(path.join(os.tmpdir(),'yellow-analysis-fault-')),
    clock:()=>T+M+1000,wsClass:class{},guard:{closedReason:null,metrics:()=>({})},log:()=>{},
    analysisCompanion:{enabled:true,onClosedBar(){throw Error('OPTIONAL_ANALYSIS');}}});
  const q=new LiveAnalysisDelivery(),b=bar(T+M,.97,.98,.985);q.enqueue(b);
  const tracked={analysisDelivery:q,book:{snapshot:()=>context(b.endMs,[b])}};
  market.covered.set(event.symbol,tracked);
  assert.doesNotThrow(()=>market.flushAnalysisDelivery(event.symbol,tracked));assert.equal(market.isHalted,false);
});

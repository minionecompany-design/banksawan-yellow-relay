import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {YellowLiveMarket} from '../src/live-market.js';
import {CandleBook} from '../src/live-candle-book.js';
import {newParallelState} from '../src/parallel-long-a.js';
import {newPineOneMinuteState} from '../src/pine-v13-one-minute.js';

const M=60_000, END=Date.UTC(2026,9,15,12,30);
const candle=(endMs)=>({endMs,open:0.05,high:0.051,low:0.049,close:0.05,volume:100});
const series=(period,last,count=140)=>Array.from({length:count},(_,i)=>candle(last-(count-i-1)*period));
async function marketAt(nowMs=END+M+2_000){
  let now=nowMs;
  const market=new YellowLiveMarket({dataDir:await mkdtemp(path.join(os.tmpdir(),'yellow-recovery-')),
    clock:()=>now,wsClass:class {},guard:{closedReason:null,metrics:()=>({})},log:()=>{}});
  const symbol='ARIAUSDT';
  market.exchangeSymbols.set(symbol,{symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'});
  const book=new CandleBook(symbol);
  book.history['1m']=series(M,END+M);
  book.history['5m']=series(5*M,END-5*M); // closed 5m context at END is late
  book.history['15m']=series(15*M,END);
  book.history['1h']=series(60*M,END-30*M);
  const states=newParallelState();
  states['1m']=newPineOneMinuteState();
  for(const tf of Object.keys(states))states[tf].lastProcessedEndMs=book.latest(tf).endMs;
  states['1m'].lastProcessedEndMs=END;
  const tracked={book,states};
  market.covered.set(symbol,tracked);
  market.recordTicker({symbol,source:'BINANCE_USDM_FUTURES',status:'TRADING',contractType:'PERPETUAL',
    lastPrice:0.05,priceChangePercent:5.5,observedAtMs:END-30_000});
  market.recordTicker({symbol,source:'BINANCE_USDM_FUTURES',status:'TRADING',contractType:'PERPETUAL',
    lastPrice:0.05,priceChangePercent:5.5,observedAtMs:END+M/2});
  return {market,tracked,book,symbol,setNow:x=>now=x};
}

test('ARIA-style delayed 5m context holds 1m state and resumes on confirmed 5m without gap loop',async()=>{
  const {market,tracked,book,symbol}=await marketAt();
  await market.flushTracked(symbol,tracked);
  assert.equal(tracked.states['1m'].lastProcessedEndMs,END,'must hold pending 1m bar');
  assert.equal(market.covered.has(symbol),true);
  // A confirmed 5m close arrives AFTER the 1m bar; process 1m exactly once.
  book.history['5m'].push(candle(END));
  await market.flushTracked(symbol,tracked);
  assert.equal(tracked.states['1m'].lastProcessedEndMs,END+M);
  assert.equal(market.covered.has(symbol),true);
  assert.equal(market.retryAfter.size,0);
  await market.flushTracked(symbol,tracked);
  assert.equal(tracked.states['1m'].lastProcessedEndMs,END+M,'duplicate drain must not move cursor');
});

test('missing context after bounded 120s retires only the affected symbol and applies cooldown',async()=>{
  const {market,tracked,symbol,setNow}=await marketAt();
  await market.flushTracked(symbol,tracked);
  setNow(END+4*M);
  await market.flushTracked(symbol,tracked);
  assert.equal(market.covered.has(symbol),false);
  assert.ok(market.retryAfter.get(symbol)>=END+14*M);
  assert.match(market.recentFaults.at(-1).reason,/SAFE_REBOOTSTRAP_ARIAUSDT_PENDING_CANDLE_TIMEOUT_1m/);
  assert.equal(market.isHalted,false,'one symbol must not abort unrelated streams');
});

test('missing target minute sequence is never bridged or silently labeled scanning',async()=>{
  const {market,tracked,book,symbol}=await marketAt();
  book.history['1m']=book.history['1m'].filter(b=>b.endMs!==END+M);
  book.history['1m'].push(candle(END+2*M));
  await market.flushTracked(symbol,tracked);
  assert.equal(market.covered.has(symbol),false);
  assert.match(market.recentFaults.at(-1).reason,/TARGET_SEQUENCE_GAP_1m/);
});

test('real onKline path queues an early 1m close, then drains it when 5m closure arrives',async()=>{
  const {market,tracked,book,symbol}=await marketAt();
  book.history['1m'].pop(); // Pretend the next 1m kline has not arrived yet.
  market.klineConnected=true;
  market.tickerConnected=true;
  function msg(tf,openMs,period){return {k:{s:symbol,i:tf,x:true,t:openMs,T:openMs+period-1,
    o:'0.05',h:'0.051',l:'0.049',c:'0.05',v:'100'}};}
  await market.onKline(msg('1m',END,M));
  assert.equal(tracked.states['1m'].lastProcessedEndMs,END);
  assert.equal(market.covered.has(symbol),true);
  await market.onKline(msg('5m',END-5*M,5*M));
  assert.equal(tracked.states['1m'].lastProcessedEndMs,END+M);
  assert.equal(market.covered.has(symbol),true);
});

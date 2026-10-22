import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {YellowLiveMarket} from '../src/live-market.js';
import {newParallelState,PERIODS,stepLongAOnTimeframe} from '../src/parallel-long-a.js';

test('actual LONG_A disk failure halts scanning before FCM or a later checkpoint',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-storage-halt-'));
 try{
  const end=Date.UTC(2026,9,22,12),symbol='PLAYUSDT';
  const keys={'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'};
  const snapshot=Object.fromEntries(Object.entries(keys).map(([tf,key])=>[key,
   Array.from({length:150},(_,i)=>({endMs:end-(149-i)*PERIODS[tf],volume:100+i%3,
    close:tf==='1m'?1+i*.00005+.0005*Math.sin(i*.3+5):1+i*.0005}))]));
  const ticker={symbol,source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',
   lastPrice:1.1,priceChangePercent:2,quoteVolume24h:20_000_000,observedAtMs:end};
  const states=newParallelState();
  for(const state of Object.values(states))state.lastProcessedEndMs=end;
  Object.assign(states['1m'],{lastProcessedEndMs:end-60_000,lastPullbackBar:20,index:20});
  // Prove this fixture really reaches the production event path, without a fake signal evaluator.
  assert.equal(stepLongAOnTimeframe(symbol,'1m',{...snapshot,ticker24h:ticker,nowMs:end+1000},states['1m']).event?.signal,'LONG_A');
  let sends=0,checkpoints=0;
  const market=new YellowLiveMarket({dataDir:dir,clock:()=>end+1000,wsClass:class{},
   guard:{closedReason:null,metrics:()=>({})},sendEvent:async()=>sends++,log:()=>{}});
  const blocked=path.join(dir,'blocked');await mkdir(blocked);market.ledger.filename=blocked;
  market.getTickerAsOf=()=>ticker;market.checkpoints.save=async()=>checkpoints++;
  const tracked={book:{snapshot:()=>snapshot},states};market.covered.set(symbol,tracked);
  await assert.rejects(market.flushTracked(symbol,tracked));
  assert.equal(market.isHalted,true,'cannot keep advancing signal lanes after a failed durable event');
  assert.equal(market.haltReason,'LEDGER_WRITE_FAILED');
  assert.equal(sends,0);assert.equal(checkpoints,0);
  assert.deepEqual(market.home(),[]);assert.deepEqual(market.events(0),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

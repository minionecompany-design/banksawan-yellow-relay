import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {createOfflineAcceptanceServer} from '../src/offline-acceptance-server.js';
const AT=Date.UTC(2026,9,15,12,0);
const KEY='offline-diagnostic-token-is-not-a-production-secret';
const event=(t=AT)=>({symbol:'WALUSDT',timeframe:'15m',signal:'LONG_A',barClosedAtMs:t,
  id:`WALUSDT:15m:${t}:LONG_A`,price:0.054,binance24hChangePct:2.2,
  source:'BINANCE_USDM_24H+LOCAL_PARALLEL_MTF_EVALUATOR',status:'RESEARCH_ONLY'});
async function withServer(fn,{token=KEY,now=AT+4_000,dir=null}={}){
  const tmp=dir??await mkdtemp(path.join(os.tmpdir(),'yellow-offline-test-'));
  const clock={now};
  const server=createOfflineAcceptanceServer({journalFilename:path.join(tmp,'home.json'),
    clock:()=>clock.now,offlineReplayToken:token,
    universeTickers:[{symbol:'WALUSDT',lastPrice:'0.054',priceChangePercent:'2.2',contractType:'PERPETUAL',status:'TRADING'}]});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await fn({base:`http://127.0.0.1:${server.address().port}`,clock,tmp});}
  finally{await new Promise(resolve=>server.close(resolve));if(!dir)await rm(tmp,{recursive:true,force:true});}
}
const post=(base,body,token=KEY)=>fetch(base+'/internal/replay',{method:'POST',headers:{'Content-Type':'application/json',
  'x-yellow-offline-key':token},body:JSON.stringify(body)});
test('health and universe are explicitly simulated with zero Binance/FCM requests',async()=>{
  await withServer(async({base})=>{const health=await(await fetch(base+'/health')).json();
    assert.equal(health.binanceRequests,0);assert.equal(health.realTradingSignals,false);
    const u=await(await fetch(base+'/api/universe')).json();assert.equal(u.simulation,true);
    assert.equal(u.universe.length,1);assert.equal(u.universe[0].symbol,'WALUSDT');});
});
test('offline replay upload disabled unless local secret explicitly configured',async()=>{
  await withServer(async({base})=>{assert.equal((await post(base,{events:[event()]})).status,403);},{token:null});
  await withServer(async({base})=>{assert.equal((await post(base,{events:[event()]},'wrong')).status,403);});
});
test('fresh 15m LONG A writes one HOME card; repeated replay does not duplicate, 24h expiration exact',async()=>{
  await withServer(async({base,clock})=>{
    const once=await(await post(base,{events:[event()]})).json();assert.equal(once.accepted,1);
    const replay=await(await post(base,{events:[event()]})).json();assert.equal(replay.accepted,0);
    let home=(await(await fetch(base+'/api/home')).json()).home;
    assert.equal(home.length,1);assert.equal(home[0].timeframe,'15m');
    assert.equal(home[0].homeExpiresMs,clock.now+86_400_000);
    clock.now=home[0].homeExpiresMs-1;
    assert.equal((await(await fetch(base+'/api/home')).json()).home.length,1);
    clock.now=home[0].homeExpiresMs;
    assert.equal((await(await fetch(base+'/api/home')).json()).home.length,0);
  });
});
test('payloads cannot impersonate event with wrong symbol, old event, malformed ID or threshold',async()=>{
  await withServer(async({base})=>{
    for(const changed of [{id:'wrong'}, {price:11},{binance24hChangePct:0.9},{symbol:'WAL/USDT'},
      {barClosedAtMs:AT+60_000,id:`WALUSDT:15m:${AT+60_000}:LONG_A`}]){
      assert.equal((await post(base,{events:[{...event(),...changed}]})).status,422);
    }
    const tooOld=await(await post(base,{events:[event(AT-15*60_000)]})).json();
    assert.equal(tooOld.accepted,0);assert.ok(tooOld.rejected.some(x=>x.reason==='EXPIRED_OR_FUTURE_EVENT'));
  });
});
test('HOME persists after server restart, still marked simulation',async()=>{
  const tmp=await mkdtemp(path.join(os.tmpdir(),'yellow-restart-'));
  try{await withServer(async({base})=>{assert.equal((await post(base,{events:[event()]})).status,200);},{dir:tmp});
    await withServer(async({base})=>{const r=await(await fetch(base+'/api/home')).json();assert.equal(r.simulation,true);
      assert.equal(r.home.length,1);},{dir:tmp});
  }finally{await rm(tmp,{recursive:true,force:true});}
});

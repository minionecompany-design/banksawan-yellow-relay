import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LabRestGuard} from '../src/rest-guard.js';
import {parseClosedKline,parseStreamKline,addContiguousBar,selectNaturalPilot} from '../src/market-coverage.js';
import {LabLiveShadow} from '../src/shadow-live.js';
import {makeServer} from '../src/server.js';
import {chooseHomeCards} from '../src/home-policy.js';
const NOW=1_800_000_000_000; // aligned minute not real market data
const item=(symbol,pct,q=20_000_000)=>({symbol,lastPrice:0.50,priceChangePercent:pct,
  quoteVolume:q,observedAtMs:NOW});
test('pilot deterministic, 0% inclusive, avoids negative/>=10, capped',()=>{
  const m=new Map([['AUSDT',item('AUSDT',0)],['BUSDT',item('BUSDT',3)],
    ['CUSDT',item('CUSDT',-1)],['DUSDT',{...item('DUSDT',3),lastPrice:11}]]);
  const symbols=new Set(['AUSDT','BUSDT','CUSDT','DUSDT']);
  const result=selectNaturalPilot(m,symbols,{maxSymbols:2});
  assert.deepEqual(result.sort(),['AUSDT','BUSDT']);
  assert.throws(()=>selectNaturalPilot(m,symbols,{maxSymbols:13}),/MAX_LAB_PILOT/);
});
test('closed klines only: no data gaps, no future high in accepted bar',()=>{
  const bar=(end,price=1)=>[end-60_000,price,price*1.1,price*.9,price,50,end-1];
  const a=parseClosedKline(bar(NOW),'1m'); assert.equal(a.endMs,NOW);
  assert.equal(parseClosedKline(bar(NOW+1),'1m'),null);
  assert.equal(parseStreamKline({k:{x:false,i:'1m',s:'JCTUSDT',T:NOW-1}},NOW),null);
  const bars=[a];assert.equal(addContiguousBar(bars,parseClosedKline(bar(NOW+60_000),'1m'),60000).ok,true);
  assert.equal(addContiguousBar(bars,parseClosedKline(bar(NOW+3*60_000),'1m'),60000).reason,'GAP');
});
test('REST URL allowlist prohibits other hosts and paths',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'lab-guard-'));try{
    const g=new LabRestGuard({filename:path.join(dir,'c.json'),fetchImpl:async()=>{throw Error('SHOULD_NOT_CALL');}});
    await assert.rejects(g.getJson('https://example.com/fapi/v1/klines'),/NOT_ALLOWED/);
    await assert.rejects(g.getJson('https://fapi.binance.com/fapi/v1/order'),/NOT_ALLOWED/);
    assert.equal(g.metrics().calls,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('HTTP 429 persists hard latch and forbids subsequent request',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'lab-latch-'));try{
    let n=0;const f=async()=>{n++;return {status:429,headers:{get:()=>null},ok:false};};
    const filename=path.join(dir,'circuit.json');
    const g=new LabRestGuard({filename,fetchImpl:f});await g.init();
    await assert.rejects(g.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo',1),/LATCHED_HTTP_429/);
    assert.equal(n,1);assert.equal(g.metrics().circuitOpen,true);
    assert.match(await readFile(filename,'utf8'),/HTTP_429/);
    await assert.rejects(g.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo',1),/LATCHED/);
    assert.equal(n,1);
    const g2=new LabRestGuard({filename,fetchImpl:f});await g2.init();assert.equal(g2.metrics().circuitOpen,true);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('remote-weight headroom triggers 120 second pause',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'lab-weight-'));try{
    const g=new LabRestGuard({filename:path.join(dir,'c.json'),fetchImpl:async()=>({
      status:200,headers:{get:()=> '280'},ok:true,json:async()=>({ok:true})})});
    const data=await g.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo',1);
    assert.equal(data.ok,true);assert.equal(g.metrics().paused,true);assert.equal(g.metrics().circuitOpen,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('LIVE requires explicit env; publication requires shadow enabled',()=>{
  const offline=new LabLiveShadow({env:{LAB_MAX_TRACKED:'8'}});
  assert.equal(offline.enabled,false);assert.equal(offline.publication,false);
  assert.throws(()=>new LabLiveShadow({env:{LAB_PUBLICATION_ENABLED:'true'}}),/PUBLICATION_REQUIRES/);
  assert.throws(()=>new LabLiveShadow({env:{LAB_MAX_TRACKED:'50'}}),/MAX_TRACKED/);
});
test('shadow never shows home or sends notifications even if internal event exists',()=>{
  const live=new LabLiveShadow({env:{LAB_LIVE_SHADOW_ENABLED:'true',LAB_PUBLICATION_ENABLED:'false'}});
  live.started=true;live.lastTickerAt=NOW;live.lastKlineAt=NOW;live.clock=()=>NOW;
  live.covered.set('DOODUSDT',{});
  live.events=[{id:`DOODUSDT:1m:${NOW-60000}:LONG_B`,symbol:'DOODUSDT',timeframe:'1m',
    signal:'LONG_B',bOrdinal:1,price:1,barClosedAtMs:NOW-60000,episodeAtMs:NOW-3600000,
    fromFirstA:true,protectVerified:true,qualityPassed:true,eligibleAsOf:true,confirmedClosedBar:true,causalVerified:true}];
  assert.deepEqual(live.home(),[]);
  assert.equal(live.status().notificationsEnabled,false);
  assert.equal(live.status().publicationEnabled,false);
});
test('HOME publication rejects 1M A/HOT/B3 and only keeps B1/B2/1H for 10h',()=>{
  const base={symbol:'DOODUSDT',timeframe:'1m',signal:'LONG_B',price:0.0015,
    barClosedAtMs:NOW-60000,episodeAtMs:NOW-30*60000,bOrdinal:1,
    fromFirstA:true,protectVerified:true,qualityPassed:true,eligibleAsOf:true,confirmedClosedBar:true,causalVerified:true};
  const e={...base,id:`DOODUSDT:1m:${base.barClosedAtMs}:LONG_B`};
  assert.equal(chooseHomeCards([e],NOW).length,1);
  assert.equal(chooseHomeCards([{...e,bOrdinal:3}],NOW).length,0);
  assert.equal(chooseHomeCards([{...e,signal:'LONG_A'}],NOW).length,0);
  assert.equal(chooseHomeCards([e],NOW+11*3600000).length,0);
});
test('read-only API rejects mutation; simulator remains explicitly marked offline',async()=>{
  const s=makeServer();await new Promise(ok=>s.listen(0,'127.0.0.1',ok));
  try{const u=`http://127.0.0.1:${s.address().port}`;
    assert.equal((await(await fetch(u+'/api/status')).json()).simulation,true);
    assert.equal((await fetch(u+'/api/home',{method:'POST'})).status,405);
    assert.deepEqual((await(await fetch(u+'/api/home')).json()).home,[]);
  }finally{await new Promise(ok=>s.close(ok));}
});
test('as-of previous 5M close exactly five minutes old is usable at boundary',async()=>{
  const {studyBQuality}=await import('../src/cohorts.js');
  const at=NOW;const e={barClosedAtMs:at,price:1.05};
  const a={aPrice:1};const c={endMs:at-300000,close:1.04,ma7:1.03,ma25:1.01,rsi:55};
  assert.equal(studyBQuality(e,a,c).passed,true);
  assert.equal(studyBQuality(e,a,{...c,endMs:at-600000}).passed,false);
});

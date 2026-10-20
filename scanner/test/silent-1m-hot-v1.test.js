/** Research-only observer: deterministic CLOSED bars, never FCM or HOME. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Silent1mHotV1} from '../src/silent-1m-hot-v1.js';
import {YellowLiveMarket} from '../src/live-market.js';

const MIN=60_000,START=Date.UTC(2026,9,20,6),symbol='JCTUSDT';
const event=(start=START)=>({signal:'LONG_A',timeframe:'1m',symbol,
  id:symbol+':1m:'+start+':LONG_A',barClosedAtMs:start,price:1});
const mk=async()=>{
  let now=START;const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-shadow-hot-'));
  const filename=path.join(dir,'silent.json');
  const m=new Silent1mHotV1({filename,clock:()=>now,writeGapMs:3600_000,log:()=>{}});
  assert.equal(await m.initialize(),true);
  return {m,filename,setNow:x=>now=x};
};
const bar=(n,close=1,high=close,low=close)=>({
  endMs:START+n*MIN,open:close,high,low,close,volume:10
});
const state=(countUp,tradeState=1)=>({countUp,tradeState});

test('no observer enabled by default; no exposed candidates, no notifications',async()=>{
  const {m}=await mk();const s=m.status();
  assert.equal(s.mode,'SILENT_RESEARCH');assert.equal(s.sendsFCM,false);
  assert.equal(s.entersHome,false);assert.equal(s.last24h.events,0);
});
test('HOT 1/2/3 measured against A and all complete outcome candles',async()=>{
 const {m,filename,setNow}=await mk();m.onLongA(event());
 for(let i=1;i<=120;i++){
   const close=i<=10?1+i*.003:1.03+i*.00045;
   const h=close+.001,lo=close-.001;
   m.onClosedBar(symbol,bar(i,close,h,lo),state([9,13,14].includes(i)?i:0));
 }
 setNow(START+120*MIN);
 const {last24h:s}=m.status();
 assert.equal(s.events,1);assert.equal(s.completed,1);assert.equal(s.pending,0);
 assert.equal(s.hot1,1);assert.equal(s.hot2,1);assert.equal(s.hot3,1);
 assert.equal(s.candidateConfirmed,1);assert.equal(s.strongAfterConfirmation,1);
 assert.equal(s.strongWithoutConfirmation,0);
 await m.flush();const saved=JSON.parse(await readFile(filename,'utf8'));
 assert.equal(saved.records[0].status,'COMPLETE');assert.equal(saved.records[0].hot.length,3);
 assert.ok(saved.records[0].selected.price>1);
 const reloaded=new Silent1mHotV1({filename,clock:()=>START+120*MIN,log:()=>{}});
 assert.equal(await reloaded.initialize(),true);
 assert.equal(reloaded.status().last24h.candidateConfirmed,1);
});
test('weak no-HOT scenario is measured, not called a validated false-positive',async()=>{
 const {m,setNow}=await mk();m.onLongA(event());
 for(let i=1;i<=120;i++)m.onClosedBar(symbol,bar(i,1.001,1.005,0.998),state(0));
 setNow(START+120*MIN);
 const s=m.status().last24h;
 assert.equal(s.completed,1);assert.equal(s.withHot,0);
 assert.equal(s.weakWithoutConfirmation,1);assert.equal(s.strongWithoutConfirmation,0);
});
test('strong no-HOT outcome is counted as a missed opportunity of the research idea',async()=>{
 const {m,setNow}=await mk();m.onLongA(event());
 for(let i=1;i<=120;i++)m.onClosedBar(symbol,bar(i,1.02,1.08,0.99),state(0));
 setNow(START+120*MIN);
 const s=m.status().last24h;
 assert.equal(s.strongWithoutConfirmation,1);
 assert.equal(s.candidateConfirmed,0);
});
test('incomplete one-minute data is neither called a winner nor a bad signal',async()=>{
 const {m,setNow}=await mk();m.onLongA(event());
 m.onClosedBar(symbol,bar(1,1.01),state(9));
 m.onClosedBar(symbol,bar(3,1.06),state(13));
 setNow(START+120*MIN);
 const s=m.status().last24h;
 assert.equal(s.incomplete,1);assert.equal(s.completed,0);
 assert.equal(s.strongAfterConfirmation,0);
});
test('HOT candle HIGH is not used as a future gain after HOT close',async()=>{
 const {m,setNow}=await mk();m.onLongA(event());
 for(let i=1;i<=120;i++){
   const isHot=i===9;
   m.onClosedBar(symbol,isHot?bar(i,1.02,1.20,1.01):bar(i,1.021,1.025,1.01),
     state(isHot?9:0));
 }
 setNow(START+120*MIN);
 const s=m.status().last24h;
 assert.equal(s.candidateConfirmed,1);assert.equal(s.weakAfterConfirmation,1);
 assert.equal(s.strongAfterConfirmation,0);
});
test('silently rejects malformed A, does not create HOME entries',async()=>{
 const {m}=await mk();
 m.onLongA({...event(),id:'NOT_VALID'});
 m.onLongA({...event(),timeframe:'5m'});
 assert.equal(m.status().last24h.events,0);
});
test('misconfigured passive experiment cannot silently reenable original 1m HOME/FCM',async()=>{
  const {m}=await mk();
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-shadow-config-'));
  assert.throws(()=>new YellowLiveMarket({dataDir:dir,
    wsClass:class FakeSocket{},
    silent1mHot:m,alertTimeframes:['1m','5m','15m','1h']}),
    /SILENT_1M_HOT_REQUIRES_1M_ALERTS_DISABLED/);
  const valid=new YellowLiveMarket({dataDir:dir,
    wsClass:class FakeSocket{},silent1mHot:m,alertTimeframes:['5m','15m','1h']});
  assert.deepEqual(valid.status().alertTimeframes,['5m','15m','1h']);
  assert.equal(valid.status().shadow1mHot.sendsFCM,false);
});
test('existing live scanner gates remain before any HOME/FCM call for disabled 1m',async()=>{
 const market=await readFile(new URL('../src/live-market.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/live-main.js',import.meta.url),'utf8');
 assert.match(market,/if\(tf==='1m'&&this\.silent1mHot\?\.enabled\)/);
 assert.match(market,/if\(!this\.alertTimeframes\.has\(tf\)\)[\s\S]*?continue;[\s\S]*?this\.ledger\.accept/);
 assert.match(market,/shadow1mHot:this\.silent1mHot\?\.status/);
 assert.match(main,/YELLOW_1M_HOT_SHADOW_ENABLED==='true'/);
 assert.match(main,/YELLOW_ALERT_TIMEFRAMES\|\|'1m,5m,15m,1h'/);
});

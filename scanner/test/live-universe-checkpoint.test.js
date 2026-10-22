import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {LaneCheckpoint} from '../src/live-state-checkpoint.js';
import {newParallelState,PERIODS} from '../src/parallel-long-a.js';
import {YellowLiveMarket} from '../src/live-market.js';
const END=Date.UTC(2026,9,17,6),symbol='AGTUSDT';
const temp=()=>mkdtemp(path.join(os.tmpdir(),'yellow-checkpoint-'));
const book=(ends={})=>({latest:tf=>({endMs:ends[tf]??END})});
function states(){const s=newParallelState();for(const tf of Object.keys(PERIODS))Object.assign(s[tf],{
  lastProcessedEndMs:END,index:40,countDown:9,lastPullbackBar:35,tradeState:2,protectBar:38});return s;}
test('durable restart preserves all four independent lane counters and trade states without replay',async()=>{
 const dir=await temp(),s=states();await new LaneCheckpoint(dir).save(symbol,s,END+1000);
 const r=await new LaneCheckpoint(dir).restore(symbol,book(),END+2000);
 assert.deepEqual(r.states,s);assert.deepEqual(r.resumed,Object.keys(PERIODS));assert.deepEqual(r.cold,[]);
});
test('missed 1m bar resets only 1m; 1h/15m/5m retain proven state',async()=>{
 const store=new LaneCheckpoint(await temp());await store.save(symbol,states(),END);
 const r=await store.restore(symbol,book({'1m':END+60000}),END+60001);
 assert.deepEqual(r.cold,['1m']);assert.equal(r.states['1m'].tradeState,0);
 assert.equal(r.states['1m'].lastPullbackBar,null);assert.equal(r.states['1h'].tradeState,2);
 assert.equal(r.states['1h'].countDown,9);
});
test('missing checkpoint starts at latest cursor and never emits old alerts',async()=>{
 const r=await new LaneCheckpoint(await temp()).restore(symbol,book(),END);
 assert.equal(r.resumed.length,0);assert.equal(r.cold.length,4);
 for(const s of Object.values(r.states)){assert.equal(s.lastProcessedEndMs,END);assert.equal(s.index,-1);}
});
test('corrupt, future and mismatched checkpoint fail closed',async()=>{
 const dir=await temp(),store=new LaneCheckpoint(dir);await store.save(symbol,states(),END);
 const filename=path.join(dir,symbol+'.json'),original=await readFile(filename,'utf8');
 for(const change of [d=>{d.states['1h'].tradeState=99;},d=>{d.savedAtMs=END+1;},d=>{d.revision='other';}]){
  const doc=JSON.parse(original);change(doc);await writeFile(filename,JSON.stringify(doc));
  await assert.rejects(store.restore(symbol,book(),END),/CHECKPOINT_INVALID/);
 }
 await writeFile(filename,'broken');await assert.rejects(store.restore(symbol,book(),END),/UNREADABLE/);
});
test('checkpoint rejects path traversal and serializes immutable snapshots',async()=>{
 const store=new LaneCheckpoint(await temp()),s=states();
 await assert.rejects(store.save('../invalid',s,END),/INVALID_CHECKPOINT_SYMBOL/);
 const first=store.save(symbol,s,END);s['1h'].countDown=13;const second=store.save(symbol,s,END);
 await Promise.all([first,second]);assert.equal((await store.restore(symbol,book(),END)).states['1h'].countDown,13);
});
test('capacity 50 fills all eligible until its maximum; no duplicates or direct fetch',async()=>{
 const market=new YellowLiveMarket({dataDir:await temp(),clock:()=>END,wsClass:class {},
  guard:{closedReason:null,metrics:()=>({})},log:()=>{}});
 const list=Array.from({length:86},(_,i)=>({symbol:'COIN'+i+'USDT'}));let calls=0;
 market.bootstrap=async symbol=>{calls++;market.covered.set(symbol,{});};
 for(let i=0;i<86;i++){await market.bootstrapNextEligible(list);}
 await market.bootstrapNextEligible(list);assert.equal(calls,50);assert.equal(market.covered.size,50);
 assert.equal(market.maxTracked,50);
});
test('explicit pilot cap, remote pause and invalid config remain enforced',async()=>{
 const config={dataDir:await temp(),clock:()=>END,wsClass:class {},log:()=>{},guard:{closedReason:null,isRemotePaused:()=>false,metrics:()=>({})}};
 const market=new YellowLiveMarket({...config,maxTracked:24});let calls=0;
 market.bootstrap=async s=>{calls++;market.covered.set(s,{});};
 const list=Array.from({length:30},(_,i)=>({symbol:'COIN'+i+'USDT'}));
 for(let i=0;i<30;i++)await market.bootstrapNextEligible(list);assert.equal(calls,24);
 market.covered.clear();market.guard.isRemotePaused=()=>true;
 await market.bootstrapNextEligible(list);assert.equal(calls,24);
 for(const maxTracked of [NaN,0,51,201,1.5])assert.throws(()=>new YellowLiveMarket({...config,maxTracked}),/INVALID_MAX_TRACKED/);
});
test('real bootstrap restores only matching TF cursors, uses exactly four guarded requests and sends no old event',async()=>{
 const dataDir=await temp();let calls=0,sends=0;
 const guard={closedReason:null,metrics:()=>({}),getJson:async url=>{
  calls++;const tf=new URL(url).searchParams.get('interval'),period=PERIODS[tf];
  return Array.from({length:170},(_,i)=>{const end=END-(169-i)*period;
   return [end-period,'.05','.051','.049','.05','100',end-1,'5',10,'50','2.5'];});
 }};
 const config={dataDir,clock:()=>END+1000,wsClass:class {},guard,log:()=>{},sendEvent:async()=>sends++};
 const original=states();await new LaneCheckpoint(path.join(dataDir,'lane-checkpoints')).save(symbol,original,END);
 const market=new YellowLiveMarket(config);await market.bootstrap(symbol);
 assert.equal(calls,4);assert.equal(sends,0);assert.deepEqual(market.covered.get(symbol).states,original);
 assert.equal(market.covered.get(symbol).resumedLanes.length,4);
 const restarted=new YellowLiveMarket(config);await restarted.bootstrap(symbol);
 assert.equal(calls,8);assert.equal(sends,0);assert.deepEqual(restarted.covered.get(symbol).states,original);
});

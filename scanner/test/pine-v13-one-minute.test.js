import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {newPineOneMinuteState,advancePineCycle,pineV13Conditions,stepPineOneMinute,
  rebuildPineOneMinute,validPineOneMinuteState,eligiblePineNotification} from '../src/pine-v13-one-minute.js';
import {newParallelState,stepLongAOnTimeframe} from '../src/parallel-long-a.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {LaneCheckpoint} from '../src/live-state-checkpoint.js';
import {CandleBook} from '../src/live-candle-book.js';

const END=Date.UTC(2026,9,24,12),M=60_000,symbol='TESTUSDT';
const proven=()=>({...newPineOneMinuteState(),index:100,lastPullbackBar:95,lastProcessedEndMs:END-M,
  pine1m:{revision:1,synchronized:true,downCountKnown:true,unknownPullbackBars:0,anchorEndMs:END-100*M}});
const ticker=(end=END)=>({symbol,source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',
  lastPrice:.067,priceChangePercent:2.5,quoteVolume24h:20_000_000,observedAtMs:end});
const permission={hourPass:true,fifteenPass:true,fivePass:true,fiveReclaim:true,currentPass:true,currentReclaim:true,protect:false,finalFail:false};

// One consistent 1m feed, aggregated into 5m/15m/1h. Fully synthetic, not ORDER/LIGHT evidence.
function dataset(){
  const all=[];for(let i=0;i<16000;i++){
    const j=i-15000,close=j<0?.05+i*.000001:j<180?.065-j*.00001:j<420?.0632+(j-180)*.000012:
      .06608+(j-420)*.000001+.00006*Math.sin((j-420)*.2);
    all.push({endMs:END-(15999-i)*M,close,volume:100});
  }
  const d={oneMinute:all.slice(-999)};
  for(const [key,span,limit] of [['fiveMinute',5*M,499],['fifteenMinute',15*M,249],['oneHour',60*M,170]]){
    const groups=new Map();for(const b of all){const k=Math.floor((b.endMs-1)/span);
      if(!groups.has(k))groups.set(k,[]);groups.get(k).push(b);}
    d[key]=[...groups.values()].filter(g=>g.length===span/M&&g.at(-1).endMs%span===0)
      .map(g=>({...g.at(-1),volume:g.reduce((s,b)=>s+b.volume,0)})).slice(-limit);
  }
  return d;
}
const data=dataset(),at=i=>({...data,oneMinute:data.oneMinute.slice(0,i+1),nowMs:data.oneMinute[i].endMs,
  ticker24h:ticker(data.oneMinute[i].endMs)});

test('Pine A -> PROTECT -> B -> OUT -> A; B has no pullback or 5m RSI-average requirement',()=>{
  let state=proven();
  let r=advancePineCycle(state,permission,END);assert.equal(r.signal,'LONG_A');
  r=advancePineCycle({...r.state,index:101},{...permission,protect:true},END+M);assert.equal(r.signal,'PROTECT');
  r=advancePineCycle({...r.state,index:102,lastPullbackBar:null},{...permission,fivePass:false,currentPass:false},END+2*M);
  assert.equal(r.signal,'LONG_B');assert.equal(r.state.tradeState,1);
  r=advancePineCycle({...r.state,index:103},{...permission,finalFail:true},END+3*M);assert.equal(r.signal,'OUT_FINAL');
  r=advancePineCycle({...r.state,index:104,lastPullbackBar:104},permission,END+4*M);assert.equal(r.signal,'LONG_A');
});
test('expired B window stays protected, never relabels as a fresh A',()=>{
  const r=advancePineCycle({...proven(),tradeState:2,protectBar:9},permission,END);
  assert.equal(r.signal,null);assert.equal(r.state.tradeState,2);
});
test('unknown position never assumes flat; final-exit anchor requires known pullback history',()=>{
  const state={...newPineOneMinuteState(),lastPullbackBar:0,index:1};
  assert.equal(advancePineCycle(state,permission,END).signal,null);
  assert.equal(advancePineCycle(state,{...permission,finalFail:true},END).state.pine1m.synchronized,false);
  state.pine1m.downCountKnown=true;state.pine1m.unknownPullbackBars=0;
  const r=advancePineCycle(state,{...permission,finalFail:true},END);
  assert.equal(r.state.pine1m.synchronized,true);assert.equal(r.state.tradeState,0);assert.equal(r.signal,null);
});
test('Pine internal price ceiling remains 30; reclaim does not inherit A-only conditions',()=>{
  const c={close:20,ma7:19.9,ma25:19.8,ma99:19,rsi:60,rsiAvg:55,volumeRatio:1};
  const five={...c,rsiAvg:65},higher={...c};const r=pineV13Conditions(c,five,higher,higher);
  assert.equal(r.currentPass,true);assert.equal(r.fivePass,false);assert.equal(r.fiveReclaim,true);
  const above=pineV13Conditions({...c,close:30,ma7:29.9,ma25:29.8},five,higher,higher);
  assert.equal(above.currentPass,false);assert.equal(above.currentReclaim,true);
});
test('strict notification filter rejects boundaries, stale/missing/future ticker and non-USD-M',()=>{
  assert.equal(eligiblePineNotification(symbol,ticker(),END),true);
  for(const change of [{priceChangePercent:1},{quoteVolume24h:10_000_000},{lastPrice:10},{lastPrice:0},
    {observedAtMs:END+1},{observedAtMs:END-120001},{source:'OTHER'},{status:'BREAK'},{quoteVolume24h:undefined}])
    assert.equal(eligiblePineNotification(symbol,{...ticker(),...change},END),false,JSON.stringify(change));
  assert.equal(eligiblePineNotification(symbol,null,END),false);
});
test('real same-feed chronological replay synchronizes and generates A/P/B, publishing A only',()=>{
  let state=rebuildPineOneMinute(symbol,at(169)).state;const signals=[],published=[];
  assert.equal(state.pine1m.synchronized,false,'initial down run has no proven counter reset yet');
  for(let i=170;i<999;i++){
    const r=stepPineOneMinute(symbol,at(i),state);state=r.state;
    if(r.diagnostics?.internalSignal)signals.push([i,r.diagnostics.internalSignal]);
    if(r.event)published.push([i,r.event.signal]);
  }
  assert.deepEqual(signals.slice(0,3),[[704,'LONG_A'],[724,'PROTECT'],[735,'LONG_B']]);
  assert.deepEqual(published,[[704,'LONG_A']]);
  assert.equal(state.pine1m.synchronized,true);
  assert.deepEqual(state,rebuildPineOneMinute(symbol,data).state);
});
test('ineligible or missing ticker suppresses publication but preserves the exact Pine cycle',()=>{
  const original=rebuildPineOneMinute(symbol,at(703)).state;
  for(const t of [null,{...ticker(data.oneMinute[704].endMs),priceChangePercent:.99},
    {...ticker(data.oneMinute[704].endMs),quoteVolume24h:9_000_000}]){
    const a=stepPineOneMinute(symbol,{...at(704),ticker24h:t},original);
    assert.equal(a.event,null);assert.equal(a.diagnostics.internalSignal,'LONG_A');assert.equal(a.state.tradeState,1);
    const restored=rebuildPineOneMinute(symbol,at(735),a.state);
    assert.equal(restored.state.tradeState,1,'later B must return to active, not become a fresh A');
    assert.equal(restored.usedCheckpoint,true);
  }
});
test('B case: legacy flat assumption produces A, reconstructed cycle produces B without an event',()=>{
  const state=rebuildPineOneMinute(symbol,at(734)).state;
  assert.equal(state.tradeState,2);
  const r=stepPineOneMinute(symbol,at(735),state);
  assert.equal(r.diagnostics.internalSignal,'LONG_B');assert.equal(r.event,null);
  const legacy=stepLongAOnTimeframe(symbol,'1m',at(735),{...state,tradeState:0});
  assert.equal(legacy.event?.signal,'LONG_A','regression must actually reproduce a false A');
});
test('restart with missed bars silently catches up across PROTECT and B with checkpoint state',()=>{
  const prior=rebuildPineOneMinute(symbol,at(710)).state;
  const r=rebuildPineOneMinute(symbol,at(735),prior);
  assert.equal(r.usedCheckpoint,true);assert.equal(r.replayed,25);
  assert.equal(r.state.lastEventId,`${symbol}:1m:${data.oneMinute[735].endMs}:LONG_B`);
  assert.deepEqual(r.state,rebuildPineOneMinute(symbol,at(735)).state);
});
test('lost checkpoint and expired history cannot presume flat or fabricate an anchor',()=>{
  const strong={};for(const [key,span] of [['oneMinute',M],['fiveMinute',5*M],['fifteenMinute',15*M],['oneHour',60*M]])
    strong[key]=Array.from({length:170},(_,i)=>({endMs:END-(169-i)*span,close:1+i*.0005,volume:100}));
  const r=rebuildPineOneMinute(symbol,strong);
  assert.equal(r.state.pine1m.synchronized,false);assert.equal(r.state.pine1m.anchorEndMs,null);
  assert.equal(r.usedCheckpoint,false);assert.equal(validPineOneMinuteState(r.state),true);
});
test('gap, duplicate, open or missing context never advances a proven live cursor',()=>{
  const state=rebuildPineOneMinute(symbol,at(734)).state;
  for(const [input,reason] of [[at(734),'ALREADY_PROCESSED'],[at(736),'TARGET_DATA_GAP_REBOOTSTRAP_REQUIRED'],
    [{...at(735),nowMs:data.oneMinute[735].endMs-1},'OPEN_OR_FUTURE_TARGET_CANDLE'],
    [{...at(735),fiveMinute:[]},'CONTEXT_STALE_OR_INCOMPLETE_5m']]){
    const r=stepPineOneMinute(symbol,input,state);assert.equal(r.reason,reason);assert.deepEqual(r.state,state);assert.equal(r.event,null);
  }
});
test('production flush path never sends B or accepts it in HOME; A delivery remains durable',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-pine-delivery-'));
  try{
    let now=data.oneMinute[704].endMs+1000,sends=0;
    const market=new YellowLiveMarket({dataDir:dir,clock:()=>now,wsClass:class{},
      guard:{closedReason:null,metrics:()=>({})},sendEvent:async()=>sends++,log:()=>{}});
    const states=newParallelState();states['1m']=rebuildPineOneMinute(symbol,at(703)).state;
    const liveAt=i=>{const x=at(i);for(const key of ['fiveMinute','fifteenMinute','oneHour'])
      x[key]=x[key].filter(b=>b.endMs<=x.nowMs);return x;};
    let input=liveAt(704);
    for(const [tf,key] of [['5m','fiveMinute'],['15m','fifteenMinute'],['1h','oneHour']])
      states[tf].lastProcessedEndMs=input[key].at(-1).endMs;
    const tracked={states,book:{snapshot:()=>input,pineSnapshot:()=>input}};
    market.covered.set(symbol,tracked);market.getTickerAsOf=()=>ticker(input.oneMinute.at(-1).endMs);
    await market.flushTracked(symbol,tracked);assert.equal(sends,1);assert.equal(market.home().length,1);
    assert.equal(market.events(0).length,1);assert.equal(market.events(0)[0].signal,'LONG_A');
    states['1m']=rebuildPineOneMinute(symbol,at(734)).state;input=liveAt(735);now=input.nowMs+1000;
    for(const [tf,key] of [['5m','fiveMinute'],['15m','fifteenMinute'],['1h','oneHour']])
      states[tf].lastProcessedEndMs=input[key].at(-1).endMs;
    await market.flushTracked(symbol,tracked);assert.equal(sends,1);
    assert.equal(states['1m'].tradeState,1);assert.equal(market.home().length,1);
    assert.equal(market.events(0).length,0,'original A polling record has expired after 31m; no B was inserted');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('checkpoint persists synchronization proof; legacy 1m state is migrated, other lanes untouched',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-pine-checkpoint-'));
  try{
    const store=new LaneCheckpoint(dir),states=newParallelState();states['1m']=rebuildPineOneMinute(symbol,data).state;
    for(const tf of ['5m','15m','1h'])Object.assign(states[tf],{lastProcessedEndMs:END,index:20,tradeState:2,protectBar:19});
    await store.save(symbol,states,END);
    const book={latest:()=>({endMs:END})},same=await store.restore(symbol,book,END);
    assert.deepEqual(same.states,states);
    const gap=await store.restore(symbol,{latest:tf=>({endMs:END+(tf==='1m'?M:0)})},END+M);
    assert.deepEqual(gap.previousOneMinute,states['1m']);assert.equal(gap.states['1h'].tradeState,2);
    const filename=path.join(dir,symbol+'.json'),doc=JSON.parse(await readFile(filename,'utf8'));
    doc.states['1m'].pine1m.anchorEndMs=END+M;await writeFile(filename,JSON.stringify(doc));
    await assert.rejects(store.restore(symbol,book,END),/CHECKPOINT_INVALID/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('deeper recovery history preserves the original 170-to-190 live windows for other TFs',()=>{
  const normal=new CandleBook(symbol),deep=new CandleBook(symbol,{retainRecoveryHistory:true});
  for(const [tf,key] of [['5m','fiveMinute'],['15m','fifteenMinute'],['1h','oneHour']]){
    const span={'5m':5*M,'15m':15*M,'1h':60*M}[tf];
    const rows=data[key].map(b=>[b.endMs-span,b.close,b.close,b.close,b.close,b.volume,b.endMs-1,'5',10,'50','2.5']);
    normal.bootstrap(tf,rows.slice(-170),END);deep.bootstrap(tf,rows,END);
    assert.deepEqual(deep.snapshot()[key],normal.snapshot()[key]);
  }
});

test('full production bootstrap migrates legacy 1m only, with four guarded calls and no historical sends',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-pine-bootstrap-'));
  try{
    const states=newParallelState();
    for(const state of Object.values(states))Object.assign(state,{lastProcessedEndMs:END,index:40,
      countDown:9,lastPullbackBar:35,tradeState:2,protectBar:38});
    const checkpointDir=path.join(dir,'lane-checkpoints');await new LaneCheckpoint(checkpointDir).save(symbol,states,END);
    const calls=[],logs=[];let sends=0;
    const map={'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'};
    const market=new YellowLiveMarket({dataDir:dir,clock:()=>END+1000,wsClass:class{},
      guard:{closedReason:null,metrics:()=>({}),getJson:async(url,{weight})=>{
        const u=new URL(url),tf=u.searchParams.get('interval'),span={'1m':M,'5m':5*M,'15m':15*M,'1h':60*M}[tf];
        calls.push({tf,weight,limit:Number(u.searchParams.get('limit'))});
        return data[map[tf]].map(b=>[b.endMs-span,b.close,b.close,b.close,b.close,b.volume,b.endMs-1,'5',10,'50','2.5']);
      }},sendEvent:async()=>sends++,log:(...x)=>logs.push(x)});
    await market.bootstrap(symbol);const tracked=market.covered.get(symbol);
    assert.ok(tracked);assert.equal(sends,0);assert.equal(calls.length,4);
    assert.deepEqual(calls.map(c=>c.limit),[170,249,499,999]);assert.deepEqual(calls.map(c=>c.weight),[2,2,2,5]);
    assert.equal(tracked.states['1m'].pine1m.synchronized,true);assert.equal(tracked.states['1m'].tradeState,2);
    for(const tf of ['5m','15m','1h'])assert.deepEqual(tracked.states[tf],states[tf]);
    assert.deepEqual(tracked.coldLanes,['1m']);assert.deepEqual(tracked.resumedLanes,['5m','15m','1h']);
    assert.equal(logs.some(x=>x[0]==='YELLOW_PINE_1M_RECOVERY'),true);
    assert.deepEqual(market.home(),[]);
    assert.equal(market.status().pineOneMinute[0].synchronized,true);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('truncated initial down run never invents a pullback count or a synchronized position',()=>{
  const d={};for(const [key,span] of [['oneMinute',M],['fiveMinute',5*M],['fifteenMinute',15*M],['oneHour',60*M]])
    d[key]=Array.from({length:170},(_,i)=>({endMs:END-(169-i)*span,close:2-i*.0005,volume:100}));
  const r=rebuildPineOneMinute(symbol,d);
  assert.equal(r.state.pine1m.downCountKnown,false);assert.equal(r.state.pine1m.synchronized,false);
  assert.equal(r.state.lastPullbackBar,null);
});

test('2000 indicator snapshots agree with condition expressions read directly from owner Pine v1.3',async()=>{
  const source=await readFile(new URL('../../docs/reference/BANKSAWAN-LONG-MTF-v1.3-user-supplied.pine',import.meta.url),'utf8');
  // Only the bounded boolean/comparison expressions below are translated. No
  // Pine execution, network calls, or claim of TradingView-runtime validation.
  const names=['oneHourPermission','fifteenMinuteSupport','fiveMinuteMomentum','oneMinuteTrigger',
    'oneMinuteWeak','fiveMinuteWeak','protectCondition','oneMinuteReclaim','fiveMinuteReclaim',
    'fifteenMinuteFailure','fiveMinuteMajorFailure','hardFailure','finalExitCondition'];
  const expressions=names.map(name=>{
    const expr=source.match(new RegExp('^'+name+' = (.+)$','m'))?.[1];assert.ok(expr,name);
    assert.match(expr,/^[\w\s.<>!=()+*/%-]+$/);
    const js=expr.replace(/\b[A-Za-z_]\w*\b/g,x=>x==='and'?'&&':x==='or'?'||':'v.'+x);
    return [name,new Function('v','return '+js)];
  });
  let seed=20261024;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const metrics=()=>({close:.9+random()*.2,ma7:.9+random()*.2,ma25:.9+random()*.2,
    ma99:.9+random()*.2,rsi:35+random()*45,rsiAvg:40+random()*30,volumeRatio:random()*2});
  for(let i=0;i<2000;i++){
    const c=metrics(),f=metrics(),q=metrics(),h=metrics();
    const v={close:c.close,ma7:c.ma7,ma25:c.ma25,ma99:c.ma99,rsiValue:c.rsi,rsiAverage:c.rsiAvg,
      volumeRatio:c.volumeRatio,distanceFromMA7:Math.abs(c.close-c.ma7)/c.ma7*100,
      rsiEntryMinimum:50,rsiEntryMaximum:75,minimumVolumeRatio:.75,maximumMADistance:2.5,maximumPrice:30,
      close5:f.close,ma7Five:f.ma7,ma25Five:f.ma25,ma99Five:f.ma99,rsiFive:f.rsi,rsiAverageFive:f.rsiAvg,
      close15:q.close,ma7Fifteen:q.ma7,ma25Fifteen:q.ma25,rsiFifteen:q.rsi,ma99Fifteen:q.ma99,
      close60:h.close,ma7Sixty:h.ma7,ma25Sixty:h.ma25,ma99Sixty:h.ma99,rsiSixty:h.rsi};
    for(const [name,fn] of expressions)v[name]=fn(v);
    const actual=pineV13Conditions(c,f,q,h);
    for(const [key,reference] of Object.entries({hourPass:'oneHourPermission',fifteenPass:'fifteenMinuteSupport',
      fivePass:'fiveMinuteMomentum',currentPass:'oneMinuteTrigger',protect:'protectCondition',
      currentReclaim:'oneMinuteReclaim',fiveReclaim:'fiveMinuteReclaim',finalFail:'finalExitCondition'}))
      assert.equal(actual[key],v[reference],`${i}:${key}`);
  }
});

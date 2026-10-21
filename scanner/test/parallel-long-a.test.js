import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateParallelLongA,stepLongAOnTimeframe,newParallelState,PERIODS,TIMEFRAMES} from '../src/parallel-long-a.js';
import {newIntentState,routeParallelIntents} from '../src/parallel-intents.js';
const END=Date.UTC(2026,9,15,12);
const seq=(n,step,fn)=>Array.from({length:n},(_,i)=>({endMs:END-(n-1-i)*step,close:fn(i),volume:100+(i%3)}));
const keyByTf={'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'};
const strong=i=>1+i*.0005;
const oscillating=i=>1+i*.00005+.0005*Math.sin(i*.3+5);
const fiveOscillating=i=>1+i*.00005+.0005*Math.sin(i*.6);
function fixture(target='15m',pct='2.4'){
 const input={oneMinute:seq(150,PERIODS['1m'],strong),fiveMinute:seq(150,PERIODS['5m'],strong),
 fifteenMinute:seq(150,PERIODS['15m'],strong),oneHour:seq(150,PERIODS['1h'],strong),
 ticker24h:{symbol:'TESTUSDT',source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',
 lastPrice:'1.1',priceChangePercent:pct,observedAtMs:END},nowMs:END+1};
 input[keyByTf[target]]=seq(150,PERIODS[target],target==='5m'?fiveOscillating:oscillating);
 const states=newParallelState();states[target].lastPullbackBar=20;states[target].index=20;
 return {input,states};
}
test('15M LONG A notifies immediately while 1M, 5M and 1H did NOT signal',()=>{
 const {input,states}=fixture('15m');
 const r=evaluateParallelLongA('TESTUSDT',input,states);
 assert.deepEqual(r.events.map(e=>e.timeframe),['15m']);
 assert.equal(r.events[0].signal,'LONG_A');
 assert.deepEqual(Object.keys(r.results),TIMEFRAMES);
 assert.equal(r.results['15m'].diagnostics.currentPass,true);
 assert.equal(r.results['1m'].event,null);
});
for(const tf of TIMEFRAMES){
 test(`independent ${tf} target can produce LONG A without other TF signal events`,()=>{
 const {input,states}=fixture(tf);
 const r=evaluateParallelLongA('TESTUSDT',input,states);
 assert.deepEqual(r.events.map(e=>e.timeframe),[tf]);
 assert.equal(r.events[0].id,`TESTUSDT:${tf}:${END}:LONG_A`);
 assert.equal(r.events[0].status,'RESEARCH_ONLY');
 });
}
test('same symbol can get separate 1M and 15M intents while HOME timer is not extended',()=>{
 const a={id:`TESTUSDT:1m:${END}:LONG_A`,signal:'LONG_A',symbol:'TESTUSDT',timeframe:'1m',barClosedAtMs:END};
 const b={...a,id:`TESTUSDT:15m:${END}:LONG_A`,timeframe:'15m'};
 const first=routeParallelIntents([a],END+1000,newIntentState());
 const second=routeParallelIntents([b],END+2000,first.state);
 assert.equal(first.notificationIntents.length,1);
 assert.equal(second.notificationIntents.length,1);
 assert.equal(second.state.home.length,1);
 assert.equal(second.state.home[0].firstSeenMs,END+1000);
 assert.equal(second.state.home[0].homeExpiresMs,END+1000+86_400_000);
 const dupe=routeParallelIntents([a,b],END+3000,second.state);
 assert.equal(dupe.notificationIntents.length,0);
});
test('no event for Binance change <+1%, >=10 USDT, stale/future ticker',()=>{
 for(const bad of ['pct','price','stale','future']){
   const {input,states}=fixture('15m');
   if(bad==='pct')input.ticker24h.priceChangePercent='0.99';
   if(bad==='price')input.ticker24h.lastPrice='10.0';
   if(bad==='stale')input.ticker24h.observedAtMs=END-300_000;
   if(bad==='future')input.ticker24h.observedAtMs=END+10_000;
   const r=stepLongAOnTimeframe('TESTUSDT','15m',input,states['15m']);
   assert.equal(r.event,null,bad);
 }
});
test('priority +5% does not delay LONG A and operates in any lane',()=>{
 const {input,states}=fixture('15m','5.0');
 const r=evaluateParallelLongA('TESTUSDT',input,states);
 assert.equal(r.events[0].priority,'HIGH');
});
test('stale 5M context blocks 15M without conflating it with unconfirmed LONG A',()=>{
 const {input,states}=fixture('15m');
 input.fiveMinute=input.fiveMinute.slice(0,-2);
 const r=stepLongAOnTimeframe('TESTUSDT','15m',input,states['15m']);
 assert.equal(r.reason,'CONTEXT_STALE_OR_INCOMPLETE_5m');
});
test('each lane enforces own candle interval, idempotency and gaps',()=>{
 const {input,states}=fixture('15m');
 const first=stepLongAOnTimeframe('TESTUSDT','15m',input,states['15m']);
 assert.equal(stepLongAOnTimeframe('TESTUSDT','15m',input,first.state).reason,'ALREADY_PROCESSED');
 const input2={...input,fifteenMinute:input.fifteenMinute.map(b=>({...b,endMs:b.endMs+30*60_000})),nowMs:END+31*60_000,
 ticker24h:{...input.ticker24h,observedAtMs:END+30*60_000}};
 assert.equal(stepLongAOnTimeframe('TESTUSDT','15m',input2,first.state).reason,'TARGET_DATA_GAP_REBOOTSTRAP_REQUIRED');
});
test('late events do not trigger delayed notifications or enter HOME',()=>{
 const a={id:`TESTUSDT:15m:${END}:LONG_A`,signal:'LONG_A',symbol:'TESTUSDT',timeframe:'15m',barClosedAtMs:END};
 const r=routeParallelIntents([a],END+5*60_000+1,newIntentState());
 assert.equal(r.notificationIntents.length,0);
 assert.equal(r.state.home.length,0);
 assert.equal(r.rejected[0].reason,'EXPIRED_OR_FUTURE_EVENT');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {secondSignal1m,SECOND_SIGNAL_METHOD} from '../src/second-signal-1m.js';
import {newReadinessWatch} from '../src/entry-readiness-v3.js';
import {fixture,T,M} from './fixtures/analysis-companion.mjs';

function seed(){
 const {event,snapshot}=fixture('1m');
 return {event,snapshot,watch:newReadinessWatch(event)};
}
function descend(source,tf){
 const key={'5m':'fiveMinute','15m':'fifteenMinute'}[tf];
 source[key]=source[key].map((b,i)=>{
   const close=.70-i*.00075;
   return {...b,open:close+.0001,high:close+.0003,low:close-.0003,close};
 });
}
function downBars(src){
 const floor=Math.min(...src.snapshot.oneMinute.slice(-21,-1).map(b=>b.low));
 for(let i=1;i<=2;i++){
   const c=floor*(i===1?.994:.992);
   src.snapshot.oneMinute.push({endMs:T+i*M,open:c+.002,high:c+.003,low:c-.002,close:c,volume:250});
 }
 return src;
}
test('Only 1M LONG A has a second-entry assessment; other FCM lanes stay out of scope',()=>{
 const a=seed();
 for(const tf of ['5m','15m','1h']){
   const event={...a.event,timeframe:tf,id:`TESTUSDT:${tf}:${T}:LONG_A`};
   const x=secondSignal1m({...a,event,nowMs:T+M});
   assert.equal(x.status,'NOT_APPLICABLE');
   assert.equal(x.reason,'ENTRY_V3_ONLY_1M');
 }
});
test('First decline is a WAIT, not an impossible prediction it will never recover',()=>{
 const x=downBars(seed());
 const one=structuredClone(x);
 one.snapshot.oneMinute.pop();
 const w=secondSignal1m({...one,nowMs:T+M+1000});
 assert.equal(w.status,'YELLOW');
 assert.equal(w.reason,'WAIT_PULLBACK_RECOVERY');
});
test('Repeated below-floor sell closes require both native TF context confirmations before RED',()=>{
 const x=downBars(seed());
 const early=secondSignal1m({...x,nowMs:T+2*M+1000});
 assert.equal(early.status,'YELLOW');
 descend(x.snapshot,'5m');
 const onlyFive=secondSignal1m({...x,nowMs:T+2*M+1000});
 assert.equal(onlyFive.status,'YELLOW');
 descend(x.snapshot,'15m');
 const both=secondSignal1m({...x,nowMs:T+2*M+1000});
 assert.equal(both.status,'RED');assert.equal(both.reason,'STRUCTURAL_BREAKDOWN');
 assert.ok(both.risk.supportFloor>0);
 assert.ok(both.risk.sellVolumeRatio>=1.5);
 assert.equal(both.risk.fiveMinuteTrend,'DOWN');
 assert.equal(both.risk.fifteenMinuteTrend,'DOWN');
 assert.equal('probability' in both,false);
});
test('No red when price falls without elevated selling volume',()=>{
 const x=downBars(seed());descend(x.snapshot,'5m');descend(x.snapshot,'15m');
 x.snapshot.oneMinute.at(-1).volume=50;
 assert.equal(secondSignal1m({...x,nowMs:T+2*M+1000}).status,'YELLOW');
});
function setupConfirmed(path){
 const x=seed(),p=x.event.price,at=T+2*M+1000;
 for(let i=1;i<=2;i++)x.snapshot.oneMinute.push({
    endMs:T+i*M,open:p,high:p+.001,low:p-.001,close:p+.0002,volume:100
 });
 x.watch={...x.watch,state:'CONFIRMED',path,reason:'SETUP_CONFIRMED',
    confirmedAtMs:at,entryUntilMs:at+3*M,lastBarEndMs:T+2*M,
    evidence:{dataReady:true},plan:{referenceEntry:p,entryLow:p-.001,
       entryHigh:p+.001,stopLoss:p-.01,tp1:p+.01,tp2:p+.02,tp3:p+.03}};
 x.ticker={lastPrice:p,observedAtMs:at+1000,priceChangePercent:2,quoteVolume24h:2e7};
 x.nowMs=at+1000;
 return x;
}
test('GREEN is possible only for confirmed pullback or continuation in live eligible zone',()=>{
 for(const [path,reason] of [['PULLBACK','PULLBACK_RECOVERED'],['CONTINUATION','CONTINUATION_CONFIRMED']]){
   const x=setupConfirmed(path);
   const g=secondSignal1m(x);
   assert.equal(g.method,SECOND_SIGNAL_METHOD);
   assert.equal(g.status,'GREEN');assert.equal(g.reason,reason);
   assert.equal(g.setupPath,path);
   assert.equal(secondSignal1m({...x,ticker:{...x.ticker,priceChangePercent:.9}}).status,'YELLOW');
   assert.equal(secondSignal1m({...x,ticker:{...x.ticker,lastPrice:x.watch.plan.entryHigh+.002}}).status,'YELLOW');
   // A price already at TP1 is an invalidated setup, not an out-of-zone wait.
   assert.equal(secondSignal1m({...x,ticker:{...x.ticker,lastPrice:x.watch.plan.tp1}}).status,'RED');
   assert.equal(secondSignal1m({...x,ticker:{...x.ticker,observedAtMs:x.nowMs-45_000}}).status,'YELLOW');
 }
});
test('An expired, disconnected or invalidated opportunity cannot be marked GREEN',()=>{
 const x=setupConfirmed('PULLBACK');
 assert.equal(secondSignal1m({...x,nowMs:x.watch.entryUntilMs}).status,'OFF');
 assert.equal(secondSignal1m({...x,watch:{...x.watch,state:'DATA_GAP',reason:'CANDLE_SEQUENCE_GAP'}}).status,'OFF');
 assert.equal(secondSignal1m({...x,watch:{...x.watch,state:'INVALIDATED',reason:'STOP_TOUCHED'}}).status,'RED');
 assert.equal(secondSignal1m({...x,watch:{...x.watch,state:'INVALIDATED',reason:'TARGET_TOUCHED'}}).status,'OFF');
});
test('Future candles cannot rewrite a previous traffic light assessment',()=>{
 const x=downBars(seed());descend(x.snapshot,'5m');descend(x.snapshot,'15m');
 const nowMs=T+2*M+1000,first=secondSignal1m({...x,nowMs});
 const future={endMs:T+3*M,open:4,high:4.5,low:2,close:3,volume:90000};
 x.snapshot.oneMinute.push(future);
 assert.deepEqual(secondSignal1m({...x,nowMs}),first);
});

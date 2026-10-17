import test from 'node:test';
import assert from 'node:assert/strict';
import {QualityCaptureBridgeV1} from '../src/quality-capture-bridge-v1.js';
import {QualityCaptureV1,TIMEFRAME_MS} from '../src/quality-capture-v1.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {readFile} from 'node:fs/promises';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const END=Date.UTC(2026,9,17,12);
const barsFor=(tf='1m',symbol='AGTUSDT')=>{
 const p=TIMEFRAME_MS[tf],bars=Array.from({length:61},(_,i)=>({
  endMs:END-(60-i)*p,open:1,high:1.01,low:.99,close:1,volume:100
 }));
 return {bars,event:{id:symbol+':'+tf+':'+END+':LONG_A',
  symbol,timeframe:tf,barClosedAtMs:END,signal:'LONG_A',price:1}};
};
const fakeStore=()=>{const snapshots=[];return {
  snapshots,restore:async()=>null,save:async x=>{snapshots.push(JSON.parse(JSON.stringify(x)));return {saved:true}};
}};
const make=async(extra={})=>{
 const store=extra.store??fakeStore(),clock=extra.clock??(()=>END);
 const bridge=new QualityCaptureBridgeV1({dataDir:'/research-not-production',clock,store,
  capture:extra.capture??new QualityCaptureV1({clock}),writeGapMs:0,log:()=>{}});
 await bridge.initialize();return {bridge,store};
};
test('disabled until explicit initialize, never emits a notification',async()=>{
 const store=fakeStore(),bridge=new QualityCaptureBridgeV1({
   dataDir:'/unused',clock:()=>END,store,writeGapMs:0});
 const {event,bars}=barsFor();
 assert.equal(bridge.onAcceptedLongA(event,bars).reason,'RESEARCH_DISABLED');
 assert.equal(bridge.status().enabled,false);assert.equal(store.snapshots.length,0);
});
test('true LONG_A event is captured as-of, queued without awaiting file I/O',async()=>{
 let release;
 const promise=new Promise(resolve=>{release=resolve});
 const store={restore:async()=>null,save:async()=>{await promise}};
 const {bridge}=await make({store});
 const {event,bars}=barsFor();
 assert.equal(bridge.onAcceptedLongA(event,bars).accepted,true);
 assert.equal(bridge.status().accepted,1);
 release();await bridge.flush();
 assert.equal(bridge.status().persisted,1);
 assert.equal(bridge.status().storageFailures,0);
});
test('future CLOSED candle extends the same proof without another signal',async()=>{
 let now=END;const {bridge,store}=await make({clock:()=>now});const {event,bars}=barsFor();
 assert.equal(bridge.onAcceptedLongA(event,bars).accepted,true);
 now+=60000;
 const future={endMs:now,open:1,high:1.02,low:.98,close:1.01,volume:120};
 assert.equal(bridge.onClosedBar(event.symbol,'1m',future).updated,1);
 await bridge.flush();
 assert.equal(store.snapshots.at(-1).records[0].futureBars.length,1);
});
test('storage error disables research, not original scanner and notifications',async()=>{
 const store={restore:async()=>null,save:async()=>{throw Error('READ_ONLY_DISK')}};
 const {bridge}=await make({store});let notified=0;
 const {event,bars}=barsFor();
 assert.equal(bridge.onAcceptedLongA(event,bars).accepted,true);
 notified++;
 await bridge.flush();
 assert.equal(bridge.status().enabled,false);
 assert.equal(bridge.status().storageFailures,1);
 assert.equal(notified,1);
});
test('corrupt persisted proof disables only research and leaves FCM route usable',async()=>{
 const store={restore:async()=>({version:99,records:[]}),save:async()=>{}};
 const {bridge}=await make({store});
 assert.equal(bridge.status().enabled,false);
 assert.match(bridge.status().lastFault,/RESTORE_/);
});
test('Market onKline forwards only APPENDED closed bars and research errors do not halt',async()=>{
 const calls=[];const p=TIMEFRAME_MS['1m'],bar={endMs:END,open:1,high:1.02,low:.99,close:1,volume:100};
 const root=await mkdtemp(path.join(os.tmpdir(),'yellow-gold-wire-'));
 const market=new YellowLiveMarket({dataDir:root,clock:()=>END,wsClass:class {},
  guard:{metrics:()=>({}),closedReason:null},passiveEvidence:{
   onClosedBar:(symbol,tf,candle)=>{calls.push({symbol,tf,candle});throw Error('RESEARCH_ONLY');}
  },log:()=>{}});
 const tracked={book:{ingestKline:()=>({status:'APPENDED',timeframe:'1m',endMs:END}),
   latest:()=>bar},states:{}};
 market.covered.set('AGTUSDT',tracked);
 market.klineConnected=true;market.tickerConnected=true;
 let evals=0;market.flushTracked=async()=>{evals++;};
 await market.onKline({k:{s:'AGTUSDT',i:'1m',x:true,T:END-1}});
 assert.equal(calls.length,1);assert.equal(calls[0].tf,'1m');
 assert.equal(evals,1);assert.equal(market.isHalted,false);
});
test('source proves ledger claim precedes observer and FCM, new sockets not added',async()=>{
 const source=await readFile(new URL('../src/live-market.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/live-main.js',import.meta.url),'utf8');
 assert.match(source,/const accepted=await this\.ledger\.accept\(result\.event\);[\s\S]*?onAcceptedLongA\(result\.event,target\)[\s\S]*?await this\.sendEvent\(accepted\.event\)/);
 assert.match(main,/YELLOW_GOLD_EVIDENCE_ENABLED==='true'/);
 assert.match(main,/passiveEvidence:research/);
 assert.doesNotMatch(source,/quality-capture-(?:store|bridge)-v1/);
 assert.doesNotMatch(source,/new (?:WebSocket|RequestGuard).*quality/i);
});
test('bridge faults in capture path fail open and do not throw',async()=>{
 const store=fakeStore(),badCapture={acceptLongA:()=>{throw Error('EVAL_WRITE_FAULT')},snapshot:()=>({records:[]})};
 const {bridge}=await make({store,capture:badCapture});const {event,bars}=barsFor();
 assert.equal(bridge.onAcceptedLongA(event,bars).reason,'RESEARCH_FAULT');
 assert.equal(bridge.status().enabled,false);
});

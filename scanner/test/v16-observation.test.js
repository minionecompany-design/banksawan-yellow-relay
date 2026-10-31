import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {V16ObservationStore,verifyObservation} from '../src/v16-observation-store.js';
import {V16ObservationEngine} from '../src/v16-observation-engine.js';
import {V16ObservationBridge} from '../src/v16-observation-bridge.js';
import {event,T,M,candle} from './fixtures/forward-shadow.mjs';
import {context} from './fixtures/entry-watch.mjs';
function setup(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v16-observe-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let now=T;const store=new V16ObservationStore({directory,clock:()=>now});const engine=new V16ObservationEngine({store,startedAtMs:T,provenance:'SYNTHETIC_QA'});return {directory,store,engine,apply(x){now=x.at;engine.apply(x);},rows(){return fs.readdirSync(directory).filter(n=>n.endsWith('.ndjson')).flatMap(n=>verifyObservation(fs.readFileSync(path.join(directory,n),'utf8')).rows);}};}
const start={type:'START',at:T+5000,event,snapshot:context(T)};
test('1M only, dedup and future/backfill rejected; immutable START with native signal candle',t=>{const q=setup(t);q.apply(start);q.apply(start);for(const timeframe of ['5m','15m','1h'])q.apply({...start,event:{...event,timeframe}});q.apply({...start,event:{...event,id:event.id.replace(String(T),String(T-M)),barClosedAtMs:T-M,detectedAtMs:T-M+5000}});assert.equal(q.rows().filter(r=>r.type==='START').length,1);assert.ok(q.rows().find(r=>r.type==='START').signalCandle);assert.equal(q.engine.active.size,1);q.engine.close();});
test('120 closed native candles yield observed MFE/MAE; no future quote or later six-hour price counted',t=>{const q=setup(t);q.apply(start);for(let i=1;i<=120;i++){for(let j=1;j<=4;j++){const at=T+(i-1)*M+j*15000;q.apply({type:'TICKER',symbol:event.symbol,ticker:{lastPrice:1,observedAtMs:at,exchangeAtMs:at-1},at});}const bar=candle(i,1,1.1,.9,1,100+i);q.apply({type:'BAR',symbol:event.symbol,bar,at:bar.endMs+1000});q.apply({type:'DECISION_BAR',symbol:event.symbol,bar,snapshot:context(bar.endMs,[bar]),at:bar.endMs+1000});}const f=q.rows().find(r=>r.type==='FINISH');assert.equal(f.outcome,'OBSERVED');assert.equal(f.bars,120);assert.ok(Math.abs(f.mfePct-10)<1e-8);assert.ok(Math.abs(f.maePct+10)<1e-8);q.apply({type:'TICKER',symbol:event.symbol,ticker:{lastPrice:2,observedAtMs:T+180*M,exchangeAtMs:T+180*M},at:T+180*M});assert.equal(q.rows().filter(r=>r.type==='FINISH').length,1);q.engine.close();});
test('missing candle, disconnect, stale quote => incomplete evidence, no reconstructed success',t=>{const q=setup(t);q.apply(start);q.apply({type:'BAR',symbol:event.symbol,bar:candle(2,1,1.01,.99,1),at:T+2*M+1000});q.apply({type:'GAP',reason:'WS_DISCONNECT',at:T+2*M+2000});q.apply({type:'TICKER',symbol:event.symbol,ticker:{lastPrice:7,observedAtMs:T+9*M,exchangeAtMs:T+9*M},at:T+2*M+3000});q.apply({type:'TICK',at:T+122*M});const rows=q.rows();assert.equal(rows.find(r=>r.type==='FINISH').outcome,'INCOMPLETE');assert.ok(rows.some(r=>r.type==='STATE'&&r.observationStatus==='OFF'));assert.equal(rows.filter(r=>r.type==='TICKER').length,0);q.engine.close();});
test('restart finalizes prior unfinished event once and never revives watch or duplicates event',t=>{const q=setup(t);q.apply(start);q.store.close();const second=new V16ObservationEngine({store:new V16ObservationStore({directory:q.directory,clock:()=>T+M}),startedAtMs:T+M,provenance:'SYNTHETIC_QA'});assert.equal(second.active.size,0);second.apply({...start,at:T+M});second.close();assert.equal(q.rows().filter(r=>r.type==='START').length,1);assert.equal(q.rows().filter(r=>r.type==='FINISH').length,1);assert.equal(q.rows().find(r=>r.type==='FINISH').reason,'PROCESS_RESTART');});
test('journal tamper, torn tail, lock and storage bound fail closed',t=>{const q=setup(t);assert.throws(()=>new V16ObservationStore({directory:q.directory}).open(),/EEXIST/);q.apply(start);const p=path.join(q.directory,fs.readdirSync(q.directory).find(n=>n.endsWith('.ndjson')));const raw=fs.readFileSync(p,'utf8');assert.throws(()=>verifyObservation(raw.slice(0,-1)),/TORN/);assert.throws(()=>verifyObservation(raw.replace('SESSION','SESSIOX')),/INTEGRITY/);q.store.maxBytes=q.store.bytes+1;assert.throws(()=>q.store.append({type:'TEST'}),/STORE_FULL/);q.store.close();});
test('bounded worker failure never throws or calls network/FCM',()=>{class FakeWorker extends EventEmitter{unref(){}postMessage(){}terminate(){return Promise.resolve();}}const b=new V16ObservationBridge({dataDir:'/tmp/unused',clock:()=>T,WorkerClass:FakeWorker});for(let i=0;i<300;i++)assert.doesNotThrow(()=>b.post({type:'TICK'}));assert.equal(b.enabled,false);assert.ok(b.pending<=256);b.close();});
test('AVOID latch and priority expiry recorded without threshold changes, no green or levels',t=>{const q=setup(t);q.apply(start);const r=q.engine.monitor.records.get(event.id);r.v3.state='INVALIDATED';r.v3.reason='STOP_TOUCHED';q.apply({type:'TICK',at:T+6000});r.v3.state='WATCHING';q.apply({type:'TICK',at:T+7000});const states=q.rows().filter(r=>r.type==='STATE');assert.equal(states.at(-1).status,'AVOID');assert.ok(states.every(s=>s.entryAllowed===false&&s.status!=='GREEN'));q.engine.close();});
test('retention deletes only verified old daily segments, keeps current evidence',t=>{const q=setup(t);q.apply(start);q.engine.close();const name=fs.readdirSync(q.directory).find(n=>n.endsWith('.ndjson'));const later=new V16ObservationStore({directory:q.directory,clock:()=>T+9*86400000});assert.equal(later.open().length,0);assert.equal(fs.existsSync(path.join(q.directory,name)),false);later.close();});
test('real worker batches durable transactions and shuts down without holding scanner thread',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v16-real-worker-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let now=T;const b=new V16ObservationBridge({dataDir:directory,clock:()=>now});
 t.after(()=>{clearInterval(b.timer);void b.worker.terminate();});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WORKER_READY_TIMEOUT')),5000);b.worker.on('message',m=>{if(m.ready){clearTimeout(timer);resolve();}});b.worker.once('error',reject);});
 now=T+5000;b.capture(event,context(T));
 const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WORKER_CLOSE_TIMEOUT')),5000);b.worker.on('message',m=>{if(m.closed){clearTimeout(timer);resolve();}if(m.failed){clearTimeout(timer);reject(Error('WORKER_FAILED'));}});});b.close();await done;
 const raw=fs.readdirSync(path.join(directory,'v16-forward')).filter(n=>n.endsWith('.ndjson')).map(n=>fs.readFileSync(path.join(directory,'v16-forward',n),'utf8')).join('');
 const rows=verifyObservation(raw).rows;assert.equal(rows.filter(r=>r.type==='START').length,1);assert.equal(rows.find(r=>r.type==='FINISH').reason,'SHUTDOWN');assert.equal(fs.existsSync(path.join(directory,'v16-forward','writer.lock')),false);
});
test('priority expiry is journaled independently of the unchanged six-hour LIVE monitor window',t=>{
 const q=setup(t);q.apply(start);const r=q.engine.monitor.records.get(event.id);r.priorityLatchedAtMs=T+5000;r.lastPriorityAtMs=T+5000;q.apply({type:'TICK',at:T+6000});assert.equal(q.rows().filter(x=>x.type==='STATE').at(-1).status,'PRIORITY');
 // Preserve native continuity without generating a replacement priority clue.
 r.lastClosedAtMs=T+5*M;r.v3.state='WATCHING';r.v4.state='WATCHING';q.apply({type:'TICK',at:T+5*M+6001});assert.equal(q.rows().filter(x=>x.type==='STATE').at(-1).status,'WAIT');q.engine.close();
});
test('10-second ticker buckets preserve every observed extreme and original timestamps without per-tick disk writes',t=>{
 const q=setup(t);q.apply(start);
 for(let i=0;i<9;i++){const at=T+6000+i*100;const price=i===3?1.5:i===6?.8:1;q.apply({type:'TICKER',symbol:event.symbol,ticker:{lastPrice:price,observedAtMs:at,exchangeAtMs:at-10},at});}
 q.engine.close();const bucket=q.rows().find(r=>r.type==='TICKER_BUCKET');assert.equal(bucket.count,9);assert.equal(bucket.high.price,1.5);assert.equal(bucket.high.observedAtMs,T+6300);assert.equal(bucket.low.price,.8);assert.equal(q.rows().filter(r=>r.type==='TICKER_BUCKET').length,1);
});
test('first partially pre-detection candle cannot invent post-LONG-A extrema; clock reversal fails only recorder',t=>{
 const q=setup(t);q.apply(start);q.apply({type:'BAR',symbol:event.symbol,bar:candle(1,1,8,.1,1.01),at:T+M+1000});
 const bar=q.rows().find(r=>r.type==='BAR');assert.equal(bar.extremaHighLowEligible,false);assert.ok(bar.mfePct<1.01);assert.equal(bar.maePct,0);
 assert.throws(()=>q.apply({type:'TICK',at:T}),/INVALID_RECEIVE_CLOCK/);q.engine.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {RequestGuard,CircuitOpen,RestPaused,klineWeight} from '../src/live-request-guard.js';
const file=async()=>path.join(await mkdtemp(path.join(os.tmpdir(),'yellow-guard-')),'latch.json');
function response(status,payload={},weight='2'){return {status,ok:status>=200&&status<300,headers:{get:()=>weight},json:async()=>payload};}
for(const status of [418,429,451]){
 test(`HTTP ${status} latches, persists across restart and sends no followup requests`,async()=>{
   const filename=await file();let count=0;
   const factory=()=>new RequestGuard({filename,fetchImpl:async()=>{count++;return response(status);},minGapMs:0});
   const first=factory();await first.restore();
   await assert.rejects(first.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),CircuitOpen);
   assert.equal(first.closedReason,'HTTP_'+status);assert.equal(count,1);
   const reboot=factory();await reboot.restore();
   await assert.rejects(reboot.getJson('https://fapi.binance.com/fapi/v1/klines?symbol=A'),CircuitOpen);
   assert.equal(count,1);
 });
}
test('rejects URLs outside official futures REST hostname, not even one request',async()=>{
 let count=0;const guard=new RequestGuard({filename:await file(),fetchImpl:async()=>{count++;return response(200)},minGapMs:0});
 await guard.restore();for(const url of ['https://fapi.binance.com.evil.test/fapi/v1/klines','http://fapi.binance.com/fapi/v1/klines',
  'https://fapi.binance.com/fapi/v2/future'])await assert.rejects(guard.getJson(url));
 assert.equal(count,0);
});
test('remote IP weight pauses all future REST for >=one full window, without hard latch',async()=>{
 let now=100_000,calls=0;
 const filename=await file();
 const guard=new RequestGuard({filename,clock:()=>now,sleep:async ms=>{now+=ms;},
   fetchImpl:async()=>{calls++;return response(200,{ok:true},calls===1?'451':'10');},minGapMs:0});
 await guard.restore();
 assert.deepEqual(await guard.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),{ok:true});
 assert.equal(calls,1);assert.equal(guard.closedReason,null);
 assert.equal(guard.isRemotePaused(),true);assert.equal(guard.canRequest(),false);
 assert.equal(guard.metrics().remoteLastObservedWeight,451);
 await assert.rejects(guard.getJson('https://fapi.binance.com/fapi/v1/klines'),RestPaused);
 assert.equal(calls,1,'no network requests during pause');
 now+=89_999;await assert.rejects(guard.getJson('https://fapi.binance.com/fapi/v1/klines'),RestPaused);
 assert.equal(calls,1);
 now++;assert.equal(guard.canRequest(),true);
 await guard.getJson('https://fapi.binance.com/fapi/v1/klines');
 assert.equal(calls,2);assert.equal(guard.metrics().remotePaused,false);
 await assert.rejects(readFile(filename),{code:'ENOENT'});
});

test('repeated high remote weight serially probes once per pause, never bursts',async()=>{
 let now=100_000,calls=0;
 const guard=new RequestGuard({filename:await file(),clock:()=>now,sleep:async ms=>{now+=ms;},
   fetchImpl:async()=>{calls++;return response(200,{ok:true},'999');},minGapMs:0});
 await guard.restore();
 for(let probe=0;probe<4;probe++){
   await guard.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo');
   assert.equal(calls,probe+1);
   const pending=Array.from({length:20},()=>guard.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo').catch(e=>e));
   for(const e of await Promise.all(pending))assert.ok(e instanceof RestPaused);
   assert.equal(calls,probe+1);
   now+=90_000;
 }
 assert.equal(guard.metrics().remotePauses,4);
 assert.equal(guard.closedReason,null);
});

test('real HTTP 418/429/451 wins over high reported IP weight and remains latched',async()=>{
 for(const status of [418,429,451]){
   let calls=0;
   const guard=new RequestGuard({filename:await file(),minGapMs:0,fetchImpl:async()=>{
     calls++;return response(status,{},'901');
   }});
   await guard.restore();
   await assert.rejects(guard.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),CircuitOpen);
   assert.equal(guard.closedReason,'HTTP_'+status);
   await assert.rejects(guard.getJson('https://fapi.binance.com/fapi/v1/klines'),CircuitOpen);
   assert.equal(calls,1);
 }
});

test('old persistent REMOTE_WEIGHT latch is never silently bypassed by scoped fix',async()=>{
 const filename=await file();const {writeFile}=await import('node:fs/promises');
 await writeFile(filename,JSON.stringify({reason:'REMOTE_WEIGHT_HEADROOM_LOW',atMs:100_000}));
 let calls=0;
 const guard=new RequestGuard({filename,minGapMs:0,fetchImpl:async()=>{calls++;return response(200);}});
 await guard.restore();
 assert.equal(guard.closedReason,'REMOTE_WEIGHT_HEADROOM_LOW');
 await assert.rejects(guard.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),CircuitOpen);
 assert.equal(calls,0);
});
test('budget avoids burst by waiting, and no retries on server failure',async()=>{
 let now=100000,calls=0;const sleep=async ms=>{now+=ms;};
 const guard=new RequestGuard({filename:await file(),clock:()=>now,sleep,minGapMs:0,weightPerMinute:2,
 fetchImpl:async()=>{calls++;return response(200,{calls});}});
 await guard.restore();await guard.getJson('https://fapi.binance.com/fapi/v1/klines',{weight:2});
 await guard.getJson('https://fapi.binance.com/fapi/v1/klines',{weight:2});
 assert.ok(now>=160000);assert.equal(calls,2);
 assert.equal(klineWeight(170),2);
});

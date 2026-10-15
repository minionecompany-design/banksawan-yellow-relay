import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {RequestGuard,CircuitOpen,klineWeight} from '../src/live-request-guard.js';
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
test('remote IP request-weight above safety ceiling stops and persists',async()=>{
 const filename=await file();const guard=new RequestGuard({filename,fetchImpl:async()=>response(200,{ok:true},'451'),minGapMs:0});
 await guard.restore();await assert.rejects(guard.getJson('https://fapi.binance.com/fapi/v1/exchangeInfo'),CircuitOpen);
 assert.equal(guard.closedReason,'REMOTE_WEIGHT_HEADROOM_LOW');
 assert.equal(JSON.parse(await readFile(filename)).reason,'REMOTE_WEIGHT_HEADROOM_LOW');
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

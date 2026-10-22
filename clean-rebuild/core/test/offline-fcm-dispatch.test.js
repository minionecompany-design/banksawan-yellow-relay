import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {OfflineDeliveryOutbox} from '../src/offline-delivery-outbox.js';
import {dispatchOne,retryDelayMs} from '../src/offline-fcm-dispatch.js';
const recipient='qa-installation-opaque-placeholder';
const e=(symbol='PLAYUSDT',time=60000)=>({id:symbol+':1m:'+time+':LONG_A',
 symbol,timeframe:'1m',barClosedAtMs:time,signal:'LONG_A',
 market:{symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',
 price:1,change24hPct:2,quoteVolume24h:20_000_000,
 quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H'}});
async function setup(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'fcm-dispatch-'));
 const file=path.join(dir,'outbox.json');
 const box=new OfflineDeliveryOutbox(file);await box.restore();
 await box.enqueue(e(),120000);return {box,file};
}
test('dispatch disabled by default, never invokes transport or claims an event',async()=>{
 const {box}=await setup();let count=0;
 const result=await dispatchOne({outbox:box,transport:{send:async()=>{count++;}},
  recipient,nowMs:120000});
 assert.equal(result.status,'DISABLED');assert.equal(count,0);
 assert.equal(box.snapshot()[0].state,'PENDING');
});
test('mock provider receipt ack only after exact per-event data-only identity',async()=>{
 const {box,file}=await setup();let observed=null;
 const transport={send:async msg=>{observed=msg;return {messageId:'projects/qa/messages/mock-1'};}};
 const result=await dispatchOne({outbox:box,transport,recipient,nowMs:120000,enabled:true});
 assert.equal(result.status,'PROVIDER_ACCEPTED');assert.equal(result.displayConfirmed,false);
 assert.equal(observed.recipient,recipient);
 assert.equal(observed.data.symbol,'PLAYUSDT');
 assert.equal(observed.data.tradingViewUrl,'https://www.tradingview.com/chart/?symbol=BINANCE%3APLAYUSDT.P');
 assert.equal(Object.values(observed.data).every(v=>typeof v==='string'),true);
 const restarted=new OfflineDeliveryOutbox(file);await restarted.restore();
 assert.equal(restarted.snapshot()[0].state,'SENT');
 assert.equal((await dispatchOne({outbox:restarted,transport,recipient,nowMs:130000,enabled:true})).status,'QUEUE_EMPTY');
});
test('transient provider failure schedules retry with a bounded delay',async()=>{
 const {box}=await setup();let calls=0;
 const transport={send:async()=>{calls++;if(calls===1)throw Object.assign(Error('retry'),{code:'UNAVAILABLE'});return {messageId:'mock-ack-2'};}};
 const first=await dispatchOne({outbox:box,transport,recipient,nowMs:120000,enabled:true});
 assert.equal(first.status,'RETRY_SCHEDULED');assert.equal(first.retryAfterMs,10000);
 assert.equal((await dispatchOne({outbox:box,transport,recipient,nowMs:129999,enabled:true})).status,'QUEUE_EMPTY');
 assert.equal((await dispatchOne({outbox:box,transport,recipient,nowMs:130000,enabled:true})).status,'PROVIDER_ACCEPTED');
 assert.equal(calls,2);
 assert.equal(retryDelayMs(3),40000);assert.equal(retryDelayMs(16),3600000);
});
test('invalid recipient is FAILED not falsely marked SENT and cannot be retried',async()=>{
 const {box,file}=await setup();
 const t={send:async()=>{throw Object.assign(Error('gone'),{code:'UNREGISTERED'});}};
 const result=await dispatchOne({outbox:box,transport:t,recipient,nowMs:120000,enabled:true});
 assert.equal(result.status,'FAILED');assert.equal(result.reason,'INVALID_RECIPIENT');
 const reloaded=new OfflineDeliveryOutbox(file);await reloaded.restore();
 assert.equal(reloaded.snapshot()[0].state,'FAILED');
 assert.equal(reloaded.snapshot()[0].receipt,null);
 assert.equal((await reloaded.claim(1_000_000)),null);
});
test('expired candle is never sent after outage recovery',async()=>{
 const {box}=await setup();let invoked=false;
 const result=await dispatchOne({outbox:box,transport:{send:async()=>{invoked=true;}},recipient,
  nowMs:8_000_000,enabled:true});
 assert.equal(result.reason,'EVENT_EXPIRED');assert.equal(invoked,false);
 assert.equal(box.snapshot()[0].state,'FAILED');
});
test('retry budget ends terminally without unbounded sending',async()=>{
 const {box}=await setup();
 const transport={send:async()=>{throw Error('failed');}};
 const one=await dispatchOne({outbox:box,transport,recipient,nowMs:120000,enabled:true,maxAttempts:2});
 assert.equal(one.status,'RETRY_SCHEDULED');
 const two=await dispatchOne({outbox:box,transport,recipient,nowMs:130000,enabled:true,maxAttempts:2});
 assert.equal(two.reason,'RETRIES_EXHAUSTED');
 assert.equal(box.snapshot()[0].state,'FAILED');
});

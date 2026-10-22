import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {OfflineDeliveryOutbox} from '../src/offline-delivery-outbox.js';
const market=s=>({symbol:s,quoteAsset:'USDT',contractType:'PERPETUAL',
 status:'TRADING',price:3,change24hPct:2,quoteVolume24h:20_000_001,
 quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H'});
const event=(s='PLAYUSDT',tf='1m',at=60000)=>({
 id:s+':'+tf+':'+at+':LONG_A',symbol:s,timeframe:tf,barClosedAtMs:at,
 signal:'LONG_A',market:market(s)});
async function make(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-outbox-'));
 return path.join(dir,'deliveries.json');
}
test('durable outbox claim/retry/ACK and restart suppress duplicate',async()=>{
 const file=await make(),a=new OfflineDeliveryOutbox(file);
 await a.restore();
 assert.equal(await a.enqueue(event(),100000),true);
 assert.equal(await a.enqueue(event(),100001),false);
 assert.equal((await a.claim(100000)).id,event().id);
 let first=a.snapshot()[0];
 assert.equal(first.state,'LEASED');
 assert.equal(await a.ack(first.id,'WRONG_TOKEN','receipt'),false);
 assert.equal(await a.retry(first.id,first.leaseToken,110000,1000),true);
 assert.equal(await a.claim(110999),null);
 const second=await a.claim(111000);
 assert.equal(second.attempts,2);
 assert.notEqual(second.leaseToken,first.leaseToken);
 assert.equal(await a.ack(second.id,first.leaseToken,'stale-receipt'),false);
 assert.equal(await a.ack(second.id,second.leaseToken,'fake-fcm-message-id'),true);
 const b=new OfflineDeliveryOutbox(file);await b.restore();
 assert.equal(await b.enqueue(event(),120000),false);
 assert.equal((await b.snapshot())[0].state,'SENT');
 assert.equal(await b.claim(120000),null);
 assert.equal((await readFile(file,'utf8')).includes('fake-fcm-message-id'),true);
});
test('leased item is reclaimable only after deadline across process restart',async()=>{
 const file=await make(),a=new OfflineDeliveryOutbox(file);await a.restore();
 await a.enqueue(event(),100000);
 const first=await a.claim(100000,5000);
 const b=new OfflineDeliveryOutbox(file);await b.restore();
 assert.equal(await b.claim(104999),null);
 const second=await b.claim(105000,5000);
 assert.equal(second.id,first.id);
 assert.notEqual(second.leaseToken,first.leaseToken);
 assert.equal(await b.ack(first.id,first.leaseToken,'late'),false);
 assert.equal(await b.ack(second.id,second.leaseToken,'test-id'),true);
});
test('different TF, symbol and candle are independent even if enqueued simultaneously',async()=>{
 const file=await make(),box=new OfflineDeliveryOutbox(file);await box.restore();
 const e=[event(),event('FOGOUSDT'),event('PLAYUSDT','5m',300000),
  event('PLAYUSDT','1m',120000)];
 assert.deepEqual(await Promise.all(e.map(x=>box.enqueue(x,100000))),[true,true,true,true]);
 assert.equal(box.snapshot().length,4);
 assert.equal(new Set(box.snapshot().map(x=>x.id)).size,4);
});
test('reject LONG B, low volume and forged id; do not persist rejected candidates',async()=>{
 const file=await make(),b=new OfflineDeliveryOutbox(file);await b.restore();
 await assert.rejects(b.enqueue({...event(),signal:'LONG_B'},100000),/INVALID_LONG_A_DELIVERY/);
 await assert.rejects(b.enqueue({...event(),market:{...market('PLAYUSDT'),quoteVolume24h:10000000}},100000),/INVALID_LONG_A_DELIVERY/);
 await assert.rejects(b.enqueue({...event(),id:'FOGOUSDT:1m:60000:LONG_A'},100000),/INVALID_LONG_A_DELIVERY/);
 assert.equal(b.snapshot().length,0);
});
test('corrupt durable state fails closed rather than resetting',async()=>{
 const file=await make();await writeFile(file,'not JSON');
 const b=new OfflineDeliveryOutbox(file);await assert.rejects(b.restore(),/CORRUPT_DELIVERY_OUTBOX/);
 await assert.rejects(b.enqueue(event(),100000),/OUTBOX_RESTORE_REQUIRED/);
});
test('lease and ACK remain unavailable before explicit journal restore',async()=>{
 const file=await make(),b=new OfflineDeliveryOutbox(file);
 await assert.rejects(b.claim(100000),/OUTBOX_RESTORE_REQUIRED/);
 await assert.rejects(b.ack(event().id,'t','r'),/OUTBOX_RESTORE_REQUIRED/);
});

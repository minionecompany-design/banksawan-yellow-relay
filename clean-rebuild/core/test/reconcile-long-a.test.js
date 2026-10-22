import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {EventJournal} from '../src/event-journal.js';
import {OfflineDeliveryOutbox} from '../src/offline-delivery-outbox.js';
import {reconcileAcceptedEvents} from '../src/reconcile-long-a.js';
const market=s=>({symbol:s,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',
 price:2,change24hPct:3,quoteVolume24h:20_000_001,quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H'});
const event=(s='PLAYUSDT',tf='1m',t=60000)=>({id:s+':'+tf+':'+t+':LONG_A',
 symbol:s,timeframe:tf,barClosedAtMs:t,signal:'LONG_A',market:market(s)});
test('crash after accepted journal before queue is recovered once on restart',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-repair-'));
 const acceptedFile=path.join(dir,'accepted.json'),queueFile=path.join(dir,'outbox.json');
 const journal=new EventJournal(acceptedFile);await journal.restore();
 await journal.accept(event());
 // Simulated power loss: no FCM queue entry was persisted.
 const restartedJournal=new EventJournal(acceptedFile);await restartedJournal.restore();
 const outbox=new OfflineDeliveryOutbox(queueFile);await outbox.restore();
 assert.deepEqual(await reconcileAcceptedEvents(restartedJournal,outbox,100000),
  {total:1,queued:1,duplicates:0});
 assert.deepEqual(await reconcileAcceptedEvents(restartedJournal,outbox,100001),
  {total:1,queued:0,duplicates:1});
 assert.equal(outbox.snapshot().length,1);
 const pending=await outbox.claim(100001);
 assert.equal(pending.symbol,'PLAYUSDT');
 assert.equal(pending.chartUrl,'https://www.tradingview.com/chart/?symbol=BINANCE%3APLAYUSDT.P');
 const newOutbox=new OfflineDeliveryOutbox(queueFile);await newOutbox.restore();
 assert.deepEqual(await reconcileAcceptedEvents(restartedJournal,newOutbox,100002),
  {total:1,queued:0,duplicates:1});
});
test('multiple independent symbols and TFs are all reconciled from journal',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-repair-all-'));
 const journal=new EventJournal(path.join(dir,'j.json'));await journal.restore();
 await journal.accept(event());
 await journal.accept(event('FOGOUSDT','5m',300000));
 const outbox=new OfflineDeliveryOutbox(path.join(dir,'o.json'));await outbox.restore();
 assert.deepEqual(await reconcileAcceptedEvents(journal,outbox,100000),
  {total:2,queued:2,duplicates:0});
 assert.deepEqual(outbox.snapshot().map(x=>x.symbol),['PLAYUSDT','FOGOUSDT']);
});
test('reconcile rejects a forged market row from persisted journal',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-repair-invalid-'));
 const journal=new EventJournal(path.join(dir,'j.json'));await journal.restore();
 await journal.accept({...event(),market:{...market('PLAYUSDT'),quoteVolume24h:10_000_000}});
 const outbox=new OfflineDeliveryOutbox(path.join(dir,'o.json'));await outbox.restore();
 await assert.rejects(reconcileAcceptedEvents(journal,outbox,100000),/INVALID_LONG_A_DELIVERY/);
 assert.equal(outbox.snapshot().length,0);
});
test('restoring outbox explicitly required before reconciliation',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-repair-not-ready-'));
 const journal=new EventJournal(path.join(dir,'j.json'));await journal.restore();
 const outbox=new OfflineDeliveryOutbox(path.join(dir,'o.json'));
 await assert.rejects(reconcileAcceptedEvents(journal,outbox,100000),/RECONCILE_NOT_READY/);
});

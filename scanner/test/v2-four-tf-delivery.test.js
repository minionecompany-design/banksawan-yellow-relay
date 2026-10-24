import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LiveHomeLedger} from '../src/live-home-ledger.js';
import {YellowFcm} from '../src/live-fcm.js';

test('4TF simultaneous PLAY/FOGO: durable claim, polling identity and data-only FCM stay independent across restart',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-v2-four-tf-'));
  try{
    const now=Date.UTC(2026,9,22,12),filename=path.join(dir,'home-ledger.json');
    const ledger=new LiveHomeLedger({filename,clock:()=>now+1000});await ledger.restore();
    const payloads=[];
    const fcm=new YellowFcm({enabled:true,clock:()=>now+1000,
      serviceAccountJson:JSON.stringify({project_id:'offline-yellow',client_email:'unused',private_key:'unused'}),
      fetchImpl:async(url,opts)=>{payloads.push(JSON.parse(opts.body));return {ok:true};}});
    // No Google calls: token acquisition has separate OAuth transport tests.
    fcm.token='offline-token';fcm.tokenExpiryMs=now+3_600_000;
    const events=['PLAYUSDT','FOGOUSDT'].flatMap(symbol=>['1m','5m','15m','1h'].map(timeframe=>({
      id:`${symbol}:${timeframe}:${now}:LONG_A`,signal:'LONG_A',symbol,timeframe,barClosedAtMs:now,
      price:.05,binance24hChangePct:2,quoteVolume24h:20_000_000
    })));
    const deliver=async event=>{const result=await ledger.accept(event);
      if(result.accepted)assert.equal((await fcm.send(result.event)).sent,true);
      return result;};
    const attempts=await Promise.all([...events,...events,...events].map(deliver));
    assert.equal(attempts.filter(x=>x.accepted).length,8);
    assert.equal(payloads.length,8);assert.equal(ledger.home().length,8);
    const poll=ledger.eventsSince(now);
    assert.deepEqual(new Set(poll.map(e=>e.id)),new Set(events.map(e=>e.id)));
    for(const {message} of payloads){
      assert.equal(message.topic,'banksawan-yellow-v2');assert.equal(message.notification,undefined);
      const d=message.data;
      assert.equal(d.event_id,`${d.symbol}:${d.timeframe}:${d.bar_closed_at_ms}:LONG_A`);
      assert.equal(d.quote_volume_24h,'20000000');
      assert.equal(message.android.ttl,'299s');
    }
    const restarted=new LiveHomeLedger({filename,clock:()=>now+2000});await restarted.restore();
    for(const event of events)assert.equal((await restarted.accept(event)).reason,'DUPLICATE');
    assert.equal(restarted.eventsSince(now).length,8);assert.equal(payloads.length,8);
    // The next bar is a new event even for the same symbol and timeframe.
    const next={...events[0],barClosedAtMs:now+60_000,id:`PLAYUSDT:1m:${now+60_000}:LONG_A`};
    const later=new LiveHomeLedger({filename,clock:()=>now+61_000});await later.restore();
    assert.equal((await later.accept(next)).accepted,true);
  }finally{await rm(dir,{recursive:true,force:true});}
});

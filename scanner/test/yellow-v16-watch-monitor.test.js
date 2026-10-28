import test from 'node:test';
import assert from 'node:assert/strict';
import {YellowV16WatchMonitor,V16_MONITOR_METHOD} from '../src/yellow-v16-watch-monitor.js';
import {event,T,M,candle} from './fixtures/forward-shadow.mjs';
import {context} from './fixtures/entry-watch.mjs';
const fresh=(now,price)=>({lastPrice:price,priceChangePercent:2,quoteVolume24h:20_000_000,
 observedAtMs:now,exchangeAtMs:now-10});
function setup(){let now=T+5_000;const m=new YellowV16WatchMonitor({clock:()=>now,maxRecords:4});
 assert.equal(m.capture(event,context(T)),true);
 const advance=(b)=>{now=b.endMs+1000;m.onClosedBar(event.symbol,'1m',b,context(b.endMs,[b]));};
 return {m,setNow:x=>{now=x},advance,get now(){return now}};
}
test('4 original LONG A TF untouched; only 1M watch record accepted, no GREEN or order levels',()=>{
 const q=setup();
 const item=q.m.view(event.id,fresh(q.now,1.01),q.now);
 assert.equal(item.method,V16_MONITOR_METHOD);
 assert.equal(item.status,'WAIT');
 assert.equal(item.entryAllowed,false);assert.equal(item.entryPrice,null);
 assert.equal(item.stopLoss,null);assert.equal(item.tp1,null);
 for(const tf of ['5m','15m','1h']){
   const e={...event,timeframe:tf,id:`${event.symbol}:${tf}:${T}:LONG_A`};
   assert.equal(q.m.capture(e,context(T)),false);
 }
 assert.equal(q.m.status().accepted,1);
 assert.equal(q.m.status().excluded,3);
 assert.equal(q.m.capture(event,context(T)),false);
 assert.equal(q.m.status().duplicate,1);
});
test('RED is latched and never flickers back to PANTAU on the same LONG A',()=>{
 const q=setup();
 q.advance(candle(1,1,1.002,.999,1.001));
 const r=q.m.records.get(event.id);
 r.v3.state='INVALIDATED';r.v3.reason='STOP_TOUCHED';
 let x=q.m.view(event.id,fresh(q.now,1),q.now);
 assert.equal(x.status,'AVOID');assert.equal(x.entryAllowed,false);
 r.v3.state='WATCHING';r.v3.reason='WAITING';
 x=q.m.view(event.id,fresh(q.now,1.02),q.now);
 assert.equal(x.status,'AVOID');
 assert.ok(x.riskAtMs>0);
});
test('priority is WATCH-ONLY and does not become entry or green',()=>{
 const q=setup(),r=q.m.records.get(event.id);
 q.advance(candle(1,1,1.002,.999,1.001));
 r.priorityLatchedAtMs=q.now;
 const x=q.m.view(event.id,fresh(q.now,1.2),q.now);
 assert.equal(x.status,'PRIORITY');assert.equal(x.priority,true);
 assert.equal(x.entryAllowed,false);
 assert.equal(x.priceChangeSinceAPct,20);
});
test('no future ticker, stale candle, missing minute or long expiration can show LIVE watch',()=>{
 const q=setup();
 assert.equal(q.m.view(event.id,fresh(q.now+1000,1.4),q.now).priceChangeSinceAPct,null);
 q.setNow(T+M+100_000);
 assert.equal(q.m.view(event.id,null,q.now).status,'OFF');
 const m=new YellowV16WatchMonitor({clock:()=>T+3*M+1000});
 assert.equal(m.capture(event,context(T)),true);
 m.onClosedBar(event.symbol,'1m',candle(3,1,1.01,.9,1),context(T+3*M));
 assert.equal(m.view(event.id,null,T+3*M+1000).status,'OFF');
 assert.equal(m.view(event.id,null,T+360*M+10).status,'OFF');
});
test('closed candle shared context maintains original scanner and no network dependency',()=>{
 const q=setup();
 q.advance(candle(1,1,1.005,.999,1.001));
 const r=q.m.records.get(event.id);
 assert.equal(r.lastClosedAtMs,T+M);
 assert.ok(q.m.status().candleUpdates>=1);
 const x=q.m.view(event.id,fresh(q.now,1.003),q.now);
 assert.ok(['WAIT','PRIORITY','AVOID','OFF'].includes(x.status));
 assert.equal(x.mode,'WATCH_ONLY');
 assert.equal(x.entryAllowed,false);
});
test('capacity and restart fail closed; original LONG A notifications unaffected',()=>{
 const m=new YellowV16WatchMonitor({clock:()=>T+5000,maxRecords:1});
 assert.equal(m.capture(event,context(T)),true);
 const e={...event,symbol:'PUSDT',id:`PUSDT:1m:${T}:LONG_A`};
 assert.equal(m.capture(e,context(T)),false);
 assert.equal(m.enabled,false);
 assert.equal(m.view(event.id,null),null);
 const restarted=new YellowV16WatchMonitor({clock:()=>T+5000});
 assert.equal(restarted.view(event.id,null),null);
});

test('WS recovery cancels old hypotheses, but genuinely NEW 1M LONG A remains monitorable',()=>{
 const q=setup();
 const old=q.m.view(event.id,null,q.now);
 assert.equal(old.status,'WAIT');
 q.m.resetContinuity('WS_DISCONNECTED');
 assert.equal(q.m.view(event.id,null,q.now),null);
 assert.equal(q.m.enabled,true);
 const nextTime=T+5*M;
 const e={...event,id:`${event.symbol}:1m:${nextTime}:LONG_A`,
  barClosedAtMs:nextTime,detectedAtMs:nextTime+3000};
 q.setNow(nextTime+3000);
 assert.equal(q.m.capture(e,context(nextTime)),true);
 assert.equal(q.m.view(e.id,null,q.now).status,'WAIT');
 assert.equal(q.m.status().resets,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {YellowLiveMarket} from '../src/live-market.js';
import {LiveHomeLedger} from '../src/live-home-ledger.js';
import {createLiveApi} from '../src/live-api.js';
const BASE=Date.UTC(2026,9,17,4),H=3600000;
class Socket {
 constructor(url){this.url=url;this.readyState=1;this.listeners=new Map();this.messages=[];}
 addEventListener(k,v){this.listeners.set(k,v);} emit(k,v){this.listeners.get(k)?.(v);}
 close(){this.readyState=3;} send(v){this.messages.push(JSON.parse(v));}
}
const dir=()=>mkdtemp(path.join(os.tmpdir(),'yellow-v10-'));
const symbol='AGTUSDT';
const event=(tf,end,s=symbol)=>({id:`${s}:${tf}:${end}:LONG_A`,symbol:s,timeframe:tf,barClosedAtMs:end,
 signal:'LONG_A',price:.04,binance24hChangePct:5,quoteVolume24h:20_000_000});
async function setup(){let now=BASE,rest=0;
 const market=new YellowLiveMarket({dataDir:await dir(),clock:()=>now,random:()=>0,wsClass:Socket,
  guard:{closedReason:null,metrics:()=>({circuitOpen:false}),getJson:async()=>{rest++;throw Error('UNEXPECTED_REST');}},log:()=>{}});
 market.isRunning=true;market.exchangeSymbols.set(symbol,{symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'});
 const open=()=>{market.tickerWs.emit('open');market.klineWs.emit('open');};
 const tick=(price='.04')=>market.tickerWs.emit('message',{data:JSON.stringify([{s:symbol,c:price,P:'5',q:'20000000',E:now,st:1}])});
 market.connectWebsockets();open();tick();
 return {market,open,tick,setNow:x=>now=x,rest:()=>rest};
}
test('same-symbol 5m, 1m, 1h two hours later and new 5m produce four independent HOME/FCM opportunities',async()=>{
 let now=BASE;const file=path.join(await dir(),'home.json');const l=new LiveHomeLedger({filename:file,clock:()=>now});await l.restore();
 const delivered=[];async function accept(e){const r=await l.accept(e);if(r.accepted)delivered.push(r.event.id);return r;}
 await accept(event('5m',now));now+=300000;await accept(event('1m',now));
 now=BASE+2*H;await accept(event('1h',now));now+=300000;await accept(event('5m',now));
 assert.equal(l.home().length,4);assert.equal(delivered.length,4);
 assert.equal((await accept(event('5m',now))).reason,'DUPLICATE');
 const restored=new LiveHomeLedger({filename:file,clock:()=>now});await restored.restore();
 assert.equal((await restored.accept(event('5m',now))).reason,'DUPLICATE');
 now=BASE+10*H;assert.equal(restored.home().length,3);
 assert.equal(restored.home().every(x=>x.homeExpiresMs===x.firstSeenMs+10*H),true);
 const anchors=restored.home().map(x=>x.homeExpiresMs);restored.home();assert.deepEqual(restored.home().map(x=>x.homeExpiresMs),anchors);
});
test('more than 20 independent events persist; non-LONG A never enters HOME',async()=>{
 let now=BASE;const l=new LiveHomeLedger({filename:path.join(await dir(),'home.json'),clock:()=>now});await l.restore();
 for(let i=0;i<35;i++){now++;assert.equal((await l.accept(event('1m',now))).accepted,true);}
 assert.equal(l.home().length,35);assert.equal(l.home()[0].barClosedAtMs,now);
 for(const signal of ['LONG_B','PROTECT','HOT','OUT_FINAL'])assert.equal((await l.accept({...event('1m',now),signal})).accepted,false);
});
test('legacy HOME without quote-volume proof stays hidden, without inventing proof',async()=>{
 const filename=path.join(await dir(),'home.json');
 await writeFile(filename,JSON.stringify({version:1,home:[{...event('5m',BASE),firstSeenMs:BASE,homeExpiresMs:BASE+H}],events:[],claimed:[]}));
 const l=new LiveHomeLedger({filename,clock:()=>BASE+1000});await l.restore();
 assert.equal(l.home().length,0,'volume-less historic event must not be revived');
});
test('recovery has bounded jitter/backoff, ignores retired sockets and performs zero unguarded REST',async()=>{
 const {market,open,tick,setNow,rest}=await setup();
 market.covered.set(symbol,{book:{},states:{}});const old=market.klineWs,oldTicker=market.tickerWs;
 old.emit('close',{code:1006,reason:'network'});assert.equal(market.wsRecovering,true);assert.equal(market.covered.size,0);
 const generation=market.feedGeneration;old.emit('error',{});oldTicker.emit('open');
 assert.equal(market.feedGeneration,generation);assert.equal(market.tickerConnected,false);
 setNow(BASE+4999);market.progressSocketRecovery();assert.equal(market.klineWs,null);
 setNow(BASE+5000);market.progressSocketRecovery();open();assert.equal(market.wsRecovering,true);
 tick();market.progressSocketRecovery();assert.equal(market.wsRecovering,false);
 assert.equal(market.covered.size,0);assert.equal(rest(),0);assert.equal(market.ledger.home().length,0);
 market.stop();
});
test('three unstable reconnect attempts end fail closed; duplicate close does not consume budget',async()=>{
 const {market,open,setNow}=await setup();let now=BASE;
 for(const delay of [5000,20000,60000]){const old=market.klineWs;old.emit('close',{});old.emit('error',{});
  now+=delay;setNow(now);market.progressSocketRecovery();open();}
 market.klineWs.emit('close',{});assert.equal(market.isHalted,true);
 assert.match(market.haltReason,/RECOVERY_EXHAUSTED/);assert.equal(market.wsReconnectAtMs,0);
});
test('reconnect without fresh market data times out and retries within its bound',async()=>{
 const {market,open,setNow}=await setup();market.klineWs.emit('close',{});
 setNow(BASE+5000);market.progressSocketRecovery();open();
 setNow(BASE+95000);market.progressSocketRecovery();assert.equal(market.wsRecoveryAttempts,2);assert.equal(market.wsRecovering,true);market.stop();
});
test('persistent HTTP 418/429/451 latch prevents any reconnect',async()=>{
 for(const status of [418,429,451]){const {market}=await setup();market.guard.closedReason='HTTP_'+status;
  market.onSocketClose('kline',{});assert.equal(market.isHalted,true);assert.equal(market.wsReconnectAtMs,0);}
});
test('ticker received via existing WS appears in API immediately; stale data returns 503',async()=>{
 const {market,tick,setNow,rest}=await setup();const server=createLiveApi(market);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${server.address().port}/api/universe`;
  setNow(BASE+1000);tick('.045');const start=performance.now();const response=await fetch(url);const body=await response.json();
  assert.equal(body.universe[0].price,.045);assert.equal(body.universe[0].tickerObservedAtMs,BASE+1000);
  assert.ok(performance.now()-start<10000);assert.equal(rest(),0);
  setNow(BASE+31000);assert.equal((await fetch(url)).status,503);
 }finally{await new Promise(r=>server.close(r));market.stop();}
});
test('delayed candle callback from old generation cannot enter recovered scanner',async()=>{
 const {market}=await setup();let lookedUp=0;
 market.covered={get(){lookedUp++;return null;}};
 await market.onKline({k:{x:true,T:BASE-1}},market.feedGeneration-1);
 assert.equal(lookedUp,0);market.stop();
});

test('all resubscriptions use one bounded message, and duplicate connect cannot create parallel sockets',async()=>{
 const {market}=await setup();const first=market.klineWs;
 market.connectWebsockets();assert.equal(market.klineWs,first);
 for(let i=0;i<24;i++)market.covered.set('COIN'+i+'USDT',{});
 market.subscribeAll();assert.equal(first.messages.length,1);assert.equal(first.messages[0].params.length,96);
 market.stop();
});

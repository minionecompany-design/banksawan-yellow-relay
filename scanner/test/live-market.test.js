import test from 'node:test';import assert from 'node:assert/strict';
import {YellowLiveMarket} from '../src/live-market.js';
import {createLiveApi} from '../src/live-api.js';
import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const END=Date.UTC(2026,9,15,12);
class FakeWebSocket {
 static OPEN=1;
 constructor(url){this.url=url;this.readyState=1;this.listeners=new Map();this.messages=[];}
 addEventListener(name,handler){this.listeners.set(name,handler);}
 send(x){this.messages.push(JSON.parse(x));}
 close(){this.readyState=3;}
 emit(name,payload){this.listeners.get(name)?.(payload);}
}
const config=async()=>({dataDir:await mkdtemp(path.join(os.tmpdir(),'yellow-live-')),
 clock:()=>END,wsClass:FakeWebSocket,guard:{closedReason:null,
  metrics:()=>({calls:0,weight:0,statusCounts:{},circuitOpen:false})},log:()=>{}});
const exchange=symbol=>({symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'});
test('live mode rejects merged COIN-M ticker data (st=2), accepts USD-M st=1 only',async()=>{
 const market=new YellowLiveMarket(await config());
 market.exchangeSymbols.set('WALUSDT',exchange('WALUSDT'));
 market.connectWebsockets();
 const ws=market.tickerWs;
 ws.emit('open');
 ws.emit('message',{data:JSON.stringify([{s:'WALUSDT',c:'0.05',q:'20000000',P:'10',E:END,st:2}])});
 assert.equal(market.universe().length,0);
 ws.emit('message',{data:JSON.stringify([{s:'WALUSDT',c:'0.05',q:'20000000',P:'5.5',E:END,st:1}])});
 assert.equal(market.universe().length,1);
 market.stop();
});
test('UNIVERSE includes all eligible but reports only covered subset',async()=>{
 const market=new YellowLiveMarket(await config());
 for(const [symbol,pct] of [['WALUSDT',3],['ARCUSDT',5],['NILUSDT',0],['SKDDUSDT',20]]){
  market.exchangeSymbols.set(symbol,exchange(symbol));
  market.recordTicker({symbol,source:'BINANCE_USDM_FUTURES',status:'TRADING',contractType:'PERPETUAL',
   quoteVolume:20_000_000,priceChangePercent:pct,lastPrice:symbol==='SKDDUSDT'?30:.05,observedAtMs:END});
 }
 market.covered.set('WALUSDT',{book:null});
 const list=market.universe();
 assert.deepEqual(list.map(x=>x.symbol),['ARCUSDT','WALUSDT']);
 assert.equal(list[0].coverage,'QUEUED');assert.equal(list[1].coverage,'SCANNING');
 assert.equal(market.status().covered,1);
});
test('socket failure pauses scanning and schedules bounded WS recovery',async()=>{
 const market=new YellowLiveMarket(await config());market.isRunning=true;
 market.connectWebsockets();market.tickerWs.emit('open');market.klineWs.emit('open');
 market.klineWs.emit('close');
 assert.equal(market.isHalted,false);assert.equal(market.wsRecovering,true);assert.equal(market.covered.size,0);market.stop();
});
test('GET API read-only, simulation=false, health liveness independent of readiness',async()=>{
 const market=new YellowLiveMarket(await config());await market.ledger.restore();market.isRunning=true;
 const server=createLiveApi(market);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  const h=await fetch(url+'/health/live');assert.equal(h.status,200);
  assert.equal((await fetch(url+'/api/universe')).status,503);
  market.tickerConnected=true;market.klineConnected=true;
  const universe=await (await fetch(url+'/api/universe')).json();
  assert.equal(universe.simulation,false);assert.equal(universe.coverage.maxTracked,200);
  const post=await fetch(url+'/api/universe',{method:'POST'});assert.equal(post.status,405);
  market.halt('TEST_HALT');const stop=await fetch(url+'/health');assert.equal(stop.status,503);
  const alive=await fetch(url+'/health/live');assert.equal(alive.status,200);
 }finally{await new Promise(r=>server.close(r));}
});

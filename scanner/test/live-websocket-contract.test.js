import test from 'node:test';
import assert from 'node:assert/strict';
import {YellowLiveMarket} from '../src/live-market.js';
import {mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const NOW=Date.UTC(2026,9,15,15);
class Socket {
  constructor(url){this.url=url;this.readyState=1;this.listeners=new Map();this.messages=[];}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  send(msg){this.messages.push(JSON.parse(msg));}
  emit(name,body){this.listeners.get(name)?.(body);}
  close(){this.readyState=3;}
}
const make=async()=>new YellowLiveMarket({dataDir:await mkdtemp(path.join(os.tmpdir(),'yellow-ws-')),
  clock:()=>NOW,wsClass:Socket,guard:{closedReason:null,metrics:()=>({})},log:()=>{}});
test('subscription uses official /market/stream and unwraps combined messages',async()=>{
  const market=await make();market.connectWebsockets();
  assert.equal(market.tickerWs.url,'wss://fstream.binance.com/market/ws/!ticker@arr');
  assert.equal(market.klineWs.url,'wss://fstream.binance.com/market/stream');
  const seen=[];market.onKline=async msg=>seen.push(msg);
  market.klineWs.emit('message',{data:JSON.stringify({stream:'walusdt@kline_15m',data:{e:'kline',s:'WALUSDT',k:{i:'15m'}}})});
  assert.equal(seen.length,1);assert.equal(seen[0].s,'WALUSDT');
  assert.equal(market.lastKlineDataAtMs,NOW);market.stop();
});
test('Binance subscription error shuts the scanner down without retries',async()=>{
  const market=await make();market.isRunning=true;market.connectWebsockets();
  market.klineWs.emit('message',{data:JSON.stringify({code:-1121,msg:'Invalid symbol'})});
  assert.equal(market.isHalted,true);
  assert.equal(market.haltReason,'BINANCE_KLINE_SUBSCRIPTION_REJECTED');
});
test('ticker stream requires USD-M symbol type even in merged markets',async()=>{
  const market=await make();market.exchangeSymbols.set('WALUSDT',{
    symbol:'WALUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'});
  market.connectWebsockets();market.tickerWs.emit('open');
  const before=market.lastTickerDataAtMs;
  market.tickerWs.emit('message',{data:JSON.stringify([{s:'WALUSDT',c:'0.05',q:'20000000',P:'5.5',E:NOW,st:2}])});
  assert.equal(market.universe().length,0);
  market.tickerWs.emit('message',{data:JSON.stringify([{s:'WALUSDT',c:'0.05',q:'20000000',P:'5.5',E:NOW,st:1}])});
  assert.equal(market.universe().length,1);assert.equal(market.lastTickerDataAtMs,before);
  market.stop();
});

test('Binance dynamic subscribe and unsubscribe IDs are unsigned integers and unique',async()=>{
  const market=await make();market.connectWebsockets();
  market.subscribe('WALUSDT');
  market.subscribe('ARCUSDT');
  market.unsubscribe('WALUSDT');
  const ids=market.klineWs.messages.map(m=>m.id);
  assert.deepEqual(ids,[1,2,3]);
  assert.ok(ids.every(n=>Number.isSafeInteger(n)&&n>=0));
  assert.ok(market.klineWs.messages[0].params.every(p=>p.startsWith('walusdt@kline_')));
  assert.equal(market.klineWs.messages[2].method,'UNSUBSCRIBE');
  market.stop();
});

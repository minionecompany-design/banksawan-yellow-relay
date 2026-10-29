import test from 'node:test';import assert from 'node:assert/strict';
import {YellowLiveMarket} from '../src/live-market.js';
import {createLiveApi} from '../src/live-api.js';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
const START=1_780_000_000_000;
class FakeWs{
 constructor(url){this.url=url;this.readyState=1;this.events=new Map();}
 addEventListener(k,v){this.events.set(k,v);}
 emit(k,v){this.events.get(k)?.(v);}
 send(){} close(){this.readyState=3;}
}
const sym=i=>'COIN'+i+'USDT';
const metadata=n=>({symbols:Array.from({length:n},(_,i)=>({
 symbol:sym(i),status:'TRADING',quoteAsset:'USDT',contractType:'PERPETUAL'}))});
const tickers=n=>Array.from({length:n},(_,i)=>({
 symbol:sym(i),priceChangePercent:'1.5',lastPrice:'0.05',quoteVolume:'15000000'}));
async function marketFor(n){
 let now=START;
 const market=new YellowLiveMarket({dataDir:await mkdtemp(path.join(os.tmpdir(),'yellow-reconcile-')),
  clock:()=>now,wsClass:FakeWs,guard:{closedReason:null,metrics:()=>({circuitOpen:false})},log:()=>{}});
 market.rest=async pathname=>pathname.includes('exchangeInfo')?metadata(n):tickers(n);
 await market.refreshUniverse();
 market.bootstrap=async s=>{market.covered.set(s,{startedAtMs:now});};
 market.isRunning=true;
 market.connectWebsockets();
 market.tickerWs.emit('open');market.klineWs.emit('open');
 return {market,at:t=>{now=START+t},now:()=>now};
}
test('complete startup from official REST all-market ticker, then bootstrap 47/47 without fixed-50 padding',async()=>{
 const {market}=await marketFor(47);
 try{
  assert.equal(market.universe().length,47);
  for(let i=0;i<47;i++)await market.bootstrapNextEligible(market.universe());
  const s=market.status();
  assert.equal(s.eligible,47);assert.equal(s.covered,47);
  assert.equal(s.allocatedScanSlots,47);
  assert.equal(s.coverageComplete,true);
  assert.equal(s.uncoveredEligible,0);
 }finally{market.stop();}
});
test('one stream q below 10M immediately removes only that symbol from eligible count; old allocated slot is NOT reported as an eligible scan',async()=>{
 const {market,at}=await marketFor(47);
 const server=createLiveApi(market);
 try{
  for(let i=0;i<47;i++)await market.bootstrapNextEligible(market.universe());
  const original=market.getTickerAsOf(sym(46),START);
  assert.equal(original.quoteVolume24h,15_000_000);
  at(1000);
  market.tickerWs.emit('message',{data:JSON.stringify([
    {s:sym(46),c:'0.05',P:'1.5',v:'900000000',q:'9999999',E:START+1000,st:1}
  ])});
  assert.equal(market.getTickerAsOf(sym(46),START).quoteVolume24h,15_000_000,'no past-ticker hindsight');
  assert.equal(market.getTickerAsOf(sym(46),START+1000).quoteVolume24h,9_999_999);
  assert.equal(market.universe().length,46);
  assert.equal(market.covered.size,47,'temporary subscription grace is not invisible');
  const status=market.status();
  assert.equal(status.covered,46);
  assert.equal(status.eligible,46);
  assert.equal(status.allocatedScanSlots,47);
  assert.equal(status.coverageRatio,1);
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const url='http://127.0.0.1:'+server.address().port;
  const response=await fetch(url+'/api/universe');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.coverage.covered,46);assert.equal(body.coverage.eligible,46);
  assert.equal(body.coverage.allocatedScanSlots,47);
  at(2000);
  // Coin-margined update must not change a USD-M ticker.
  market.tickerWs.emit('message',{data:JSON.stringify([
    {s:sym(46),c:'0.05',P:'2',q:'50000000',E:START+2000,st:2}
  ])});
  assert.equal(market.universe().length,46);
  at(3000);
  market.tickerWs.emit('message',{data:JSON.stringify([
    {s:sym(46),c:'0.05',P:'1.00',q:'20000000',E:START+3000,st:1}
  ])});
  assert.equal(market.universe().length,46,'exact +1% excluded');
  at(4000);
  market.tickerWs.emit('message',{data:JSON.stringify([
    {s:sym(46),c:'0.05',P:'1.01',q:'20000000',E:START+4000,st:1}
  ])});
  assert.equal(market.universe().length,47);
  assert.equal(market.status().covered,47);
 }finally{await new Promise(ok=>server.listening?server.close(ok):ok());market.stop();}
});
test('65 Binance eligible instruments remain in universe with truthfully capped 50/65 status',async()=>{
 const {market}=await marketFor(65);
 try{
  for(let i=0;i<65;i++)await market.bootstrapNextEligible(market.universe());
  const s=market.status();
  assert.equal(s.eligible,65);assert.equal(s.covered,50);
  assert.equal(s.allocatedScanSlots,50);
  assert.equal(s.coverageComplete,false);
  assert.equal(s.uncoveredEligible,15);
 }finally{market.stop();}
});

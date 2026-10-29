import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {YellowLiveMarket} from '../src/live-market.js';
import {PERIODS} from '../src/parallel-long-a.js';

const END=Date.UTC(2026,9,22,12),now=END+1000;
const symbols=n=>Array.from({length:n},(_,i)=>'COIN'+i+'USDT');
const metadata=list=>({symbols:list.map(symbol=>({symbol,quoteAsset:'USDT',
  status:'TRADING',contractType:'PERPETUAL'}))});
const ticks=list=>list.map(symbol=>({symbol,lastPrice:'0.05',
  priceChangePercent:'2',quoteVolume:'20000000'}));
function fixture(dataDir,list){
  const calls=[],sends=[],subscriptions=[];
  const guard={closedReason:null,metrics:()=>({circuitOpen:false}),getJson:async url=>{
    calls.push(url);const u=new URL(url);
    if(u.pathname.endsWith('exchangeInfo'))return metadata(list);
    if(u.pathname.endsWith('ticker/24hr'))return ticks(list);
    const period=PERIODS[u.searchParams.get('interval')];
    assert.ok(period,'only known four-timeframe kline requests');
    return Array.from({length:170},(_,i)=>{
      const end=END-(169-i)*period;
      return [end-period,'.05','.051','.049','.05','100',end-1,'5',10,'50','2.5'];
    });
  }};
  const market=new YellowLiveMarket({dataDir,clock:()=>now,guard,wsClass:class{},
    sendEvent:async e=>sends.push(e),log:()=>{}});
  market.klineWs={readyState:1,send:msg=>subscriptions.push(JSON.parse(msg)),close(){}};
  return {market,calls,sends,subscriptions};
}

for(const n of [47,65])test('real 4TF candle bootstrap and restart: '+Math.min(n,50)+'/'+n,async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-v2-real-bootstrap-'));
  try{
    const first=fixture(dir,symbols(n));await first.market.refreshUniverse();
    // Exercise production bootstrap, normalization, candle book and checkpoint I/O.
    for(let i=0;i<n;i++)await first.market.bootstrapNextEligible(first.market.universe());
    const count=Math.min(n,50),status=first.market.status();
    assert.equal(status.eligible,n);assert.equal(status.covered,count);
    assert.equal(status.allocatedScanSlots,count);
    assert.equal(first.calls.filter(x=>x.includes('/klines?')).length,count*4);
    assert.equal(first.subscriptions.length,count);
    assert.ok(first.subscriptions.every(x=>x.params.length===4));
    assert.equal(first.sends.length,0,'bootstrap never sends historical signals');
    const restarted=fixture(dir,symbols(n));await restarted.market.refreshUniverse();
    for(let i=0;i<n;i++)await restarted.market.bootstrapNextEligible(restarted.market.universe());
    assert.equal(restarted.market.status().covered,count);
    assert.equal(restarted.sends.length,0,'restart must not replay bootstrap candles');
    for(const tracked of restarted.market.covered.values()){
      assert.equal(tracked.resumedLanes.length,4);assert.deepEqual(tracked.coldLanes,[]);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('concurrent real bootstrap reserves slots before REST, never exceeds 50',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-v2-concurrent-cap-'));
  try{
    const {market,calls,subscriptions}=fixture(dir,symbols(65));
    await market.refreshUniverse();
    await Promise.all(symbols(65).map(s=>market.bootstrap(s)));
    assert.equal(market.covered.size,50);assert.equal(market.inProgress.size,0);
    assert.equal(calls.filter(x=>x.includes('/klines?')).length,200);
    assert.equal(subscriptions.length,50);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('metadata removal immediately removes fresh ticker, history and active subscription',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-v2-delisted-'));
  try{
    const {market}=fixture(dir,symbols(2));await market.refreshUniverse();
    await market.bootstrap('COIN0USDT');assert.equal(market.universe().length,2);
    market.nextExchangeRefresh=0;
    market.rest=async route=>route.includes('exchangeInfo')?metadata(['COIN1USDT']):ticks(['COIN1USDT']);
    await market.refreshUniverse();
    assert.deepEqual(market.universe().map(x=>x.symbol),['COIN1USDT']);
    assert.equal(market.covered.has('COIN0USDT'),false);
    assert.equal(market.tickers.has('COIN0USDT'),false);
    assert.equal(market.getTickerAsOf('COIN0USDT',now),null);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('obsolete exchangeInfo request cannot mutate a recovered feed generation',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-v2-generation-'));
  try{
    const {market}=fixture(dir,symbols(2));await market.refreshUniverse();
    market.nextExchangeRefresh=0;
    let release;
    market.rest=async route=>route.includes('exchangeInfo')?
      new Promise(resolve=>{release=resolve;}):ticks(symbols(2));
    const pending=market.refreshUniverse();market.feedGeneration++;
    release(metadata([]));await pending;
    assert.equal(market.exchangeSymbols.size,2);
    assert.equal(market.universe().length,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});

import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {universeSnapshot} from '../src/universe-contract.js';
import {createLiveApi} from '../src/live-api.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/v014/universe-valid.json',import.meta.url)));
const now=fixture.generatedAtMs;
function market(n=4){const m={clock:()=>now,isRunning:true,isHalted:false,wsRecovering:false,tickerConnected:true,klineConnected:true,
 lastTickerDataAtMs:now,exchangeSymbols:new Map(),tickers:new Map(),covered:new Map(),maxTracked:50};
 for(let i=0;i<n;i++){const symbol=`COIN${i}USDT`;m.exchangeSymbols.set(symbol,{symbol,contractType:'PERPETUAL',status:'TRADING',quoteAsset:'USDT',marginAsset:'USDT'});
 m.tickers.set(symbol,{symbol,source:'BINANCE_USDM_FUTURES',observedAtMs:now,lastPrice:2,priceChangePercent:1+i/10,quoteVolume:10000001});if(i<50)m.covered.set(symbol,{});}return m;}
test('uncapped 75 eligible versus 50 tracked; complete identity, quote and default descending order',()=>{
 const s=universeSnapshot(market(75));assert.equal(s.dataState,'OK');assert.equal(s.universe.length,75);assert.equal(s.coverage.covered,50);assert.equal(s.coverage.eligible,75);
 assert.ok(s.universe.every(x=>x.marginAsset==='USDT'&&x.quoteVolume24h>10000000));assert.equal(s.universe[0].symbol,'COIN74USDT');
});
test('all exact price/change/quote boundaries and active contract identity',()=>{
 for(const [field,value,expected] of [['lastPrice',0,0],['lastPrice',10,0],['lastPrice',9.999,1],['priceChangePercent',.99,0],['priceChangePercent',1,1],['quoteVolume',10000000,0],['quoteVolume',10000001,1]]){
 const m=market(1);m.tickers.get('COIN0USDT')[field]=value;assert.equal(universeSnapshot(m).universe.length,expected,`${field}=${value}`);}
 for(const [field,value] of [['contractType','CURRENT_QUARTER'],['status','SETTLING'],['marginAsset','USDC'],['quoteAsset','USDC']]){
 const m=market(1);m.exchangeSymbols.get('COIN0USDT')[field]=value;assert.equal(universeSnapshot(m).universe.length,0);}
});
test('missing quote/base-only/invalid and stale do not masquerade as zero eligible',()=>{
 for(const value of [undefined,NaN,Infinity,-1]){const m=market(1);m.tickers.get('COIN0USDT').quoteVolume=value;m.tickers.get('COIN0USDT').volume=999999999;
 const s=universeSnapshot(m);assert.equal(s.dataState,'DATA_UNAVAILABLE');assert.equal(s.coverage.eligible,null);}
 for(const delta of [30000,120000,-10001]){const m=market(1);m.tickers.get('COIN0USDT').observedAtMs=now-delta;assert.equal(universeSnapshot(m).dataState,'STALE');}
 const m=market(1);m.tickers.clear();assert.equal(universeSnapshot(m).reason,'MISSING_TICKER');
});
test('fresh genuine empty is distinguishable from unavailable and episode tracked may exceed eligible',()=>{
 const m=market(1);m.tickers.get('COIN0USDT').priceChangePercent=.99;
 const s=universeSnapshot(m);assert.equal(s.dataState,'OK');assert.equal(s.coverage.eligible,0);assert.equal(s.coverage.covered,1);
 m.tickerConnected=false;assert.equal(universeSnapshot(m).coverage.eligible,null);
});
test('actual HTTP route emits contract with zero external requests, including unavailable state',async t=>{
 const m=market(75);const server=createLiveApi(m);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const url=`http://127.0.0.1:${server.address().port}/api/universe`;
 let s=await(await fetch(url)).json();assert.equal(s.coverage.eligible,75);assert.equal(s.schemaVersion,'yellow-universe-v1');
 m.isHalted=true;s=await(await fetch(url)).json();assert.equal(s.dataState,'DATA_UNAVAILABLE');assert.equal(s.coverage.eligible,null);
});
test('deterministic v0.13 zero-row reproduction for legacy schema: missing quote, not symbol spelling',async()=>{
 const old=JSON.parse(await readFile(new URL('./fixtures/v014/legacy-b31412b.json',import.meta.url)));
 const v13=old.universe.filter(r=>Number.isFinite(r.quoteVolume24h)&&r.quoteVolume24h>10000000&&r.price>0&&r.price<10&&r.binance24hChangePct>=1);
 assert.equal(v13.length,0);assert.equal(old.coverage.eligible,376);assert.equal(old.coverage.covered,50);
 assert.ok(old.universe.every(r=>/^[A-Z0-9]{2,25}USDT$/.test(r.symbol)));
});
test('partial stale evidence retains valid rows with an explicit incomplete count',()=>{
 const m=market(3);m.tickers.get('COIN0USDT').observedAtMs=now-30000;
 const s=universeSnapshot(m);assert.equal(s.dataState,'PARTIAL');assert.equal(s.diagnostics.stale,1);assert.equal(s.coverage.eligible,2);assert.equal(s.universe.length,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeBinanceTicker} from '../src/binance-fixture-adapter.js';
import {eligibleUniverse,productEligible,SETTINGS} from '../src/long-a.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {TIMEFRAMES} from '../src/parallel-long-a.js';
const metadata=symbol=>({symbol,quoteAsset:'USDT',status:'TRADING',contractType:'PERPETUAL'});
const marketRow=(symbol,price=.5,percent=1.01,quoteVolume=10_000_000.01)=>({
 symbol,source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',
 lastPrice:price,priceChangePercent:percent,quoteVolume24h:quoteVolume,observedAtMs:1_700_000_000_000
});
test('owner strict boundaries are >1%, <10 USDT, >10M USDT; no rounded inclusive behavior',()=>{
 assert.equal(SETTINGS.minBinance24hChangePct,1);
 assert.equal(SETTINGS.minQuoteVolume24h,10_000_000);
 assert.equal(eligibleUniverse([marketRow('ABCUSDT')]).length,1);
 assert.equal(eligibleUniverse([marketRow('ABCUSDT',.5,1.0)]).length,0);
 assert.equal(eligibleUniverse([marketRow('ABCUSDT',10)]).length,0);
 assert.equal(eligibleUniverse([marketRow('ABCUSDT',.5,1.01,10_000_000)]).length,0);
 assert.equal(eligibleUniverse([marketRow('ABCUSDT',.5,1.01,null)]).length,0);
 assert.equal(productEligible({price:.5,binance24hChangePct:1.00001,quoteVolume24h:10_000_000.01}),true);
 assert.equal(productEligible({price:.5,binance24hChangePct:1,quoteVolume24h:10_000_000.01}),false);
});
test('strict active USD-M perpetual identity and honest all-eligible count',()=>{
 const rows=['AUSDT','BUSDT','CUSDT','DUSDT'].map((s,i)=>marketRow(s,.05,2+i));
 rows.push({...marketRow('EUSDT'),contractType:'CURRENT_QUARTER'});
 rows.push({...marketRow('FUSDT'),status:'BREAK'});
 rows.push({...marketRow('GUSDT'),quoteVolume24h:0});
 assert.deepEqual(eligibleUniverse(rows).map(x=>x.symbol),['DUSDT','CUSDT','BUSDT','AUSDT']);
});
test('REST quoteVolume, WS q numeric parsing; absent/invalid turnover cannot enter universe',()=>{
 const symbol='PLAYUSDT',e=metadata(symbol),t={symbol,lastPrice:'0.05',priceChangePercent:'2',quoteVolume:'12345678.99'};
 const rest=normalizeBinanceTicker({symbol,ticker:t,exchangeSymbol:e,observedAtMs:1_700_000_000_000});
 assert.equal(rest.quoteVolume24h,12_345_678.99);
 assert.equal(eligibleUniverse([rest]).length,1);
 const ws=normalizeBinanceTicker({symbol,ticker:{...t,quoteVolume:'25000000'},exchangeSymbol:e,observedAtMs:1_700_000_000_001});
 assert.equal(ws.quoteVolume24h,25_000_000);
 const missing=normalizeBinanceTicker({symbol,ticker:{symbol,lastPrice:'0.05',priceChangePercent:'2'},exchangeSymbol:e,observedAtMs:1_700_000_000_001});
 assert.equal(missing.quoteVolume24h,null);
 assert.equal(eligibleUniverse([missing]).length,0);
 assert.throws(()=>normalizeBinanceTicker({symbol,ticker:{...t,quoteVolume:'not-a-number'},exchangeSymbol:e,observedAtMs:1_700_000_000_001}),/TICKER_NUMBERS_INVALID/);
});
test('up to 50 eligible are all covered after guarded serial bootstrap; above 50 queue honestly',async()=>{
 const now=1_700_000_000_000;
 const market=new YellowLiveMarket({dataDir:'/tmp/yellow-offline-test-only',clock:()=>now,wsClass:class{},maxTracked:50,
   guard:{closedReason:null,isRemotePaused:()=>false,metrics:()=>({})},log:()=>{}});
 const all=Array.from({length:65},(_,i)=>({symbol:'COIN'+i+'USDT'}));
 market.bootstrap=async s=>{market.covered.set(s,{startedAtMs:now});};
 for(const N of [27,47,50]){
  market.covered.clear();
  for(let i=0;i<N;i++)await market.bootstrapNextEligible(all.slice(0,N));
  assert.equal(market.covered.size,N,'N='+N);
  assert.equal(market.status().maxTracked,50);
 }
 market.covered.clear();
 for(let i=0;i<65;i++)await market.bootstrapNextEligible(all);
 assert.equal(market.covered.size,50);
});
test('four independent 1m/5m/15m/1h lanes preserved',()=>{
 assert.deepEqual(TIMEFRAMES,['1m','5m','15m','1h']);
});
test('Android old UI and FCM topic retained; quote volume propagates and TV URL binds symbol',()=>{
 const main=readFileSync(new URL('../../android/app/src/main/java/id/banksawan/yellow/MainActivity.java',import.meta.url),'utf8');
 const notify=readFileSync(new URL('../../android/app/src/main/java/id/banksawan/yellow/YellowNotifier.java',import.meta.url),'utf8');
 const fcm=readFileSync(new URL('../../android/app/src/main/java/id/banksawan/yellow/YellowFirebaseService.java',import.meta.url),'utf8');
 const gradle=readFileSync(new URL('../../android/app/build.gradle',import.meta.url),'utf8');
 assert.ok(main.includes('BUKA TRADINGVIEW ↗'));
 assert.ok(main.includes('appendPath(symbol+".P")'));
 assert.ok(main.includes('appendQueryParameter("exchange","BINANCE")'));
 assert.ok(main.includes('setPackage("com.tradingview.tradingviewapp")'));
 assert.ok(main.includes('setOnLongClickListener'));
 assert.ok(main.includes('quoteVolume24h'));
 assert.ok(notify.includes('quoteVolume24h<=10_000_000.0'));
 assert.ok(fcm.includes('quote_volume_24h'));
 assert.ok(gradle.includes("applicationId 'id.banksawan.yellow'"));
 assert.ok(!main.includes('chart/?symbol='),'old ambiguous chart handler removed'); 
});

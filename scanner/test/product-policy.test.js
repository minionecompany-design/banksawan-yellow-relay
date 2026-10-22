import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {productEligible} from '../src/product-policy.js';
import {normalizeBinanceTicker} from '../src/binance-fixture-adapter.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {YellowFcm} from '../src/live-fcm.js';
const NOW=Date.UTC(2026,9,21,15),symbol='TESTUSDT';
const exchangeSymbol={symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'};
const raw={symbol,lastPrice:'2',priceChangePercent:'1.1',quoteVolume:'10000001',volume:'999999999'};
const normalize=ticker=>normalizeBinanceTicker({symbol,ticker,exchangeSymbol,observedAtMs:NOW});
class Socket {
 constructor(){this.handlers={};this.readyState=1;}
 addEventListener(k,f){this.handlers[k]=f;} send(){} close(){}
 emit(x){this.handlers.message({data:JSON.stringify([x])});}
}
async function market(){const m=new YellowLiveMarket({dataDir:await mkdtemp(path.join(os.tmpdir(),'yellow-policy-')),
 clock:()=>NOW,wsClass:Socket,alertTimeframes:['5m','15m','1h'],log:()=>{},
 guard:{closedReason:null,metrics:()=>({})}});m.exchangeSymbols.set(symbol,exchangeSymbol);await m.ledger.restore();return m;}
const event={id:`${symbol}:5m:${NOW}:LONG_A`,symbol,timeframe:'5m',signal:'LONG_A',
 barClosedAtMs:NOW,expiresAtMs:NOW+300000,price:2,binance24hChangePct:1.1,quoteVolume24h:10000001};
test('strict YELLOW boundaries: price <10, change >=+1%, quote turnover >10M',()=>{
 assert.equal(productEligible(9.999,1,10000000.01),true);
 for(const q of [undefined,null,NaN,Infinity,0,-1,9999999.99,10000000,'20000000'])assert.equal(productEligible(2,1.1,q),false);
 for(const p of [0,-1,10,30,Infinity,NaN])assert.equal(productEligible(p,1.1,20000000),false);
 for(const c of [-1,0,0.99,NaN,Infinity])assert.equal(productEligible(2,c,20000000),false);
 assert.equal(productEligible(2,1,20000000),true);
 assert.equal(productEligible(2,1.001,20000000),true);
});
test('REST uses quote turnover, never huge base volume as replacement',async()=>{
 const m=await market();
 m.recordTicker(normalize(raw));assert.equal(m.universe()[0].quoteVolume24h,10000001);
 for(const q of [undefined,null,'', 'bad','10000000']){
  m.recordTicker(normalize({...raw,quoteVolume:q}));assert.equal(m.universe().length,0);
 }
});
test('WS q feeds universe and missing/low q replaces previous eligible snapshot',async()=>{
 const m=await market();m.connectWebsockets();
 const msg={s:symbol,c:'2',P:'1.1',E:NOW,st:1,v:'999999999'};
 m.tickerWs.emit({...msg,q:'10000001'});assert.equal(m.universe().length,1);
 assert.equal(m.getTickerAsOf(symbol,NOW).quoteVolume,10000001);
 m.tickerWs.emit({...msg,q:'9999999'});assert.equal(m.universe().length,0);
 m.tickerWs.emit(msg);assert.equal(m.universe().length,0);m.stop();
});
test('historical signal lookup does not borrow future quote volume',async()=>{
 const m=await market();m.recordTicker({...normalize(raw),observedAtMs:NOW-1000,quoteVolume:9000000});
 m.recordTicker({...normalize(raw),observedAtMs:NOW+1000,quoteVolume:20000000});
 assert.equal(m.getTickerAsOf(symbol,NOW).quoteVolume,9000000);
 assert.equal(productEligible(2,1.1,m.getTickerAsOf(symbol,NOW).quoteVolume),false);
});
test('HOME ledger rejects unproven events and persists exact accepted volume',async()=>{
 const m=await market();
 for(const quoteVolume24h of [undefined,NaN,10000000])assert.equal((await m.ledger.accept({...event,quoteVolume24h})).accepted,false);
 assert.equal((await m.ledger.accept(event)).accepted,true);
 assert.equal(m.home()[0].quoteVolume24h,10000001);
 const saved=JSON.parse(await readFile(m.ledger.filename,'utf8'));assert.equal(saved.home[0].quoteVolume24h,10000001);
 const originalExpiry=saved.home[0].homeExpiresMs;
 await m.ledger.restore();assert.equal(m.home()[0].homeExpiresMs,originalExpiry);
});
test('legacy unproven HOME is hidden without fabricating volume or destroying history',async()=>{
 const m=await market();const old={...event,quoteVolume24h:undefined,firstSeenMs:NOW,homeExpiresMs:NOW+36000000};
 await writeFile(m.ledger.filename,JSON.stringify({version:1,home:[old],events:[old],claimed:[]}));
 await m.ledger.restore();assert.equal(m.home().length,0);assert.equal(m.events(0).length,0);
 assert.equal(m.ledger.doc.home.length,1);
});
test('FCM rejects below-boundary or missing volume before OAuth/network',async()=>{
 let calls=0;const f=new YellowFcm({enabled:true,clock:()=>NOW,
 serviceAccountJson:JSON.stringify({project_id:'test',client_email:'test',private_key:'unused'}),
 fetchImpl:async()=>{calls++;throw Error('UNEXPECTED_NETWORK');}});
 for(const quoteVolume24h of [undefined,NaN,10000000])assert.equal((await f.send({...event,quoteVolume24h})).sent,false);
 assert.equal(calls,0);
});

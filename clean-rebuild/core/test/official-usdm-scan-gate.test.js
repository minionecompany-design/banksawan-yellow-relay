import test from 'node:test';import assert from 'node:assert/strict';
import {OfficialUsdMScanGate} from '../src/official-usdm-scan-gate.js';
import {OfflineYellowScanner} from '../src/offline-scanner.js';
const base=1_800_000_000_000,source={
 venue:'BINANCE_GLOBAL_USDM',exchangeInfoPath:'/fapi/v1/exchangeInfo',
 ticker24hPath:'/fapi/v1/ticker/24hr'
};
const info=s=>({symbol:s,pair:s,quoteAsset:'USDT',status:'TRADING',contractType:'PERPETUAL'});
const ticker=(s,v='20000000')=>({symbol:s,lastPrice:'0.23',
 priceChangePercent:'2.5',quoteVolume:v,closeTime:base-2000});
const feed=(extra={})=>({source,accessAuthorized:true,receivedAtMs:base-1000,
 exchangeInfo:{symbols:[info('PLAYUSDT'),info('FOGOUSDT')]},
 ticker24h:[ticker('PLAYUSDT'),ticker('FOGOUSDT')],
 ...extra});
const make=()=>{let clock=base;
 const scanner=new OfflineYellowScanner({now:()=>clock});
 const gate=new OfficialUsdMScanGate({scanner,now:()=>clock});
 return {scanner,gate,setClock:n=>clock=n};
};
test('scanner can be admitted only through complete official USD-M feed',()=>{
 const {gate,scanner}=make();
 assert.equal(gate.snapshot().universe.dataState,'UNAVAILABLE');
 const accepted=gate.ingest(feed());
 assert.equal(accepted.dataState,'OK');assert.equal(accepted.eligible,2);
 assert.deepEqual(scanner.slots.symbols,['FOGOUSDT','PLAYUSDT']);
 const snapshot=gate.snapshot();
 assert.equal(snapshot.universe.coverage.eligible,2);
 assert.equal(snapshot.universe.coverage.covered,2);
 assert.equal(snapshot.home.count,0);
});
test('upstream outage revokes gate so old tracked slots cannot issue signals',async()=>{
 const {gate,scanner}=make();gate.ingest(feed());
 assert.equal(scanner.slots.symbols.length,2);
 const off=gate.ingest(feed({accessAuthorized:false}));
 assert.equal(off.reason,'SOURCE_UNAUTHORIZED');assert.equal(off.eligible,null);
 assert.equal(gate.snapshot().universe.coverage.eligible,null);
 assert.equal((await gate.process({symbol:'PLAYUSDT',timeframe:'1m',
  candle:{closed:true,closedAtMs:Math.floor(base/60000)*60000}})).status,'SOURCE_UNAVAILABLE');
});
test('stale feed cannot silently continue scanning from previous market snapshot',async()=>{
 const {gate,setClock}=make();gate.ingest(feed());
 setClock(base+90_001);
 const blocked=await gate.process({symbol:'PLAYUSDT',timeframe:'1m',
  candle:{closed:true,closedAtMs:Math.floor(base/60000)*60000}});
 assert.equal(blocked.status,'SOURCE_UNAVAILABLE');assert.equal(blocked.reason,'STALE');
 assert.equal(gate.snapshot().home.count,null);
});
test('legitimate zero eligible remains distinct from missing feed',()=>{
 const {gate}=make();const result=gate.ingest(feed({
 ticker24h:[ticker('PLAYUSDT','10000000'),ticker('FOGOUSDT','10000000')]
 }));
 assert.equal(result.dataState,'OK');assert.equal(result.eligible,0);
 assert.equal(gate.snapshot().universe.coverage.eligible,0);
 assert.equal(gate.snapshot().universe.coverage.covered,0);
});
test('caller cannot smuggle forbidden spot symbol or bypass canonical 24h policy',async()=>{
 const {gate}=make();gate.ingest(feed());
 const forbidden=await gate.process({symbol:'OTHERUSDT',timeframe:'1m',
  candle:{closed:true,closedAtMs:Math.floor(base/60000)*60000}});
 assert.equal(forbidden.status,'NOT_OFFICIAL_USDM_SYMBOL');
 const valid=await gate.process({symbol:'PLAYUSDT',timeframe:'1m',
  candle:{closed:true,closedAtMs:Math.floor(base/60000)*60000},
  market:{symbol:'PLAYUSDT',quoteVolume24h:0}});
 assert.equal(valid.status,'INSUFFICIENT_CONFIRMED_MTF');
});

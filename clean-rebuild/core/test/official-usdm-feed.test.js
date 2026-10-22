import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeOfficialUsdmSnapshot,OFFICIAL_USDM_PATHS} from '../src/official-usdm-feed.js';
import {TrackedSlots} from '../src/tracked-slots.js';
import {cleanApiSnapshot} from '../src/api-view.js';
const now=1_800_000_000_000;
const source={venue:'BINANCE_GLOBAL_USDM',exchangeInfoPath:OFFICIAL_USDM_PATHS.exchangeInfo,
 ticker24hPath:OFFICIAL_USDM_PATHS.ticker24h};
const info=(symbol,overrides={})=>({symbol,pair:symbol,quoteAsset:'USDT',
 contractType:'PERPETUAL',status:'TRADING',...overrides});
const tick=(symbol,{price='0.25',change='1.01',vol='10000000.01',close=now-2000}={})=>
 ({symbol,lastPrice:price,priceChangePercent:change,quoteVolume:vol,closeTime:close,
  volume:'1'});
const normalize=(symbols,tickers,extras={})=>normalizeOfficialUsdmSnapshot({
 exchangeInfo:{symbols},ticker24h:tickers,source,accessAuthorized:true,receivedAtMs:now-1000,nowMs:now,...extras});
test('official USD-M identity, exact quoteVolume, eligible filter and 50 cap',()=>{
 const metadata=[info('PLAYUSDT'),info('FOGOUSDT'),info('BTCUSDT',{status:'PENDING_TRADING'}),
  info('SPOTUSDT',{contractType:'SPOT'}),info('OTHERUSDT',{quoteAsset:'FDUSD'})];
 const payload=[tick('PLAYUSDT'),tick('FOGOUSDT',{vol:'10000000'}),tick('BTCUSDT'),
  tick('SPOTUSDT'),tick('OTHERUSDT')];
 const result=normalize(metadata,payload);
 assert.equal(result.dataState,'OK');assert.equal(result.verifiedSymbols,2);
 assert.equal(result.eligible,1);assert.equal(result.rows[0].quoteVolume24h,10_000_000.01);
 assert.equal(result.rows[0].quoteVolumeSource,'OFFICIAL_USDM_QUOTE_24H');
 assert.equal(result.rows[0].quoteVolume24h!==Number(payload[0].volume),true);
 const slots=new TrackedSlots();const selection=slots.update(result.rows);
 assert.deepEqual(selection.tracked,['PLAYUSDT']);
 const api=cleanApiSnapshot({rows:result.rows,trackedSymbols:selection.tracked,events:[],now});
 assert.equal(api.universe.coverage.eligible,1);assert.equal(api.universe.coverage.covered,1);
 assert.equal(api.universe.universe[0].symbol,'PLAYUSDT');
});
test('full universe can contain >50 eligible while only 50 scanned',()=>{
 const metadata=[],tickers=[];
 for(let i=100;i<178;i++){
  const symbol='C'+i+'USDT';metadata.push(info(symbol));
  tickers.push(tick(symbol,{price:'.12',change:String(i/10),vol:'12500000'}));
 }
 const normalized=normalize(metadata,tickers);
 assert.equal(normalized.dataState,'OK');assert.equal(normalized.eligible,78);
 const slots=new TrackedSlots(),tracked=slots.update(normalized.rows);
 assert.equal(tracked.tracked.length,50);assert.equal(tracked.eligible,78);
 const api=cleanApiSnapshot({rows:normalized.rows,trackedSymbols:tracked.tracked,events:[],now});
 assert.equal(api.universe.universe.length,78);
 assert.equal(api.universe.coverage.covered,50);
 assert.equal(api.universe.universe.filter(x=>x.tracked).length,50);
});
test('unverified legal access never masquerades as zero symbols',()=>{
 const res=normalize([info('PLAYUSDT')],[tick('PLAYUSDT')],{accessAuthorized:false});
 assert.equal(res.dataState,'UNAVAILABLE');assert.equal(res.reason,'SOURCE_UNAUTHORIZED');
 assert.equal(res.eligible,null);
});
test('forged source (spot, coin-m or proxy provenance) rejected',()=>{
 for(const wrong of [
  {...source,exchangeInfoPath:'/api/v3/exchangeInfo'},
  {...source,venue:'BINANCE_COINM'},
  {...source,ticker24hPath:'/dapi/v1/ticker/24hr'}
 ]){
  const res=normalize([info('PLAYUSDT')],[tick('PLAYUSDT')],{source:wrong});
  assert.equal(res.dataState,'UNAVAILABLE');assert.equal(res.eligible,null);
 }
});
test('partial, duplicate, malformed, stale snapshots all fail closed',()=>{
 const cases=[
  [[info('PLAYUSDT'),info('FOGOUSDT')],[tick('PLAYUSDT')],'INCOMPLETE_USDM_TICKER_COVERAGE'],
  [[info('PLAYUSDT'),info('PLAYUSDT')],[tick('PLAYUSDT')],'DUPLICATE_OR_MALFORMED_EXCHANGE_SYMBOL'],
  [[info('PLAYUSDT')],[tick('PLAYUSDT'),tick('PLAYUSDT')],'DUPLICATE_OR_MALFORMED_TICKER'],
  [[info('PLAYUSDT')],[tick('PLAYUSDT',{vol:'NaN'})],'MALFORMED_24H_TICKER'],
  [[info('PLAYUSDT')],[tick('PLAYUSDT',{vol:'10000001',close:now-500000})],'STALE_USDM_TICKER'],
  [[info('PLAYUSDT',{pair:'FOGOUSDT'})],[tick('PLAYUSDT')],'MISMATCHED_USDM_PAIR'],
 ];
 for(const [metadata,tickers,reason] of cases){
  const result=normalize(metadata,tickers);
  assert.equal(result.dataState,'UNAVAILABLE',reason);
  assert.equal(result.details,reason);
  assert.equal(result.eligible,null);
 }
 const expired=normalize([info('PLAYUSDT')],[tick('PLAYUSDT')],{receivedAtMs:now-180000});
 assert.equal(expired.reason,'STALE');assert.equal(expired.eligible,null);
});
test('numeric string values are required, incl 24-hour change boundary',()=>{
 const infoSet=[info('PLAYUSDT'),info('FOGOUSDT'),info('LOWUSDT'),info('TINYUSDT')];
 const ticks=[tick('PLAYUSDT',{price:'9.999',change:'1',vol:'10000001'}),
  tick('FOGOUSDT',{price:'10',change:'5',vol:'10000001'}),
  tick('LOWUSDT',{price:'0.5',change:'0.999',vol:'20000000'}),
  tick('TINYUSDT',{price:'0',change:'10',vol:'20000000'})];
 const result=normalize(infoSet,ticks);
 assert.equal(result.dataState,'OK');assert.equal(result.eligible,1);
 assert.equal(result.rows.length,4);
 const invalid=normalize([info('PLAYUSDT')],[{...tick('PLAYUSDT'),quoteVolume:10000001}]);
 assert.equal(invalid.dataState,'UNAVAILABLE');assert.equal(invalid.eligible,null);
});

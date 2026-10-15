import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBinanceKlines,normalizeBinanceTicker,normalizeRecordedBinanceBundle,verifyMultiTimeframeConsistency} from '../src/binance-fixture-adapter.js';
import {makeSyntheticParallelDataset} from '../src/synthetic-candles.js';
const END=Date.UTC(2026,9,15,12);
const span={oneMinute:60_000,fiveMinute:300_000,fifteenMinute:900_000,oneHour:3_600_000};
function kline(endMs,step=60_000){const start=endMs-step;return [start,'1','1.1','0.9','1.02','100',endMs-1,'105',15,'40','42','0'];}
const exchange={symbol:'TESTUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'};
const rawTicker={symbol:'TESTUSDT',lastPrice:'1.02',priceChangePercent:'1.8'};
test('Binance USD-M kline closeTime +1 maps precisely to completed candle end',()=>{
  const out=normalizeBinanceKlines([kline(END-60_000),kline(END)],'1m',{asOfMs:END});
  assert.deepEqual(out.map(x=>x.endMs),[END-60_000,END]);
  assert.equal(out[0].close,1.02);assert.equal(out[1].volume,100);
});
test('unfinished and future klines are rejected; scanner cannot pretend candle has closed',()=>{
  assert.throws(()=>normalizeBinanceKlines([kline(END)],'1m',{asOfMs:END-1}),/KLINE_NOT_YET_CLOSED/);
  assert.throws(()=>normalizeBinanceKlines([kline(END)],'1m',{}),/AS_OF_TIME_REQUIRED/);
});
test('gap/duplicate/order invalidates saved history',()=>{
  assert.throws(()=>normalizeBinanceKlines([kline(END-120_000),kline(END)],'1m',{asOfMs:END}),/KLINE_GAP_DUPLICATE_OR_ORDER/);
  assert.throws(()=>normalizeBinanceKlines([kline(END),kline(END)],'1m',{asOfMs:END}),/KLINE_GAP_DUPLICATE_OR_ORDER/);
});
test('invalid OHLCV and invalid kline close are fail closed',()=>{
  const wrong=kline(END);wrong[2]='1.0';
  assert.throws(()=>normalizeBinanceKlines([wrong],'1m',{asOfMs:END}),/KLINE_OHLCV_INVALID/);
  const wrongClock=kline(END);wrongClock[6]=END-2;
  assert.throws(()=>normalizeBinanceKlines([wrongClock],'1m',{asOfMs:END}),/KLINE_CLOSING_TIME_INVALID/);
});
test('exchangeInfo USDT perpetual proof and as-of ticker timestamp are mandatory',()=>{
  const t=normalizeBinanceTicker({symbol:'TESTUSDT',exchangeSymbol:exchange,ticker:rawTicker,observedAtMs:END});
  assert.equal(t.source,'BINANCE_USDM_FUTURES');assert.equal(t.priceChangePercent,1.8);
  assert.throws(()=>normalizeBinanceTicker({symbol:'TESTUSDT',exchangeSymbol:{...exchange,contractType:'CURRENT_QUARTER'},ticker:rawTicker,observedAtMs:END}),/NOT_ACTIVE/);
  assert.throws(()=>normalizeBinanceTicker({symbol:'TESTUSDT',exchangeSymbol:exchange,ticker:rawTicker}),/TIMESTAMP_REQUIRED/);
});
test('cross-TF saved closed candles must agree with underlying 1M',()=>{
  const d=makeSyntheticParallelDataset({size:7400});
  const result=verifyMultiTimeframeConsistency(d);
  assert.ok(result.matchedCompletedBuckets>100);
  const modified=structuredClone(d);modified.fifteenMinute.at(-2).close+=0.02;
  assert.throws(()=>verifyMultiTimeframeConsistency(modified),/MTF_fifteenMinute_CLOSE_MISMATCH/);
});
test('one minute missing in complete bucket is a health failure',()=>{
  const d=makeSyntheticParallelDataset({size:7400}); d.oneMinute.splice(300,1);
  assert.throws(()=>verifyMultiTimeframeConsistency(d),/ONE_MINUTE_GAP/);
});
test('recorded fixture requires explicit as-of Binance ticker snapshots (no hindsight)',()=>{
  const d=makeSyntheticParallelDataset({size:7400});
  const klines={};
  for(const [key,tf] of [['oneMinute','1m'],['fiveMinute','5m'],['fifteenMinute','15m'],['oneHour','1h']])
    klines[tf]=d[key].map(b=>{
      const period=span[key],parts=d.oneMinute.filter(m=>m.endMs>b.endMs-period&&m.endMs<=b.endMs);
      const open=parts[0]?.close??b.close,high=Math.max(...parts.map(x=>x.close)),low=Math.min(...parts.map(x=>x.close));
      const quote=parts.reduce((sum,x)=>sum+x.close*x.volume,0);
      return [b.endMs-period,open,high,low,b.close,b.volume,b.endMs-1,quote,5,0,0,'0'];
    });
  assert.throws(()=>normalizeRecordedBinanceBundle({symbol:'TESTUSDT',klines,exchangeSymbol:exchange,asOfMs:END}),/HISTORICAL_AS_OF_TICKER/);
  const result=normalizeRecordedBinanceBundle({symbol:'TESTUSDT',klines,exchangeSymbol:exchange,asOfMs:END,
    tickerSnapshots:[{observedAtMs:END,ticker:rawTicker}]});
  assert.equal(result.provenance.networkRequests,0);
  assert.equal(result.tickers.length,1);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeOfficialUsdmKlines} from '../src/official-usdm-klines.js';
import {FRAME_MS,validatedBars} from '../src/indicators.js';
const symbol='PLAYUSDT',allowedSymbols=new Set([symbol]),source={
 venue:'BINANCE_GLOBAL_USDM',klinesPath:'/fapi/v1/klines'
};
function bars(tf,{closed=114,forming=true}={}){
 const d=FRAME_MS[tf],now=1_800_000_000_000;
 const end=Math.floor(now/d)*d;
 const tuples=[];
 for(let i=closed;i>0;i--){
  const open=end-i*d;
  tuples.push([open,'0.25','0.26','0.24','0.25','100',open+d-1,
   '25',8,'40','10','0']);
 }
 if(forming)tuples.push([end,'0.25','0.26','0.24','0.25','200',end+d-1,
  '50',4,'20','5','0']);
 return {tuples,nowMs:end+Math.floor(d/2),closedEnd:end};
}
const parse=(tf,data,extras={})=>normalizeOfficialUsdmKlines({source,symbol,
 timeframe:tf,klines:data.tuples,allowedSymbols,accessAuthorized:true,
 nowMs:data.nowMs,...extras});
test('1m 5m 15m and 1h never pass unfinished candle into MTF evaluator',()=>{
 for(const tf of ['1m','5m','15m','1h']){
  const original=bars(tf);const result=parse(tf,original);
  assert.equal(result.dataState,'OK',tf);
  assert.equal(result.bars.length,114,tf);
  assert.equal(result.lastClosedAtMs,original.closedEnd);
  assert.equal(result.bars.at(-1).closed,true);
  assert.equal(result.bars.at(-1).closedAtMs,original.closedEnd);
  assert.equal(validatedBars(result.bars,tf,result.lastClosedAtMs),true);
  assert.equal(result.bars.some(x=>x.closedAtMs>original.nowMs),false);
 }
});
test('no candle gap, repeated timestamps, or invalid OHLCV accepted',()=>{
 const tf='1m';const d=FRAME_MS[tf];
 const variants=[
  x=>{x[10][0]+=d;x[10][6]+=d;},
  x=>{x[10]=[...x[9]];},
  x=>{x[4][2]='0.20';},
  x=>{x[4][5]='NaN';},
  x=>{x[4][6]+=10;},
 ];
 for(const fn of variants){
  const sample=bars(tf);fn(sample.tuples);
  const result=parse(tf,sample);
  assert.equal(result.dataState,'UNAVAILABLE');
  assert.equal(result.bars.length,0);
 }
});
test('short, ancient, spot and unauthorized inputs fail closed',()=>{
 const short=bars('1m',{closed:110});
 assert.equal(parse('1m',short).dataState,'UNAVAILABLE');
 const full=bars('1m');
 assert.equal(parse('1m',full,{accessAuthorized:false}).reason,'SOURCE_UNAUTHORIZED');
 assert.equal(parse('1m',full,{allowedSymbols:new Set(['FOGOUSDT'])}).dataState,'UNAVAILABLE');
 assert.equal(parse('1m',full,{source:{venue:'BINANCE_GLOBAL_USDM',klinesPath:'/api/v3/klines'}}).dataState,'UNAVAILABLE');
 assert.equal(parse('1m',full,{nowMs:full.nowMs+30*60_000}).reason,'STALE');
});
test('future open bar before final tuple is never treated as closed',()=>{
 const sample=bars('1m');
 const openTime=sample.tuples.at(-1)[0];
 sample.tuples.splice(sample.tuples.length-1,0,[openTime,'0.25','0.26','0.24','0.25','10',openTime+60000-1,
 '1',1,'1','1','0']);
 const result=parse('1m',sample);
 assert.equal(result.dataState,'UNAVAILABLE');
 assert.equal(result.detail,'EARLY_OPEN_KLINE_IN_HISTORY');
});

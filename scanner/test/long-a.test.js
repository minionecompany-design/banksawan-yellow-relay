import test from 'node:test';
import assert from 'node:assert/strict';
import {addToHome,getActiveHome,newSymbolState,stepLongA,
  eligibleUniverse,wilderRsiSeries} from '../src/long-a.js';
const MIN=60_000;
const END=Date.UTC(2026,9,15,10,37);
const previous=(end,span)=>Math.floor((end-1)/span)*span;
function candles(n,step,end=END,fn=(i)=>1.1) {
  return Array.from({length:n},(_,i)=>({endMs:end-(n-1-i)*step,
    close:fn(i),volume:100+(i%3)}));
}
function fixture() {
  return {oneMinute:candles(150,MIN),
    fiveMinute:candles(130,5*MIN,previous(END,5*MIN)),
    fifteenMinute:candles(120,15*MIN,previous(END,15*MIN)),
    oneHour:candles(120,60*MIN,previous(END,60*MIN)),
    ticker24h:{symbol:'TESTUSDT',lastPrice:'1.1',priceChangePercent:'2.3',
      contractType:'PERPETUAL',source:'BINANCE_USDM_FUTURES',quoteVolume24h:20_000_000,observedAtMs:END},
    nowMs:END+1};
}
test('incomplete data fails closed',()=>{
  const f=fixture(); f.oneHour=[];
  assert.equal(stepLongA('TESTUSDT',f).reason,'INSUFFICIENT_OR_GAPPED_CANDLES');
});
test('Pine previous closed MTF: future or current timeframe forbidden',()=>{
  const f=fixture();f.fiveMinute=f.fiveMinute.map(x=>({...x,endMs:x.endMs+5*MIN}));
  assert.equal(stepLongA('TESTUSDT',f).reason,'MTF_NOT_PREVIOUS_CONFIRMED_fiveMinute');
});
test('Pine previous confirmed MTF: stale also forbidden',()=>{
  const f=fixture();f.oneHour=f.oneHour.map(x=>({...x,endMs:x.endMs-60*MIN}));
  assert.equal(stepLongA('TESTUSDT',f).reason,'MTF_NOT_PREVIOUS_CONFIRMED_oneHour');
});
test('reject open/future 1m candle',()=>{
  const f=fixture();f.nowMs=END-1;
  assert.equal(stepLongA('TESTUSDT',f).reason,'OPEN_OR_FUTURE_1M_CANDLE');
});
test('reject ticker symbol mismatch',()=>{
  const f=fixture();f.ticker24h.symbol='OTHERUSDT';
  assert.equal(stepLongA('TESTUSDT',f).reason,'INVALID_BINANCE_USDM_24H_TICKER');
});
test('filter is exactly Binance 24h +1% and price <10',()=>{
  const f=fixture();f.ticker24h.priceChangePercent='0.99';
  assert.equal(stepLongA('TESTUSDT',f).diagnostics.eligible,false);
  f.ticker24h.priceChangePercent='1.00';
  assert.equal(stepLongA('TESTUSDT',f).diagnostics.eligible,false);
  f.ticker24h.priceChangePercent='1.01';
  assert.equal(stepLongA('TESTUSDT',f).diagnostics.eligible,true);
  f.ticker24h.lastPrice='10.000';
  assert.equal(stepLongA('TESTUSDT',f).diagnostics.eligible,false);
});
test('reject gap in 1m, and reject missing interval after valid first step',()=>{
  const f=fixture(); f.oneMinute[100].endMs+=MIN;
  assert.equal(stepLongA('TESTUSDT',f).reason,'INSUFFICIENT_OR_GAPPED_CANDLES');
  const valid=stepLongA('TESTUSDT',fixture());
  const skipped=fixture(); skipped.oneMinute=skipped.oneMinute.map(x=>({...x,endMs:x.endMs+2*MIN})); skipped.nowMs=END+2*MIN+1;
  assert.equal(stepLongA('TESTUSDT',skipped,valid.state).reason,'1M_DATA_GAP_REBOOTSTRAP_REQUIRED');
});
test('stale 24h ticker is rejected',()=>{
  const f=fixture();f.ticker24h.observedAtMs=END-300_000;
  assert.equal(stepLongA('TESTUSDT',f).reason,'STALE_BINANCE_TICKER');
});
test('RSI constant Wilder sequence initializes to 50',()=>{
  const values=wilderRsiSeries(Array(150).fill(1));
  assert.equal(values.at(-1),50);
});
test('state same-candle replay is idempotent',()=>{
  const f=fixture();const one=stepLongA('TESTUSDT',f,newSymbolState());
  assert.equal(stepLongA('TESTUSDT',f,one.state).reason,'ALREADY_PROCESSED');
});
test('HOME is independent 24h per symbol, no extension by duplicates',()=>{
  const t=1000;
  const a=addToHome([], {symbol:'WALUSDT',signal:'LONG_A',id:'a'},t);
  const b=addToHome(a,{symbol:'WALUSDT',signal:'LONG_A',id:'b'},t+800);
  const c=addToHome(b,{symbol:'ARCUSDT',signal:'LONG_A',id:'c'},t+600_000);
  assert.equal(c.length,2);
  assert.equal(c.find(x=>x.symbol==='WALUSDT').homeExpiresMs,t+86_400_000);
  assert.equal(getActiveHome(c,t+86_400_000).map(x=>x.symbol).join(','),'ARCUSDT');
  assert.equal(getActiveHome(c,t+86_400_000+600_000).length,0);
  assert.equal(addToHome(c,{symbol:'WALUSDT',signal:'LONG_A',id:'new'},t+86_400_001).length,2);
});
test('universe requires Binance USD-M eligible status, price<10 and +1%',()=>{
  const a=eligibleUniverse([
    {symbol:'WALUSDT',contractType:'PERPETUAL',status:'TRADING',lastPrice:'0.05',priceChangePercent:'5.5',quoteVolume24h:20_000_000},
    {symbol:'QUSDT',contractType:'PERPETUAL',status:'TRADING',lastPrice:'0.02',priceChangePercent:'1.01',quoteVolume24h:20_000_000},
    {symbol:'SKDDUSDT',contractType:'PERPETUAL',status:'TRADING',lastPrice:'11.8',priceChangePercent:'25'},
    {symbol:'ABCUSDT',contractType:'PERPETUAL',status:'TRADING',lastPrice:'0.2',priceChangePercent:'0.9'},
    {symbol:'ZZZUSDT',contractType:'CURRENT_QUARTER',status:'TRADING',lastPrice:'0.2',priceChangePercent:'6'}
  ]);
  assert.deepEqual(a.map(x=>x.symbol),['WALUSDT','QUSDT']);
  assert.equal(a[0].priority,'HIGH');
  assert.equal(a[1].priority,'STANDARD');
});
test('a fresh synthetic setup can produce LONG_A with all 4 timeframe gates (not market proof)',()=>{
  const f=fixture();
  f.oneMinute=candles(150,MIN,END,i=>1+i*0.00005+0.0005*Math.sin(i*0.3+5));
  f.fiveMinute=candles(130,5*MIN,previous(END,5*MIN),i=>1+i*0.0005);
  f.fifteenMinute=candles(120,15*MIN,previous(END,15*MIN),i=>1+i*0.0007);
  f.oneHour=candles(120,60*MIN,previous(END,60*MIN),i=>1+i*0.001);
  const state={...newSymbolState(),index:20,lastPullbackBar:19};
  const yes=stepLongA('TESTUSDT',f,state);
  assert.deepEqual([yes.diagnostics.onePass,yes.diagnostics.fivePass,
    yes.diagnostics.fifteenPass,yes.diagnostics.hourPass], [true,true,true,true]);
  assert.equal(yes.event.signal,'LONG_A');
  assert.equal(yes.event.priority,'STANDARD');
  f.ticker24h.priceChangePercent='5.00';
  assert.equal(stepLongA('TESTUSDT',f,state).event.priority,'HIGH');
  f.ticker24h.priceChangePercent='0.99';
  assert.equal(stepLongA('TESTUSDT',f,state).event,null);
  f.ticker24h.priceChangePercent='1.00';f.ticker24h.lastPrice='10.000';
  assert.equal(stepLongA('TESTUSDT',f,state).event,null);
});

test('reject unverified ticker source, contract type, or future value',()=>{
  const f=fixture();f.ticker24h.source='TRADINGVIEW';
  assert.equal(stepLongA('TESTUSDT',f).reason,'INVALID_BINANCE_USDM_24H_TICKER');
  f.ticker24h.source='BINANCE_USDM_FUTURES';f.ticker24h.contractType='CURRENT_QUARTER';
  assert.equal(stepLongA('TESTUSDT',f).reason,'INVALID_BINANCE_USDM_24H_TICKER');
  f.ticker24h.contractType='PERPETUAL';f.ticker24h.observedAtMs=END+6000;
  assert.equal(stepLongA('TESTUSDT',f).reason,'STALE_BINANCE_TICKER');
});

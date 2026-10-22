import test from 'node:test';import assert from 'node:assert/strict';
import {ClosedCandleLanes,FRAME_MS} from '../src/closed-candle-lanes.js';
const market={symbol:'PLAYUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',
 price:.2,change24hPct:1.5,quoteVolume24h:12_000_000,quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H'};
const input=(tf,end=FRAME_MS[tf])=>({symbol:'PLAYUSDT',timeframe:tf,candle:{closed:true,closedAtMs:end},market});
test('independent LONG A on all four completed timeframe bars',()=>{
 const lane=new ClosedCandleLanes({evaluate:()=>({ready:true,longA:true}),now:()=>9e12});
 for(const tf of Object.keys(FRAME_MS)){
  const first=lane.process(input(tf));
  assert.equal(first.status,'LONG_A',tf);
  assert.equal(first.event.id,`PLAYUSDT:${tf}:${FRAME_MS[tf]}:LONG_A`);
  assert.equal(lane.process(input(tf)).status,'ALREADY_PROCESSED');
 }
});
test('no signal with open, future, incomplete MTF, or volume at boundary',()=>{
 let ready=false;const lane=new ClosedCandleLanes({evaluate:()=>({ready,longA:true}),now:()=>120000});
 assert.equal(lane.process({...input('1m'),candle:{closedAtMs:60000,closed:false}}).status,'UNCONFIRMED_CANDLE');
 assert.equal(lane.process(input('1m')).status,'INSUFFICIENT_CONFIRMED_MTF');
 ready=true;
 assert.equal(lane.process({...input('1m'),market:{...market,quoteVolume24h:10_000_000}}).status,'PRODUCT_FILTER');
 assert.equal(lane.process(input('1m',120000)).status,'LONG_A');
 assert.equal(lane.process(input('1m',180000)).status,'UNCONFIRMED_CANDLE');
});
test('missing candle quarantines lane, without affecting other timeframes',()=>{
 const l=new ClosedCandleLanes({evaluate:()=>({ready:true,longA:true}),now:()=>9e12});
 l.process(input('1m'));
 assert.equal(l.process(input('1m',180000)).status,'GAP_REBOOTSTRAP_REQUIRED');
 assert.equal(l.process(input('1m',240000)).status,'GAP_REBOOTSTRAP_REQUIRED');
 assert.equal(l.process(input('5m')).status,'LONG_A');
 l.resetAfterVerifiedBootstrap('PLAYUSDT','1m',180000);
 assert.equal(l.process(input('1m',240000)).status,'LONG_A');
});
test('never publishes LONG B even if evaluator returns extra marker',()=>{
 const l=new ClosedCandleLanes({evaluate:()=>({ready:true,longA:false,longB:true}),now:()=>9e12});
 assert.equal(l.process(input('1m')).status,'NO_PATTERN');
});

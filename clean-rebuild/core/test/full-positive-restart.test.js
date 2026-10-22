import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OfflineYellowScanner} from '../src/offline-scanner.js';
import {FRAME_MS} from '../src/indicators.js';
const market={symbol:'PLAYUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',price:5,change24hPct:2,quoteVolume24h:20_000_000,quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H'};
const candleSet=(tf,end)=>{
 const prices=[];for(let i=0;i<160;i++)prices.push(4+i*.002);
 for(let i=0;i<14;i++)prices.push(prices.at(-1)-.003);
 for(let i=0;i<11;i++)prices.push(prices.at(-1)+.003);
 return prices.map((close,i)=>({closed:true,closedAtMs:end-(prices.length-1-i)*FRAME_MS[tf],close,volume:100+(i>prices.length-5?70:0)}));
};
test('independent per-TF raw histories can generate a real positive LONG A through scanner and journal across restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yellow-positive-replay-')),file=join(dir,'journal.json');
 const close=500*3_600_000+60_000;
 const histories={};
 for(const tf of Object.keys(FRAME_MS)){
  const end=tf==='1m'?close:Math.floor((close-1)/FRAME_MS[tf])*FRAME_MS[tf];
  histories[tf]=candleSet(tf,end);
 }
 const scanner=new OfflineYellowScanner({now:()=>close+60_000,journalPath:file});
 scanner.admit([market]);await scanner.restoreJournal();
 scanner.setHistory(market.symbol,histories);
 scanner.bootstrapLane(market.symbol,'1m',close-60000);
 const input={symbol:market.symbol,timeframe:'1m',candle:{closed:true,closedAtMs:close},market};
 const actual=await scanner.process(input);
 assert.equal(actual.status,'LONG_A',JSON.stringify(actual));
 assert.equal(scanner.emitted().length,1);
 const restarted=new OfflineYellowScanner({now:()=>close+60_000,journalPath:file});
 restarted.admit([market]);await restarted.restoreJournal();
 restarted.setHistory(market.symbol,histories);
 restarted.bootstrapLane(market.symbol,'1m',close-60000);
 assert.equal((await restarted.process(input)).status,'DUPLICATE_EVENT');
 assert.equal(restarted.emitted().length,1);
});

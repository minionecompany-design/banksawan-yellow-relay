import test from 'node:test';import assert from 'node:assert/strict';
import {OfflineYellowScanner} from '../src/offline-scanner.js';
import {FRAME_MS} from '../src/indicators.js';
const now=200*3_600_000;
const market=(symbol='PLAYUSDT',change24hPct=2)=>({symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',price:2,change24hPct,quoteVolume24h:20_000_000,quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H'});
const history=(tf,end,n=120)=>Array.from({length:n},(_,i)=>({closed:true,closedAtMs:end-(n-i-1)*FRAME_MS[tf],close:5+(i-n)*.0001,volume:100+i}));
test('50 slots reject nontracked symbols and wrong market identity',async()=>{
 const s=new OfflineYellowScanner({now:()=>now});
 const rows=Array.from({length:75},(_,i)=>market('COIN'+String(i).padStart(3,'0')+'USDT',i+1));
 const allocation=s.admit(rows);
 assert.equal(allocation.tracked.length,50);assert.equal(allocation.eligible,75);
 const closedAtMs=now-FRAME_MS['1m'];
 assert.equal((await s.process({symbol:'COIN000USDT',timeframe:'1m',candle:{closed:true,closedAtMs},market:rows[0]})).status,'SYMBOL_NOT_TRACKED');
 assert.equal((await s.process({symbol:allocation.tracked[0],timeframe:'1m',candle:{closed:true,closedAtMs},market:market('WRONGUSDT')})).status,'MISMATCHED_MARKET_SYMBOL');
 assert.equal(s.emitted().length,0);
});
test('no false event: rising history with no pullback, stale inputs fail closed',async()=>{
 const s=new OfflineYellowScanner({now:()=>now}),m=market();s.admit([m]);
 const end=now-FRAME_MS['1m'];
 const histories={};for(const tf of Object.keys(FRAME_MS)){
  const e=tf==='1m'?end:Math.floor((end-1)/FRAME_MS[tf])*FRAME_MS[tf];
  histories[tf]=history(tf,e);
 }
 s.setHistory('PLAYUSDT',histories);
 const result=await s.process({symbol:'PLAYUSDT',timeframe:'1m',candle:{closed:true,closedAtMs:end},market:m});
 assert.equal(result.status,'NO_PATTERN');assert.equal(s.emitted().length,0);
 assert.equal((await s.process({symbol:'PLAYUSDT',timeframe:'1m',candle:{closed:true,closedAtMs:end},market:m})).status,'ALREADY_PROCESSED');
});
test('candidate without source history cannot publish fabricated LONG A',async()=>{
 const s=new OfflineYellowScanner({now:()=>now}),m=market();s.admit([m]);
 assert.equal((await s.process({symbol:m.symbol,timeframe:'1m',candle:{closed:true,closedAtMs:now-60000},market:m})).status,'INSUFFICIENT_CONFIRMED_MTF');
 assert.equal(s.emitted().length,0);
});

test('durable journal must be restored before scanner use',async()=>{
 const {mkdtemp}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'yellow-core-'));
 const s=new OfflineYellowScanner({journalPath:join(dir,'events.json')});
 await assert.rejects(s.process({}),/JOURNAL_RESTORE_REQUIRED/);
 await s.restoreJournal();
 assert.equal((await s.process({symbol:'PLAYUSDT'})).status,'SYMBOL_NOT_TRACKED');
});

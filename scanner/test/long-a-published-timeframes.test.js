/** LONG_A alert-lane selector is a presentation/delivery policy, not a new
 * Binance or MTF data-plane. Research capture and original lane history remain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {YellowLiveMarket} from '../src/live-market.js';

const now=Date.UTC(2026,9,18,10);
const newMarket=async(alertTimeframes)=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'yellow-tf-alerts-'));
  const wsClass=class FakeWebSocket { static OPEN=1; };
  const market=new YellowLiveMarket({dataDir,clock:()=>now,wsClass,
    ...(alertTimeframes?{alertTimeframes}:{}),
    guard:{closedReason:null,metrics:()=>({calls:0,weight:0,statusCounts:{}})},
    log:()=>{}});
  await market.ledger.restore();
  return market;
};
const event=tf=>({id:'AGTUSDT:'+tf+':'+now+':LONG_A',symbol:'AGTUSDT',
  timeframe:tf,signal:'LONG_A',price:.08,barClosedAtMs:now,
  quoteVolume24h:20_000_000,binance24hChangePct:12,priority:'HIGH'});

test('5m/15m/1h alert-only setting removes historic 1m from HOME and polling without deleting ledger',async()=>{
 const m=await newMarket(['5m','15m','1h']);
 for(const tf of ['1m','5m','15m','1h']){
  assert.equal((await m.ledger.accept(event(tf))).accepted,true);
 }
 assert.deepEqual(m.home().map(x=>x.timeframe).sort(),['15m','1h','5m']);
 assert.deepEqual(m.events(0).map(x=>x.timeframe).sort(),['15m','1h','5m']);
 assert.equal(m.ledger.doc.home.length,4,'source history is preserved for audit');
 assert.equal(m.ledger.doc.claimed.length,4,'dedupe remains intact');
 assert.deepEqual(m.status().alertTimeframes,['5m','15m','1h']);
});
test('default remains four TF so unapproved configurations do not silently lose LONG_A',async()=>{
 const m=await newMarket();
 for(const tf of ['1m','5m','15m','1h'])await m.ledger.accept(event(tf));
 assert.equal(m.home().length,4);
 assert.deepEqual(m.status().alertTimeframes,['1m','5m','15m','1h']);
});
test('invalid selections fail before trading scanner starts',async()=>{
 for(const invalid of [[],['1m','1m'],['3m'],['5m','99h'],null]){
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'yellow-invalid-tf-'));
  assert.throws(()=>new YellowLiveMarket({dataDir,alertTimeframes:invalid,wsClass:class {}}),
    /INVALID_ALERT_TIMEFRAMES/);
 }
});
test('delivery gate executes before ledger.accept and sendEvent; evaluator remains all-four lanes',async()=>{
 const src=await readFile(new URL('../src/live-market.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/live-main.js',import.meta.url),'utf8');
 assert.match(src,/tracked\.states\[tf\]=result\.state;[\s\S]*?if\(result\.event\?\.signal==='LONG_A'\)[\s\S]*?if\(!this\.alertTimeframes\.has\(tf\)\)[\s\S]*?continue;[\s\S]*?const accepted=await this\.ledger\.accept\(result\.event\);/);
 assert.match(src,/const frames=\['1m','5m','15m','1h'\]/);
 assert.match(src,/await this\.sendEvent\(accepted\.event\)/);
 assert.match(main,/const alertTimeframes=\['1m','5m','15m','1h'\]/);
 assert.doesNotMatch(main,/filter\(tf=>tf && tf!=='1m'\)/);
 assert.doesNotMatch(main,/YELLOW_ALERT_TIMEFRAMES.*YELLOW_MAX_TRACKED/);
});

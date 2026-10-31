/** ARCHIVED CANDLE REPLAY ONLY: receipt times and historical quotes unavailable. */
import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {V16ObservationEngine} from '../src/v16-observation-engine.js';
const manifestPath=process.argv[2]??'docs/evidence/entry-v3-20261028/manifest.json';
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),results=[];
for(const item of manifest.cases){
 const e=item.event;if(e.timeframe!=='1m')continue;
 const filename=path.resolve(path.dirname(manifestPath),item.candlesFile);
 const compressed=fs.readFileSync(filename);const raw=filename.endsWith('.gz')?gunzipSync(compressed):compressed;
 if(createHash('sha256').update(raw).digest('hex')!==item.candlesSha256)throw Error('ARCHIVE_HASH_MISMATCH');
 const source=JSON.parse(raw);if(source.symbol!==e.symbol)throw Error('SYMBOL_MISMATCH');
 const rows=[],store={open:()=>[],append:r=>{rows.push(structuredClone(r));},close:()=>{}};
 const engine=new V16ObservationEngine({store,startedAtMs:e.barClosedAtMs,provenance:'HISTORICAL_CANDLE_REPLAY'});
 const asOf=end=>Object.fromEntries(Object.entries(source.candles).map(([k,v])=>[k,v.filter(b=>b.endMs<=end)]));
 engine.apply({type:'START',event:e,snapshot:asOf(e.barClosedAtMs),at:e.detectedAtMs});
 for(const bar of source.candles.oneMinute.filter(b=>b.endMs>e.barClosedAtMs&&b.endMs<=e.barClosedAtMs+120*60000)){
  const at=Math.max(bar.endMs+1000,e.detectedAtMs);
  engine.apply({type:'BAR',symbol:e.symbol,bar,at});engine.apply({type:'DECISION_BAR',symbol:e.symbol,bar,snapshot:asOf(bar.endMs),at});
 }
 engine.apply({type:'TICK',at:e.barClosedAtMs+122*60000});
 const finish=rows.find(r=>r.type==='FINISH');
 results.push({event:e,archiveSha256:item.candlesSha256,finish:finish??null,
  transitions:rows.filter(r=>r.type==='STATE'),clues:rows.filter(r=>r.type==='CLUE'),
  quoteCoverage:'UNAVAILABLE',latency:'SIMULATED_CLOSE_PLUS_1S_NOT_HISTORICAL_RECEIPT',
  canAssessActualV16LiveDecisions:false});
}
console.log(JSON.stringify({provenance:'HISTORICAL_CANDLE_REPLAY',cases:results.length,prospectiveEvents:0,
 noThresholdChanges:true,canClaimWinRate:false,results},null,2));

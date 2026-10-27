#!/usr/bin/env node
/** Local saved inputs only; no network, LIVE hooks, quotes, orders or FCM. */
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {replayEntryComparison,CANDIDATE_METHOD} from './lib/entry-candidate-v2.mjs';
const [manifestPath]=process.argv.slice(2);
if(!manifestPath)throw Error('Usage: compare-entry-candidate.mjs saved-case-manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(!Array.isArray(manifest.cases)||manifest.cases.length>500)throw Error('INVALID_CASE_MANIFEST');
const results=[],identities=new Set();
for(const item of manifest.cases){
  if(identities.has(item.event?.id))throw Error('DUPLICATE_CASE');identities.add(item.event?.id);
  const bytes=await readFile(resolve(dirname(manifestPath),item.candlesFile));
  const raw=item.candlesFile.endsWith('.gz')?gunzipSync(bytes):bytes;
  const sha256=createHash('sha256').update(raw).digest('hex');
  if(sha256!==item.candlesSha256)throw Error('CANDLE_HASH_MISMATCH');
  results.push({...replayEntryComparison(JSON.parse(raw),item.event),candlesSha256:sha256});
}
const summary={cases:results.length,missingCases:manifest.missingCases??[],methods:{}};
for(const method of ['baseline','candidate']){
  const rows=results.map(r=>r[method]),counts={};
  for(const r of rows){const key=r.paper?.status??r.entryStatus;counts[key]=(counts[key]||0)+1;}
  summary.methods[method]={counts,confirmations:rows.filter(r=>r.confirmation).length,
    uniqueConfirmationMoments:new Set(results.filter(r=>r[method].confirmation).map(r=>r.event.symbol+':'+r[method].confirmation.confirmedBarEndMs)).size,
    completedWatchWindows:results.filter(r=>r.watchComplete).length,paperCensored:rows.filter(r=>r.paperCensored).length};
}
console.log(JSON.stringify({mode:'OFFLINE_CANDIDATE_COMPARISON',method:CANDIDATE_METHOD,
  productionEnabled:false,limitations:['AIN_IS_A_KNOWN_CASE_NOT_OUT_OF_SAMPLE','RETAINED_COVERAGE_SAMPLE_NOT_UNIVERSE_BACKTEST',
    'NATIVE_HTF_ASSUMED_AVAILABLE_AT_CLOSE','NO_HISTORICAL_TICKER_ELIGIBILITY_OR_GREEN_QUOTES',
    'PAPER_NEXT_FULL_MINUTE_OPEN_14BPS_ASSUMED_COST','CENSORED_WINDOWS_ARE_NOT_COMPLETED_NEGATIVES',
    'OVERLAPPING_SIGNALS_ARE_CORRELATED_NOT_INDEPENDENT_TRADES'],summary,results},null,2));

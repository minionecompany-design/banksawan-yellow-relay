#!/usr/bin/env node
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {resolve,dirname} from 'node:path';
import {replayReadinessComparison} from './lib/replay-readiness-v3.mjs';
const [file]=process.argv.slice(2);if(!file)throw Error('Usage: compare-readiness-v3.mjs saved-manifest.json');
const manifest=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(manifest.cases)||manifest.cases.length>500)throw Error('INVALID_MANIFEST');
const results=[],ids=new Set();
for(const c of manifest.cases){
  if(ids.has(c.event.id))throw Error('DUPLICATE_EVENT');ids.add(c.event.id);
  const bytes=await readFile(resolve(dirname(file),c.candlesFile)),raw=c.candlesFile.endsWith('.gz')?gunzipSync(bytes):bytes;
  const hash=createHash('sha256').update(raw).digest('hex');if(hash!==c.candlesSha256)throw Error('CANDLE_HASH_MISMATCH');
  results.push({...replayReadinessComparison(JSON.parse(raw),c.event),candlesSha256:hash});
}
const methods={};for(const key of ['baseline','candidate']){
  const counts={},confirmed=results.filter(r=>r[key].confirmation);
  for(const r of results){const o=r[key].observation;counts[o]=(counts[o]??0)+1;}
  const exits=results.map(r=>r[key].paper).filter(p=>p&&['TP1_BEFORE_SL','SL_BEFORE_TP1','TIMEOUT'].includes(p.status));
  methods[key]={counts,candleConfirmations:confirmed.length,
    uniqueConfirmationMoments:new Set(confirmed.map(r=>r.event.symbol+':'+r[key].confirmation.atMs)).size,
    paths:confirmed.reduce((s,r)=>{const p=r[key].confirmation.path??'V1';s[p]=(s[p]??0)+1;return s;},{}),
    pricedPaperExits:exits.length,meanPaperNetReturnPct:exits.length?exits.reduce((s,p)=>s+p.netReturnPct,0)/exits.length:null,
    paperCensored:results.filter(r=>r[key].paperCensored).length};
}
console.log(JSON.stringify({mode:'OFFLINE_V3_DIAGNOSTIC_NOT_ACCURACY_CERTIFICATION',productionEnabled:false,
  caveats:['ALL_SAVED_CASES_NOT_JUST_WINNERS','KNOWN_CASES_NOT_OUT_OF_SAMPLE','NATIVE_HTF_DELIVERY_ASSUMED_AT_CLOSE',
    'NO_HISTORICAL_GREEN_OR_EXECUTION','NEXT_FULL_MINUTE_OPEN_14BPS_ASSUMED_COST','CORRELATED_TF_EVENTS','CENSORED_WINDOWS_EXPLICIT'],
  summary:{cases:results.length,completeWatchWindows:results.filter(r=>r.watchComplete).length,missingCases:manifest.missingCases??[],methods},results},null,2));

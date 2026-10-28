#!/usr/bin/env node
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';import {resolve,dirname} from 'node:path';
import {replayV4Comparison} from './lib/replay-continuation-v4.mjs';
const [file]=process.argv.slice(2);
if(!file)throw Error('Usage: compare-continuation-v4.mjs manifest.json');
const manifest=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(manifest.cases)||manifest.cases.length>500)throw Error('INVALID_MANIFEST');
const records=[],ids=new Set();
for(const c of manifest.cases){
 if(ids.has(c.event.id))throw Error('DUPLICATE_EVENT');
 ids.add(c.event.id);
 const bytes=await readFile(resolve(dirname(file),c.candlesFile));
 const raw=c.candlesFile.endsWith('.gz')?gunzipSync(bytes):bytes;
 if(createHash('sha256').update(raw).digest('hex')!==c.candlesSha256)throw Error('CANDLE_HASH_MISMATCH');
 records.push(replayV4Comparison(JSON.parse(raw),c.event));
}
const inScope=records.filter(r=>r.scope==='LONG_A_1M_ONLY');
const excluded=records.filter(r=>r.scope!=='LONG_A_1M_ONLY');
const paths=(key)=>inScope.reduce((a,r)=>{const p=r[key].confirmed?.path;
 if(p)a[p]=(a[p]||0)+1;return a;},{});
const metrics=key=>{
 const confirmed=inScope.filter(r=>r[key].confirmed),filled=inScope.filter(r=>r[key].paperEntry!==null),
   settled=inScope.filter(r=>['TP1_BEFORE_SL','SL_BEFORE_TP1','TIMEOUT'].includes(r[key].paperStatus)),
   statuses=inScope.reduce((a,r)=>(a[r[key].paperStatus||'NO_PLAN']=(a[r[key].paperStatus||'NO_PLAN']||0)+1,a),{});
 return {confirmationEvents:confirmed.length,paths:paths(key),
   confirmationBeforeRecordedPeak:confirmed.filter(r=>r[key].confirmationBeforeRecordedPeak).length,
   filledEvents:filled.length,pricedExits:settled.length,
   tp1BeforeSl:settled.filter(r=>r[key].paperStatus==='TP1_BEFORE_SL').length,
   slBeforeTp1:settled.filter(r=>r[key].paperStatus==='SL_BEFORE_TP1').length,
   meanNetPct:settled.length?settled.reduce((s,r)=>s+r[key].netReturnPct,0)/settled.length:null,
   paperStatuses:statuses};
};
const reasonTotals=inScope.reduce((t,r)=>{for(const [key,value]of Object.entries(r.reasonsV4))
 t[key]=(t[key]||0)+value;return t;},{});
const patternEvents=inScope.filter(r=>r.patternCandidates>0);
const s={method:'V4_THREE_BAR_STAIRCASE_RESEARCH_OFFLINE',
 cases:records.length,oneMinuteCases:inScope.length,
 outOfScope:excluded.length,completeWindows:inScope.filter(r=>r.completeSixHourWindow).length,
 missingCases:manifest.missingCases??[],
 baselineV3:metrics('baselineV3'),candidateV4:metrics('candidateV4'),
 diagnosticReasonsV4:reasonTotals,
 structuralPatternEvents:patternEvents.length,
 unifiedStatusClosedMinutes:inScope.reduce((out,r)=>{
   for(const [name,n] of Object.entries(r.unified1m.counts))out[name]=(out[name]||0)+n;
   return out;
 },{}),
 unifiedRedEventCount:inScope.filter(r=>r.unified1m.firstRed).length,
 unifiedHistoricalGreenEvents:inScope.filter(r=>r.unified1m.counts.GREEN>0).length,
 watchPriorityEvents:inScope.filter(r=>r.firstWatchPriority).length,
 watchPriorityFollowThrough5Pct:inScope.filter(r=>r.laterGainFromPriorityPct!==null&&
   r.laterGainFromPriorityPct>=5).length,
 watchPriorityAfterMinutes:inScope.filter(r=>r.firstWatchPriority).map(r=>
   ({eventId:r.eventId,afterMinutes:Number(((r.firstWatchPriority.atMs-
     Number(r.eventId.split(':')[2]))/60000).toFixed(1)),
     returnSinceAPct:r.firstWatchPriority.returnSinceAPct,
     followingHighPct:r.laterGainFromPriorityPct,windowComplete:r.completeSixHourWindow})),
 structuralPatternDetails:patternEvents.map(r=>({eventId:r.eventId,
   firstPatternAtMs:r.firstPatternAtMs,patterns:r.patternCandidates,
   firstRiskGateAtMs:r.firstRiskGateAtMs,confirm:!!r.candidateV4.confirmed})),
 rose20Pct:inScope.filter(r=>r.mfePct>=20).map(r=>r.eventId),
 rose20PctWithoutV4Confirmation:inScope.filter(r=>r.mfePct>=20&&!r.candidateV4.confirmed).map(r=>r.eventId),
 v4ConfirmationEvents:inScope.filter(r=>r.candidateV4.confirmed).map(r=>({id:r.eventId,
  atMs:r.candidateV4.confirmed.atMs,path:r.candidateV4.confirmed.path,
  paperStatus:r.candidateV4.paperStatus,netReturnPct:r.candidateV4.netReturnPct})),
 caveats:['ALL_ARCHIVED_CASES_IN_SAMPLE_NOT_BLIND','SHA256_VERIFIED_SAVED_CANDLES',
  'NO_FRESH_HISTORICAL_TICKER_GREEN_RECONSTRUCTED','SYNTHETIC_PAPER_NEXT_FULL_MINUTE_OPEN_14BPS',
  'CENSORED_WINDOWS','NATIVE_HTF_DELIVERY_AT_CLOSE_ASSUMED','CORRELATED_SYMBOL_EPISODES',
  'NO_ORDER_BOOK_SLIPPAGE','POTENTIAL_THRESHOLD_OVERFITTING_DO_NOT_DEPLOY']};
console.log(JSON.stringify({summary:s,records},null,2));

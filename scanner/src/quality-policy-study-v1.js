/** Offline comparison only. No live imports, network, notification or quota.
 * Frozen Quality V1 flags are assessed before independently reading outcomes.
 * A row asserts that its event is genuine; provenance is NOT authenticated here.
 */
import {inspectLongAQuality} from './quality-shadow-v1.js';
import {measureForwardOutcome} from './quality-evidence-v1.js';

const TF=Object.freeze(['1m','5m','15m','1h']);
const HORIZONS=Object.freeze([60,240]);
const POTENTIALS=Object.freeze([2,5,10]);
const POLICIES=Object.freeze(['LOOSE','MEDIUM','STRICT']);
const FOUR_HOURS=240*60_000;
const ratio=(n,d)=>d?Number((100*n/d).toFixed(4)):null;
const round=x=>Number(x.toFixed(4));
const median=values=>{
 if(!values.length)return null;
 const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);
 return round(a.length%2?a[m]:(a[m-1]+a[m])/2);
};
function membership(q){
 if(q.status!=='ASSESSED')return Object.fromEntries(POLICIES.map(p=>[p,'UNVERIFIED']));
 const n=Object.values(q.flags).filter(Boolean).length;
 return {LOOSE:'KEEP_RESEARCH',MEDIUM:n>=2?'KEEP_RESEARCH':'DROP_RESEARCH',
   STRICT:n===3?'KEEP_RESEARCH':'DROP_RESEARCH'};
}
function summarize(rows,policy){
 const assessed=rows.filter(x=>x.quality.status==='ASSESSED');
 const keep=assessed.filter(x=>x.policies[policy]==='KEEP_RESEARCH');
 const drop=assessed.filter(x=>x.policies[policy]==='DROP_RESEARCH');
 const horizons=Object.fromEntries(HORIZONS.map(h=>{
  const measured=assessed.filter(x=>x.outcomes[h].status==='MEASURED');
  const kept=measured.filter(x=>x.policies[policy]==='KEEP_RESEARCH');
  const dropped=measured.filter(x=>x.policies[policy]==='DROP_RESEARCH');
  const potential=Object.fromEntries(POTENTIALS.map(p=>{
   const candidates=measured.filter(x=>x.outcomes[h].maxFavorablePct>=p);
   const missed=candidates.filter(x=>x.policies[policy]==='DROP_RESEARCH');
   return [p,{observed:candidates.length,retained:candidates.length-missed.length,
    missed:missed.length,retentionPct:ratio(candidates.length-missed.length,candidates.length),
    missedEventIds:missed.map(x=>x.eventId)}];
  }));
  const med=(a,k)=>median(a.map(x=>x.outcomes[h][k]));
  return [h,{measured:measured.length,missing:rows.length-measured.length,
   keptMeasured:kept.length,droppedMeasured:dropped.length,potential,
   keptMedianMfePct:med(kept,'maxFavorablePct'),keptMedianMaePct:med(kept,'maxAdversePct'),
   keptMedianEndPct:med(kept,'endingReturnPct'),droppedMedianEndPct:med(dropped,'endingReturnPct'),
   keptAdverseAtLeast2Pct:kept.filter(x=>x.outcomes[h].maxAdversePct<=-2).length,
   keptNonPositiveEnd:kept.filter(x=>x.outcomes[h].endingReturnPct<=0).length,
   droppedNonPositiveEnd:dropped.filter(x=>x.outcomes[h].endingReturnPct<=0).length}];
 }));
 return {input:rows.length,assessed:assessed.length,unverified:rows.length-assessed.length,
  kept:keep.length,dropped:drop.length,reductionAmongAssessedPct:ratio(drop.length,assessed.length),
  droppedEventIds:drop.map(x=>x.eventId),horizons};
}
function cohort(rows){
 return Object.fromEntries(POLICIES.map(p=>[p,summarize(rows,p)]));
}

export function compareQualityPolicies(records,{
 validationStartMs=null,observedThroughMs=null,alertTimeframes=TF
}={}){
 if(!Array.isArray(records)||records.length>10000)throw Error('INVALID_OR_OVERSIZED_EVIDENCE');
 if(validationStartMs!==null&&(!Number.isSafeInteger(validationStartMs)||validationStartMs<=0))
  throw Error('INVALID_VALIDATION_START');
 if(observedThroughMs!==null&&(!Number.isSafeInteger(observedThroughMs)||observedThroughMs<=0))
  throw Error('INVALID_OBSERVATION_CUTOFF');
 if(validationStartMs!==null&&observedThroughMs!==null&&validationStartMs>observedThroughMs)
  throw Error('VALIDATION_AFTER_OBSERVATION_CUTOFF');
 if(!Array.isArray(alertTimeframes)||!alertTimeframes.length||
   new Set(alertTimeframes).size!==alertTimeframes.length||alertTimeframes.some(x=>!TF.includes(x)))
  throw Error('INVALID_ALERT_TIMEFRAMES');
 const seen=new Set();
 const results=records.map((row,index)=>{
  const e=row?.event,id=e?.id??null,t=e?.barClosedAtMs??null;
  if(id!==null){if(seen.has(id))throw Error('DUPLICATE_EVENT_ID');seen.add(id);}
  const afterCutoff=observedThroughMs!==null&&Number.isSafeInteger(t)&&t>observedThroughMs;
  const quality=afterCutoff?{status:'UNVERIFIED',reason:'EVENT_AFTER_OBSERVATION_CUTOFF',
    deliveryAction:'NONE',grade:null,features:null}:inspectLongAQuality(e,row?.bars);
  // Membership is fixed solely from the signal-time features above.
  const policies=membership(quality);
  const future=Array.isArray(row?.futureBars)&&observedThroughMs!==null?
    row.futureBars.filter(b=>Number.isSafeInteger(b?.endMs)&&b.endMs<=observedThroughMs):row?.futureBars;
  const outcomes=Object.fromEntries(HORIZONS.map(h=>[h,quality.status==='ASSESSED'?
    measureForwardOutcome(e,future,h):{status:'UNVERIFIED',reason:'QUALITY_INPUT_UNVERIFIED'}]));
  let partition='UNSPLIT';
  if(validationStartMs!==null){
   if(!Number.isSafeInteger(t))partition='UNVERIFIED';
   else if(t>=validationStartMs)partition='VALIDATION';
   else if(t+FOUR_HOURS<validationStartMs)partition='EARLIER';
   else partition='PURGED_OVERLAPPING_OUTCOME';
  }
  // Policy comparison is independent of today's delivery subset. No 1m is re-enabled.
  const publication=TF.includes(e?.timeframe)?
    (alertTimeframes.includes(e.timeframe)?'ENABLED_TF':'DISABLED_TF'):'UNVERIFIED';
  const detected=e?.detectedAtMs??row?.detectedAtMs;
  const detectionDelayMs=Number.isSafeInteger(t)&&Number.isSafeInteger(detected)&&detected>=t&&
    (observedThroughMs===null||detected<=observedThroughMs)?detected-t:null;
  return {index,eventId:id,symbol:e?.symbol??null,timeframe:e?.timeframe??null,
   barClosedAtMs:t,quality,policies,outcomes,partition,publication,detectionDelayMs};
 }).sort((a,b)=>(a.barClosedAtMs??Infinity)-(b.barClosedAtMs??Infinity)||a.index-b.index);
 const byTimeframe=Object.fromEntries(TF.map(tf=>[tf,cohort(results.filter(x=>x.timeframe===tf))]));
 const chronology=validationStartMs===null?null:Object.fromEntries(
  ['EARLIER','PURGED_OVERLAPPING_OUTCOME','VALIDATION','UNVERIFIED'].map(k=>
   [k,{...cohort(results.filter(x=>x.partition===k))}]));
 const disabled=results.filter(x=>x.publication==='DISABLED_TF');
 const disabledTfPotential=Object.fromEntries(HORIZONS.map(h=>[h,Object.fromEntries(
  POTENTIALS.map(p=>[p,disabled.filter(x=>x.outcomes[h].status==='MEASURED'&&
    x.outcomes[h].maxFavorablePct>=p).map(x=>x.eventId)]))]));
 return {mode:'OFFLINE_POLICY_COMPARISON',version:1,readyForProduction:false,
  thresholdStatus:'FROZEN_PROVISIONAL_V1_NOT_TUNED',records:results.length,
  validationStartMs,observedThroughMs,alertTimeframes:[...alertTimeframes],
  policies:{LOOSE:'all assessable original LONG_A',MEDIUM:'at least two of three V1 flags',
   STRICT:'all three V1 flags'},comparison:cohort(results),byTimeframe,chronology,
  deliveryPolicy:{disabledTfEvents:disabled.length,disabledTfEventIds:disabled.map(x=>x.eventId),
    disabledTfPotential},
  limitations:['NO_NETWORK_OR_LIVE_DELIVERY_ACTION','NO_DAILY_QUOTA',
   'UNKNOWN_INPUTS_ARE_NOT_WEAK_OR_DROPPED','MFE_IS_POTENTIAL_NOT_REALIZED_PROFIT',
   'OHLC_CANNOT_RESOLVE_INTRABAR_STOP_TARGET_ORDER','NO_MARKET_WIDE_FALSE_NEGATIVE_RECALL',
   'REPEATED_EVENTS_ARE_CORRELATED_NOT_INDEPENDENT_TRADES',
   'PROVENANCE_AND_PINE_PARITY_REQUIRE_SEPARATE_VERIFICATION',
   'SPLIT_IS_NOT_PROOF_OF_UNSEEN_OR_PROSPECTIVE_VALIDATION'],results};
}

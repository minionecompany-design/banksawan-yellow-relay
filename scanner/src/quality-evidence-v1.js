/**
 * YELLOW GOLD — OFFLINE forward-evidence audit for genuine LONG_A snapshots.
 * Quality only uses candles AT OR BEFORE the event. Subsequent candles are
 * independently measured AFTER ranking. No feed, REST, WebSocket, FCM, HOME.
 */
import {inspectLongAQuality} from './quality-shadow-v1.js';
const PERIODS=Object.freeze({'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000});
const HORIZONS=Object.freeze([60,240]);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round(x*1e4)/1e4;
const pct=(price,entry)=>round(100*(price/entry-1));
export function measureForwardOutcome(event,rawFuture,horizonMinutes){
  if(!event||!Object.hasOwn(PERIODS,event.timeframe)||
    !Number.isSafeInteger(event.barClosedAtMs)||event.barClosedAtMs<=0||
    event.barClosedAtMs%PERIODS[event.timeframe]!==0||!finite(event.price)||event.price<=0)
    return {status:'UNVERIFIED',reason:'INVALID_OUTCOME_EVENT'};
  if(!HORIZONS.includes(horizonMinutes))return {status:'UNVERIFIED',reason:'UNSUPPORTED_HORIZON'};
  if(!Array.isArray(rawFuture))return {status:'UNVERIFIED',reason:'FUTURE_CANDLES_NOT_PROVIDED'};
  const period=PERIODS[event.timeframe],until=event.barClosedAtMs+horizonMinutes*60_000;
  const expected=horizonMinutes*60_000/period;
  if(!Number.isInteger(expected)||expected<1)return {status:'UNVERIFIED',reason:'UNSUPPORTED_TF_HORIZON'};
  const bars=rawFuture.filter(x=>Number.isSafeInteger(x?.endMs)&&
    x.endMs>event.barClosedAtMs&&x.endMs<=until)
    .sort((a,b)=>a.endMs-b.endMs);
  if(bars.length!==expected)return {status:'UNVERIFIED',reason:'INCOMPLETE_FORWARD_HORIZON'};
  for(let i=0;i<bars.length;i++){
    const x=bars[i];
    if(x.endMs!==event.barClosedAtMs+(i+1)*period ||
      ![x.open,x.high,x.low,x.close,x.volume].every(finite)||
      x.low<=0||x.open<=0||x.high<=0||x.close<=0||x.volume<0||
      x.high<Math.max(x.open,x.close)||x.low>Math.min(x.open,x.close))
      return {status:'UNVERIFIED',reason:'INVALID_FORWARD_CANDLES'};
  }
  // Include the entry itself: MFE cannot be negative and MAE cannot be positive.
  const peak=Math.max(event.price,...bars.map(x=>x.high));
  const trough=Math.min(event.price,...bars.map(x=>x.low));
  const firstPeak5=bars.find(x=>x.high>=event.price*1.05);
  return {status:'MEASURED',horizonMinutes,
    maxFavorablePct:pct(peak,event.price),maxAdversePct:pct(trough,event.price),
    endingReturnPct:pct(bars.at(-1).close,event.price),
    // OHLC only bounds the crossing to a bar; it does not reveal a tick time.
    firstPlus5WindowMinutes:firstPeak5?{
      startInclusive:(firstPeak5.endMs-period-event.barClosedAtMs)/60_000,
      endInclusive:(firstPeak5.endMs-event.barClosedAtMs)/60_000}:null,
    barCount:bars.length,
    limitation:'MFE/MAE are theoretical extremes; intrabar stop/target order and tradability unknown'};
}
/**
 * Input: [{event: confirmed LONG_A, bars: 61+ as-of CLOSED candles,
 *          futureBars: closed candles AFTER event (optional)}].
 * Duplicate IDs are rejected, missing outcomes are not imputed.
 */
export function evaluateQualityEvidence(records){
  if(!Array.isArray(records)||records.length>10000)throw Error('INVALID_OR_OVERSIZED_EVIDENCE');
  const seen=new Set();
  const results=records.map((row,index)=>{
    const id=row?.event?.id??null;
    if(id!==null){if(seen.has(id))throw Error('DUPLICATE_EVENT_ID');seen.add(id);}
    const quality=inspectLongAQuality(row?.event,row?.bars);
    const outcomes=Object.fromEntries(HORIZONS.map(h=>[String(h),quality.status==='ASSESSED'?
      measureForwardOutcome(row.event,row?.futureBars,h):{status:'UNVERIFIED',reason:'QUALITY_INPUT_UNVERIFIED'}]));
    return {index,eventId:id,symbol:row?.event?.symbol??null,timeframe:row?.event?.timeframe??null,
      barClosedAtMs:row?.event?.barClosedAtMs??null,quality,outcomes};
  });
  const considered=results.filter(x=>x.quality.status==='ASSESSED');
  const measured=results.filter(x=>x.outcomes['240'].status==='MEASURED');
  const byTimeframe=Object.fromEntries(Object.keys(PERIODS).map(tf=>[tf,{
    input:results.filter(x=>x.timeframe===tf).length,
    assessed:considered.filter(x=>x.timeframe===tf).length,
    measured240:measured.filter(x=>x.timeframe===tf).length}]));
  const gradeCounts=Object.fromEntries(['GOLD_RESEARCH','REVIEW_RESEARCH','WEAK_RESEARCH','UNVERIFIED']
    .map(g=>[g,results.filter(x=>(x.quality.grade||'UNVERIFIED')===g).length]));
  const possibleWinners=measured.filter(x=>x.outcomes['240'].maxFavorablePct>=5);
  const missedIfGoldOnly=possibleWinners.filter(x=>x.quality.grade!=='GOLD_RESEARCH');
  return {mode:'OFFLINE_EVIDENCE_AUDIT',source:'EXPLICIT_CLOSED_CANDLE_SNAPSHOTS_ONLY',
    readyForProduction:false,thresholdStatus:'PROVISIONAL',horizonsMinutes:HORIZONS,
    records:results.length,assessed:considered.length,measured4h:measured.length,
    missing4h:results.length-measured.length,gradeCounts,byTimeframe,
    plus5MfeIn4h:possibleWinners.length,
    wouldMissPlus5MfeIfGoldOnly:missedIfGoldOnly.length,
    missedCandidateEventIds:missedIfGoldOnly.map(x=>x.eventId),
    guardrail:'MFE >= 5% is retrospective potential, NOT executable profit, trade win rate, or proof of GOLD accuracy',
    results};
}


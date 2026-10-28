/** OFFLINE comparative replay on the fixed 46-case archive.
 * Per LONG A 1M: compare V3 and isolated V4 on identical immutable candle
 * streams; never fabricate time-stamped exchange quotes or historical GREEN.
 */
import {ANALYSIS_KEYS,ANALYSIS_PERIODS,validAnalysisBar,validAnalysisEventId,
  newPaperOutcome,advancePaperOutcome} from '../../src/analysis-companion.js';
import {newReadinessWatch,advanceReadinessWatch} from '../../src/entry-readiness-v3.js';
import {newContinuationWatchV4,advanceContinuationWatchV4,continuationPriorityV4} from '../../src/entry-continuation-v4.js';
const M=60_000,ACTIVE=new Set(['WAITING_ENTRY','OPEN']),valid=x=>Number.isFinite(x)?Number(x.toFixed(5)):null;
function check(data,event){
 if(data?.symbol!==event?.symbol)throw Error('REPLAY_SYMBOL_MISMATCH');
 if(!validAnalysisEventId(event?.id)||event.signal!=='LONG_A'||
    event.id!==`${event.symbol}:${event.timeframe}:${event.barClosedAtMs}:LONG_A`)
   throw Error('INVALID_EVENT');
 for(const [tf,key] of Object.entries(ANALYSIS_KEYS)){
   const bars=data.candles?.[key];
   if(!Array.isArray(bars)||!bars.every((b,i)=>validAnalysisBar(b,ANALYSIS_PERIODS[tf])&&
     (!i||b.endMs>bars[i-1].endMs)))throw Error('INVALID_CANDLES_'+tf);
 }
}
export function replayV4Comparison(source,event){
 check(source,event);
 if(event.timeframe!=='1m')return {eventId:event.id,timeframe:event.timeframe,
   scope:'OUT_OF_SCOPE_NON_1M'};
 const a=source.candles,deadline=event.barClosedAtMs+360*M;
 let v3=newReadinessWatch(event),v4=newContinuationWatchV4(event),
   p3=null,p4=null,c3=null,c4=null,last=event.barClosedAtMs,hasGap=false,
   maxHigh=event.price,minLow=event.price,maxBarEndMs=null,
   reasonsV4={},patternCandidates=0,firstPatternAtMs=null,firstPatternClose=null,
   firstRiskGateAtMs=null,firstWatchPriority=null,priorityMinutes=0;
 const bars=a.oneMinute.filter(x=>x.endMs>event.barClosedAtMs&&x.endMs<=deadline+123*M);
 for(const bar of bars){
   if(last<deadline&&bar.endMs!==last+M)hasGap=true;
   last=bar.endMs;
   const snapshot=Object.fromEntries(Object.entries(ANALYSIS_KEYS).map(([tf,key])=>
     [key,a[key].filter(x=>x.endMs<=bar.endMs)]));
   v3=advanceReadinessWatch(v3,bar,snapshot,bar.endMs+1000);
   v4=advanceContinuationWatchV4(v4,bar,snapshot,bar.endMs+1000);
   if(bar.endMs<=deadline){
     reasonsV4[v4.reason]=(reasonsV4[v4.reason]||0)+1;
     if(v4.evidence?.atMs===bar.endMs&&v4.evidence?.continuation?.pass){
       patternCandidates++;
       if(firstPatternAtMs===null){firstPatternAtMs=bar.endMs;firstPatternClose=bar.close;}
     }
     const hint=continuationPriorityV4(v4,bar.endMs+1000);
     if(hint.status==='WATCH_PRIORITY_UNKNOWN_OVERHEAD'){
       priorityMinutes++;
       if(firstWatchPriority===null)
         firstWatchPriority={atMs:bar.endMs,close:valid(bar.close),
           returnSinceAPct:valid((bar.close/event.price-1)*100),reason:hint.reason};
     }
     if(v4.evidence?.risk?.pass&&v4.evidence?.room?.pass)
       firstRiskGateAtMs??=bar.endMs;
   }
   if(p3&&v3.state==='DATA_GAP'&&ACTIVE.has(p3.status))
     p3={...p3,status:'INCOMPLETE_DATA',endedAtMs:bar.endMs};
   else if(p3)p3=advancePaperOutcome(v3,p3,bar);
   if(p4&&v4.state==='DATA_GAP'&&ACTIVE.has(p4.status))
     p4={...p4,status:'INCOMPLETE_DATA',endedAtMs:bar.endMs};
   else if(p4)p4=advancePaperOutcome(v4,p4,bar);
   if(v3.plan&&!c3){c3={atMs:v3.confirmedAtMs,path:v3.path,price:valid(v3.plan.referenceEntry),
     riskPct:valid(v3.plan.riskPct)};p3=newPaperOutcome({plan:v3.plan,capturedAtMs:v3.confirmedAtMs});}
   if(v4.plan&&!c4){c4={atMs:v4.confirmedAtMs,path:v4.path,price:valid(v4.plan.referenceEntry),
     riskPct:valid(v4.plan.riskPct)};p4=newPaperOutcome({plan:v4.plan,capturedAtMs:v4.confirmedAtMs});}
   if(p3?.status==='WAITING_ENTRY'&&['INVALIDATED','ENDED','DATA_GAP'].includes(v3.state))
     p3={...p3,status:v3.state==='DATA_GAP'?'INCOMPLETE_DATA':'NOT_ENTERED',endedAtMs:bar.endMs};
   if(p4?.status==='WAITING_ENTRY'&&['INVALIDATED','ENDED','DATA_GAP'].includes(v4.state))
     p4={...p4,status:v4.state==='DATA_GAP'?'INCOMPLETE_DATA':'NOT_ENTERED',endedAtMs:bar.endMs};
   if(bar.endMs<=deadline){
     if(bar.high>maxHigh){maxHigh=bar.high;maxBarEndMs=bar.endMs;}
     minLow=Math.min(minLow,bar.low);
   }
 }
 const completed=last>=deadline&&!hasGap;
 const futureFrom=(at,price)=>{
   if(!Number.isSafeInteger(at)||!positivePrice(price))return null;
   const later=bars.filter(x=>x.endMs>at&&x.endMs<=deadline);
   return later.length?valid((Math.max(...later.map(x=>x.high))/price-1)*100):null;
 };
 function positivePrice(p){return typeof p==='number'&&Number.isFinite(p)&&p>0;}
 const laterGainFromFirstPatternPct=futureFrom(firstPatternAtMs,firstPatternClose);
 const laterGainFromPriorityPct=firstWatchPriority?
   futureFrom(firstWatchPriority.atMs,firstWatchPriority.close):null;
 const outcome=(c,p)=>({confirmed:c,confirmationBeforeRecordedPeak:
   c&&maxBarEndMs!==null?c.atMs-1000<maxBarEndMs:null,
   timeToConfirmMin:c?valid((c.atMs-event.barClosedAtMs)/M):null,
   paperStatus:p?.status??null,
   paperEntry:p?.entryPrice??null,netReturnPct:p?.netReturnPct??null,
   paperCensored:p?ACTIVE.has(p.status):false});
 return {eventId:event.id,symbol:event.symbol,scope:'LONG_A_1M_ONLY',
   signalPrice:event.price,candlesEvaluated:bars.length,
   completeSixHourWindow:completed,candleGap:hasGap,
   mfePct:valid((maxHigh/event.price-1)*100),
   maePct:valid((minLow/event.price-1)*100),
   recordedPeakAtMs:maxBarEndMs,reasonsV4,patternCandidates,
   firstPatternAtMs,firstPatternClose,firstRiskGateAtMs,
   firstWatchPriority,priorityMinutes,laterGainFromFirstPatternPct,laterGainFromPriorityPct,
   baselineV3:outcome(c3,p3),candidateV4:outcome(c4,p4),
   historicalGreen:'NOT_RECONSTRUCTED_NO_HISTORICAL_QUOTE'};
}

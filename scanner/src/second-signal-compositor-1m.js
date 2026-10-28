/** ONE research-only decision for a LONG A 1M HOME record.
 * Never imported into production. No side effects, network calls or orders.
 * The goal is to prevent RED/GREEN contradiction across independent engines.
 */
import {freshQuote} from './entry-watch.js';
import {secondSignal1m} from './second-signal-1m.js';
import {continuationColorV4,continuationPriorityV4} from './entry-continuation-v4.js';
export const SECOND_SIGNAL_COMPOSITOR='YELLOW_ONE_DECISION_1M_RESEARCH';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function decideSecondSignal1m({event,v3,v4,snapshot,ticker,nowMs}={}){
 const output=(status,reason,extra={})=>({
   method:SECOND_SIGNAL_COMPOSITOR,mode:'RESEARCH_ONLY',
   status,reason,priority:false,entryAllowed:false,
   priceChangeSinceAPct:null,livePriceAtMs:null,
   selectedPath:null,selectedPlan:null,checkedAtMs:nowMs??null,
   eventId:event?.id??null,...extra
 });
 if(event?.timeframe!=='1m')return output('NOT_APPLICABLE','SECOND_SIGNAL_1M_ONLY');
 if(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(event?.barClosedAtMs)||
   nowMs<event.barClosedAtMs)return output('OFF','INVALID_CLOCK');
 if(v3?.eventId!==event?.id||v4?.eventId!==event?.id)
   return output('YELLOW','RESEARCH_STATE_MISSING');
 const fresh=freshQuote(ticker,nowMs)&&ticker.observedAtMs>=event.barClosedAtMs&&
   finite(event.price)&&event.price>0;
 const live={priceChangeSinceAPct:fresh?(ticker.lastPrice/event.price-1)*100:null,
   livePriceAtMs:fresh?ticker.observedAtMs:null};
 // If either engine loses a native candle sequence, data are no longer safe
 // for an entry label. Do not revive an old green on the remaining engine.
 if(v3.state==='DATA_GAP'||v4.state==='DATA_GAP')
   return output('OFF','NATIVE_CANDLE_DATA_GAP',live);
 if(v3.state==='INVALIDATED'&&v3.reason==='TARGET_TOUCHED'||
    v4.state==='INVALIDATED'&&v4.reason==='TARGET_TOUCHED')
   return output('OFF','TP1_ALREADY_REACHED',live);
 if(nowMs>=event.barClosedAtMs+360*60_000)
   return output('OFF','WATCH_WINDOW_ENDED',live);
 const red3=secondSignal1m({event,watch:v3,snapshot,ticker,nowMs});
 const decision4=continuationColorV4(v4,ticker,nowMs);
 const priority=continuationPriorityV4(v4,nowMs);
 // Risk VETO: a real structural failure/stop/trend invalidation beats
 // another engine's tentative entry confirmation; never show both colors.
 if(red3.status==='RED'||decision4.status==='RED'){
   const reason=red3.status==='RED'?red3.reason:decision4.reason;
   return output('RED',reason,{...live,riskSource:red3.status==='RED'?'V3_OR_STRUCTURE':'CONTINUATION_V4'});
 }
 const green=[];
 if(red3.status==='GREEN'&&v3.plan&&v3.state==='CONFIRMED')
   green.push({at:v3.confirmedAtMs,source:'V3',path:v3.path,plan:v3.plan});
 if(decision4.status==='GREEN'&&v4.plan&&v4.state==='CONFIRMED')
   green.push({at:v4.confirmedAtMs,source:'V4',path:'CONTINUATION',plan:v4.plan});
 if(green.length){
   green.sort((a,b)=>a.at-b.at||a.source.localeCompare(b.source));
   const chosen=green[0];
   return output('GREEN','ENTRY_CONDITIONS_MET',{
     ...live,selectedPath:chosen.path,selectedPlan:structuredClone(chosen.plan),
     confirmedAtMs:chosen.at,decisionSource:chosen.source,entryAllowed:true
   });
 }
 if(red3.status==='OFF'&&decision4.status==='OFF')
   return output('OFF','BOTH_WATCHES_ENDED',live);
 // Priority is WATCH-ONLY; NEVER implied entry even when price rises later.
 if(priority.status==='WATCH_PRIORITY_UNKNOWN_OVERHEAD')
   return output('YELLOW','PANTAU_PRIORITAS_CONTINUATION',{
     ...live,priority:true,priorityReason:priority.reason});
 return output('YELLOW','WAIT_ENTRY_CONFIRMATION',{
   ...live,v3Reason:red3.reason,v4Reason:decision4.reason});
}

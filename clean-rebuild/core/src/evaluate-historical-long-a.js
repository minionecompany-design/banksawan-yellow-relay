import {metrics,validatedBars,asOfPreviousEnd,FRAME_MS} from './indicators.js';
import {longAFromConfirmed,PullbackWindow} from './long-a-v13-gate.js';
/**
 * End-to-end 1m LONG A evaluator from historical closed candles.
 * Other TFs explicitly fail closed pending parity-certified lower-TF semantics.
 * Each invocation replays pullback state from full contiguous history (no guessing).
 */
export function evaluateHistoricalLongA({timeframe,closedAtMs,histories}={}){
 if(!FRAME_MS[timeframe])return {ready:false,longA:false,reason:'INVALID_TIMEFRAME'};
 if(timeframe!=='1m')return {ready:false,longA:false,reason:'MULTI_LANE_PINE_PARITY_PENDING'};
 if(!Number.isSafeInteger(closedAtMs)||closedAtMs<=0||!histories)
  return {ready:false,longA:false,reason:'INVALID_INPUT'};
 const one=histories['1m'];
 if(!validatedBars(one,'1m',closedAtMs))
  return {ready:false,longA:false,reason:'INVALID_OR_GAPPED_1M'};
 const pull=new PullbackWindow();
 let active=false;
 for(const b of one)active=pull.update(b.close);
 const context={one:metrics(one),pullbackWindowActive:active};
 for(const [tf,key] of [['5m','five'],['15m','fifteen'],['1h','hour']]){
  const end=asOfPreviousEnd(closedAtMs,tf);
  const bars=histories[tf];
  // All context snapshots end on the last fully finished bar BEFORE 1m close.
  if(end<=0||!validatedBars(bars,tf,end))
   return {ready:false,longA:false,reason:'MISSING_PREVIOUS_CONFIRMED_'+tf};
  context[key]=metrics(bars);
 }
 return longAFromConfirmed(context);
}

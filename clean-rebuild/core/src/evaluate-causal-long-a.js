import {metrics,validatedBars,asOfPreviousEnd,FRAME_MS} from './indicators.js';
import {longAFromConfirmed,PullbackWindow} from './long-a-v13-gate.js';
/** Causal realtime-only interpretation. Pine historical lower-TF security
 * lookahead differs; no claim of historical-chart parity. */
export const MODE='CAUSAL_REALTIME';
const metricsAt=(histories,tf,end)=>{
 const bars=histories?.[tf];
 return end>0&&validatedBars(bars,tf,end)?metrics(bars):null;
};
export function evaluateCausalLongA({timeframe,closedAtMs,histories,mode=MODE}={}){
 if(mode!==MODE)return {ready:false,longA:false,reason:'UNSUPPORTED_PARITY_MODE'};
 if(!FRAME_MS[timeframe])return {ready:false,longA:false,reason:'INVALID_TIMEFRAME'};
 if(!Number.isSafeInteger(closedAtMs)||closedAtMs<=0||closedAtMs%FRAME_MS[timeframe]!==0)
  return {ready:false,longA:false,reason:'INVALID_EVALUATION_CLOSE'};
 const own=histories?.[timeframe];
 if(!validatedBars(own,timeframe,closedAtMs))return {ready:false,longA:false,reason:'INVALID_OR_GAPPED_TARGET'};
 const pull=new PullbackWindow();let active=false;
 for(const bar of own)active=pull.update(bar.close);
 const context={one:metrics(own),pullbackWindowActive:active};
 for(const [tf,key] of [['5m','five'],['15m','fifteen'],['1h','hour']]){
  // Every request.security(..., close[1], lookahead_on) references
  // the preceding closed source-TF bar, not the currently building bar.
  const end=asOfPreviousEnd(closedAtMs,tf);
  const m=metricsAt(histories,tf,end);
  if(!m)return {ready:false,longA:false,reason:'MISSING_PREVIOUS_CONFIRMED_'+tf};
  context[key]=m;
 }
 const result=longAFromConfirmed(context);
 return {...result,mode:MODE,timeframe};
}

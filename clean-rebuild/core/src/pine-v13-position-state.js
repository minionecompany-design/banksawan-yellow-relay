/** BANKSAWAN LONG MTF v1.3 — Pine position-state audit.
 * Source of truth: docs/reference/BANKSAWAN-LONG-MTF-v1.3-user-supplied.pine
 *
 * This module reconstructs the ORIGINAL Pine state transitions for LONG_A
 * eligibility, but publishes ONLY LONG_A. PROTECT/LONG_B/OUT_FINAL exist only
 * as internal transitions, never user-facing events or trade instructions.
 *
 * DO NOT treat replay from an arbitrary truncated history as certified
 * TradingView parity: the initial tradeState may be unknown. A trusted
 * historical start/checkpoint is a separate release requirement.
 */
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const gt=(a,b)=>finite(a)&&finite(b)&&a>b;
const ge=(a,b)=>finite(a)&&finite(b)&&a>=b;
const lt=(a,b)=>finite(a)&&finite(b)&&a<b;
const valid=x=>x&&typeof x==='object';
const positive=n=>finite(n)&&n>0;

export function pineV13StateConditions({one,five,fifteen,hour,
 pullbackWindowActive=false,maximumPrice=30}={}){
 if(![one,five,fifteen,hour].every(valid)||!positive(maximumPrice))
  return {ready:false,reason:'MISSING_CONFIRMED_INPUT'};
 const fields=[
  one.close,one.ma7,one.ma25,one.ma99,one.rsi,one.rsiAvg,one.volRatio,
  five.close,five.ma7,five.ma25,five.ma99,five.rsi,five.rsiAvg,
  fifteen.close,fifteen.ma7,fifteen.ma25,fifteen.ma99,fifteen.rsi,
  hour.close,hour.ma7,hour.ma25,hour.ma99,hour.rsi
 ];
 if(!fields.every(finite)||!positive(one.ma7))
  return {ready:false,reason:'UNWARMED_OR_INVALID_METRICS'};
 const oneHourPermission=gt(hour.close,hour.ma99)&&ge(hour.ma7,hour.ma25)&&ge(hour.rsi,48);
 const fifteenMinuteSupport=gt(fifteen.close,fifteen.ma99)&&ge(fifteen.ma7,fifteen.ma25)&&ge(fifteen.rsi,48);
 const fiveMinuteMomentum=gt(five.close,five.ma7)&&gt(five.close,five.ma25)&&
  ge(five.ma7,five.ma25)&&gt(five.rsi,50)&&ge(five.rsi,five.rsiAvg);
 const distanceFromMA7=Math.abs(one.close-one.ma7)/one.ma7*100;
 const oneMinuteTrigger=gt(one.close,one.ma7)&&gt(one.close,one.ma25)&&
  gt(one.close,one.ma99)&&gt(one.ma7,one.ma25)&&gt(one.rsi,50)&&
  gt(one.rsi,one.rsiAvg)&&lt(one.rsi,75)&&ge(one.volRatio,.75)&&
  distanceFromMA7<=2.5&&lt(one.close,maximumPrice);
 const longASetup=pullbackWindowActive===true&&oneHourPermission&&
  fifteenMinuteSupport&&fiveMinuteMomentum&&oneMinuteTrigger;
 const oneMinuteWeak=lt(one.close,one.ma7)&&lt(one.rsi,one.rsiAvg)&&lt(one.rsi,50);
 const fiveMinuteWeak=lt(five.close,five.ma7)&&lt(five.rsi,five.rsiAvg);
 const protectCondition=oneMinuteWeak&&fiveMinuteWeak;
 const oneMinuteReclaim=gt(one.close,one.ma7)&&gt(one.close,one.ma25)&&
  gt(one.close,one.ma99)&&gt(one.ma7,one.ma25)&&gt(one.rsi,50)&&
  gt(one.rsi,one.rsiAvg)&&lt(one.rsi,75)&&ge(one.volRatio,.75)&&
  distanceFromMA7<=2.5;
 const fiveMinuteReclaim=gt(five.close,five.ma7)&&gt(five.close,five.ma25)&&
  ge(five.ma7,five.ma25)&&gt(five.rsi,50);
 const reclaimSetup=oneHourPermission&&fifteenMinuteSupport&&
  fiveMinuteReclaim&&oneMinuteReclaim;
 const fifteenMinuteFailure=lt(fifteen.close,fifteen.ma25)&&
  lt(fifteen.ma7,fifteen.ma25)&&lt(fifteen.rsi,45);
 const fiveMinuteMajorFailure=lt(five.close,five.ma99)&&
  lt(five.ma7,five.ma25)&&lt(five.rsi,45);
 const hardFailure=lt(one.close,one.ma99)&&lt(five.close,five.ma99)&&lt(five.rsi,45);
 const finalExitCondition=fifteenMinuteFailure||fiveMinuteMajorFailure||hardFailure;
 return {ready:true,longASetup,protectCondition,reclaimSetup,
  finalExitCondition,diagnostics:{oneHourPermission,fifteenMinuteSupport,
   fiveMinuteMomentum,oneMinuteTrigger,pullbackWindowActive,
   distanceFromMA7,oneMinuteWeak,fiveMinuteWeak,
   fifteenMinuteFailure,fiveMinuteMajorFailure,hardFailure}};
}

export class PineV13LongAState {
 constructor({timeframe='1m',entryWindowBars=30,reclaimWindowBars=90}={}){
  const ms={'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000};
  if(!ms[timeframe]||!Number.isSafeInteger(entryWindowBars)||entryWindowBars<0||
     !Number.isSafeInteger(reclaimWindowBars)||reclaimWindowBars<0)
   throw Error('INVALID_PINE_STATE_CONFIG');
  this.timeframe=timeframe;this.ms=ms[timeframe];
  this.entryWindowBars=entryWindowBars;
  this.reclaimWindowBars=reclaimWindowBars;
  this.index=-1;this.lastClosedAtMs=null;
  this.tradeState=0;this.protectBar=null;
 }
 /** Caller must pass the confirmed, contiguous candle (not an intrabar).
  * 'mode' is internal to the audit. No LONG B/PROTECT/HOT notifications. */
 step({closedAtMs,conditions}={}){
  if(!Number.isSafeInteger(closedAtMs)||closedAtMs<=0||
     closedAtMs%this.ms!==0||this.lastClosedAtMs!==null&&
     closedAtMs-this.lastClosedAtMs!==this.ms)
   throw Error('PINE_STATE_GAP_OR_OPEN_BAR');
  if(!valid(conditions)||conditions.ready!==true||
     ['longASetup','protectCondition','reclaimSetup','finalExitCondition']
       .some(k=>typeof conditions[k]!=='boolean'))
   throw Error('PINE_STATE_UNCONFIRMED_CONDITIONS');
  ++this.index;this.lastClosedAtMs=closedAtMs;
  let transition='NONE',emitLongA=false;
  // Exactly the if / else-if priority of user supplied Pine v1.3.
  if(this.tradeState!==0&&conditions.finalExitCondition){
   this.tradeState=0;this.protectBar=null;transition='INTERNAL_FINAL_EXIT';
  }else if(this.tradeState===0&&conditions.longASetup){
   this.tradeState=1;emitLongA=true;transition='LONG_A';
  }else if(this.tradeState===1&&conditions.protectCondition){
   this.tradeState=2;this.protectBar=this.index;transition='INTERNAL_PROTECT';
  }else if(this.tradeState===2){
   const reclaimWindowActive=this.protectBar!==null&&
      this.index-this.protectBar<=this.reclaimWindowBars;
   if(reclaimWindowActive&&conditions.reclaimSetup){
    this.tradeState=1;transition='INTERNAL_RECLAIM';
   }
  }
  return {longA:emitLongA,signal:emitLongA?'LONG_A':null,
   positionState:this.tradeState,internalTransition:transition,
   closedAtMs};
 }
}

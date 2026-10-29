/** Re-run offline SECOND SIGNAL on actual saved candle streams.
 * STRICTLY no Binance, no HTTP, no FCM, and NO fabricated ticker or GREEN.
 * Labels are as-of candle close only. Future highs are used *afterwards*
 * solely to audit early warnings, never to decide the earlier label.
 */
import {ANALYSIS_KEYS,ANALYSIS_PERIODS,validAnalysisBar,validAnalysisEventId} from '../../src/analysis-companion.js';
import {newReadinessWatch,advanceReadinessWatch} from '../../src/entry-readiness-v3.js';
import {secondSignal1m} from '../../src/second-signal-1m.js';
const M=60_000,WINDOW=360*M;
const number=x=>Number.isFinite(x)?Number(x.toFixed(5)):null;
function eventCheck(e){
 if(!validAnalysisEventId(e?.id)||e.signal!=='LONG_A'||
    e.id!==`${e.symbol}:${e.timeframe}:${e.barClosedAtMs}:LONG_A`)throw Error('INVALID_CASE_EVENT');
}
function validateCandles(payload){
 const data=payload?.candles;
 if(!data||typeof data!=='object')throw Error('INVALID_CASE_CANDLES');
 for(const [tf,key] of Object.entries(ANALYSIS_KEYS)){
   const bars=data[key];
   if(!Array.isArray(bars)||!bars.every((b,i)=>validAnalysisBar(b,ANALYSIS_PERIODS[tf])&&
       (!i||b.endMs>bars[i-1].endMs)))throw Error('INVALID_CLOSED_HISTORY_'+tf);
 }
 return data;
}
export function replaySecondSignalCase(payload,event){
 eventCheck(event);
 if(payload?.symbol!==event.symbol)throw Error('REPLAY_SYMBOL_MISMATCH');
 if(event.timeframe!=='1m')
   return {eventId:event.id,symbol:event.symbol,timeframe:event.timeframe,scope:'OUT_OF_SCOPE_NON_1M',
     status:'NOT_EVALUATED',candlesEvaluated:0,green:'NOT_RECONSTRUCTED_NO_HISTORICAL_QUOTE'};
 const data=validateCandles(payload);
 const firstEventBar=event.barClosedAtMs;
 let watch=newReadinessWatch(event,event.detectedAtMs);
 let prev=null,maxObserved=event.price,minObserved=event.price,hasGap=false,
     last=firstEventBar,red=null,confirmation=null,observed=0;
 const colors={YELLOW:0,RED:0,GREEN:0,OFF:0,NOT_APPLICABLE:0};
 const timeline=[],sample=[],windows=[5,15,30,60,120,360];
 const after=data.oneMinute.filter(b=>b.endMs>firstEventBar&&b.endMs<=firstEventBar+WINDOW);
 for(const b of after){
   if(b.endMs!==last+M)hasGap=true;
   last=b.endMs;observed++;
   // Only the bars available as of b.endMs may enter a *decision*.
   const snapshot=Object.fromEntries(Object.entries(ANALYSIS_KEYS).map(([tf,key])=>
     [key,data[key].filter(x=>x.endMs<=b.endMs)]));
   watch=advanceReadinessWatch(watch,b,snapshot,b.endMs+1000);
   if(watch.plan&&!confirmation)confirmation={
     path:watch.path,atMs:watch.confirmedAtMs,price:number(watch.plan.referenceEntry),
     riskPct:number(watch.plan.riskPct)};
   const assess=secondSignal1m({event,watch,snapshot,ticker:null,nowMs:b.endMs+1000});
   if(assess.status==='GREEN')throw Error('FABRICATED_GREEN_WITHOUT_HISTORICAL_QUOTE');
   colors[assess.status]=(colors[assess.status]||0)+1;
   if(assess.status!==prev){
     const item={atMs:b.endMs,status:assess.status,reason:assess.reason,
       close:number(b.close),returnSinceAPct:number((b.close/event.price-1)*100),
       relativeSellVolume:number(assess.risk?.sellVolumeRatio??NaN),
       fiveMinuteTrend:assess.risk?.fiveMinuteTrend??null,
       fifteenMinuteTrend:assess.risk?.fifteenMinuteTrend??null};
     timeline.push(item);
     if(assess.status==='RED'&&!red)red={...item,barEndMs:b.endMs};
     prev=assess.status;
   }
   if(windows.includes(Math.round((b.endMs-firstEventBar)/M)))
     sample.push({afterMinutes:(b.endMs-firstEventBar)/M,
       close:number(b.close),returnSinceAPct:number((b.close/event.price-1)*100)});
   maxObserved=Math.max(maxObserved,b.high);minObserved=Math.min(minObserved,b.low);
 }
 const complete=after.length>0&&!hasGap&&last>=firstEventBar+WINDOW;
 let redFuture=null;
 if(red){
   const future=after.filter(b=>b.endMs>red.barEndMs);
   const laterHigh=future.length?Math.max(...future.map(b=>b.high)):null;
   redFuture={futureBars:future.length,
     recoveryAboveSignalPrice:laterHigh===null?null:laterHigh>=event.price,
     subsequentHighAboveRedClosePct:laterHigh===null?null:number((laterHigh/red.close-1)*100),
     subsequentHighAboveSignalPct:laterHigh===null?null:number((laterHigh/event.price-1)*100)};
 }
 return {eventId:event.id,symbol:event.symbol,timeframe:event.timeframe,scope:'LONG_A_1M_ONLY',
   signalAtMs:firstEventBar,signalPrice:event.price,chg24hAtA:
     Number.isFinite(event.binance24hChangePct)?event.binance24hChangePct:null,
   candlesEvaluated:observed,completeSixHourWindow:complete,candleGap:hasGap,
   maxFavorableFromAPct:number((maxObserved/event.price-1)*100),
   maxAdverseFromAPct:number((minObserved/event.price-1)*100),
   colorsByClosedMinute:colors,firstRed:red,afterFirstRed:redFuture,
   v3CandleConfirmation:confirmation,observations:sample,transitions:timeline,
   green:'NOT_RECONSTRUCTED_NO_HISTORICAL_QUOTE',
   limitation:'CANDLE_AS_OF_LABELS_NOT_REAL_TICKER_OR_ENTRY_FILLED'};
}

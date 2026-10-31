/** Passive forward-only reducer; V16 decision thresholds are imported unchanged. */
import {YellowV16WatchMonitor} from './yellow-v16-watch-monitor.js';
import {validAnalysisEventId,validAnalysisBar} from './analysis-companion.js';
const M=60000,H=120*M;
const pct=(p,a)=>(p/a-1)*100;
export class V16ObservationEngine {
 constructor({store,startedAtMs,provenance='NATIVE_PROSPECTIVE'}={}){
  this.store=store;this.now=startedAtMs;this.startedAtMs=startedAtMs;this.provenance=provenance;
  this.active=new Map();this.seen=new Set();this.monitor=new YellowV16WatchMonitor({clock:()=>this.now,maxRecords:100});
  const rows=store.open();
  const unfinished=new Set();
  for(const r of rows){if(r.type==='START'){this.seen.add(r.eventId);unfinished.add(r.eventId);}if(r.type==='FINISH')unfinished.delete(r.eventId);}
  for(const id of unfinished)this.write({type:'FINISH',eventId:id,outcome:'INCOMPLETE',reason:'PROCESS_RESTART',mfePct:null,maePct:null});
  this.write({type:'SESSION',startedAtMs,provenance,sourceBaseline:'381823f7ce773c6c7e276c6833f47fbac481f5ed',windowMs:H});
 }
 write(x){return this.store.append({receivedAtMs:this.now,provenance:this.provenance,...x});}
 flushTicker(r){if(r.bucket){this.write({type:'TICKER_BUCKET',eventId:r.event.id,...r.bucket});r.bucket=null;}}
 finish(r,reason){
  this.flushTicker(r);
  this.write({type:'FINISH',eventId:r.event.id,outcome:r.gaps?'INCOMPLETE':r.bars===120?'OBSERVED':'EXPIRED',reason,
   bars:r.bars,mfePct:r.mfe,maePct:r.mae,extremaScope:'OBSERVED_NATIVE_PRICES_ONLY',gaps:r.gaps});
  this.active.delete(r.event.id);this.monitor.records.delete(r.event.id);
 }
 transition(r,ticker=null){
  const state=this.monitor.view(r.event.id,ticker,this.now);
  const status=state?.status??'OFF',reason=state?.reason??'MONITOR_UNAVAILABLE';
  if(['NATIVE_DATA_GAP','MONITOR_UNAVAILABLE','STALE_CANDLE'].includes(reason)&&!r.decisionGap){r.gaps++;r.decisionGap=true;this.write({type:'GAP',eventId:r.event.id,reason:'DECISION_'+reason});}
  const key=status+':'+reason+':'+!!r.gaps;
  if(key!==r.state){
   this.write({type:'STATE',eventId:r.event.id,status,reason,observationStatus:r.gaps?'OFF':status,dataQuality:r.gaps?'INCOMPLETE':'AVAILABLE',price:r.lastPrice??null,
    priceAtMs:r.priceAtMs??null,priceChangeSinceAPct:r.lastPrice?pct(r.lastPrice,r.event.price):null,
    monitorCheckedAtMs:this.now,decisionSource:'PASSIVE_V16_MIRROR',entryAllowed:false});r.state=key;
  }
 }
 extremes(r,prices){for(const p of prices){r.mfe=Math.max(r.mfe,pct(p,r.event.price));r.mae=Math.min(r.mae,pct(p,r.event.price));}}
 apply(input){
  const {at,type}=input;
  if(!Number.isSafeInteger(at)||at<this.now)throw Error('INVALID_RECEIVE_CLOCK');
  this.now=at;
  // Boundary bar is included; data later than horizon is never counted.
  for(const r of [...this.active.values()])if(at>r.event.barClosedAtMs+H+90000)this.finish(r,'WINDOW_ENDED');
  if(type==='START'){
   const e=input.event;
   if(e?.timeframe!=='1m'||e.signal!=='LONG_A'||!validAnalysisEventId(e.id)||e.id!==`${e.symbol}:1m:${e.barClosedAtMs}:LONG_A`||
    !Number.isFinite(e.price)||e.price<=0||e.detectedAtMs<this.startedAtMs||e.detectedAtMs>at||e.detectedAtMs<e.barClosedAtMs||e.detectedAtMs-e.barClosedAtMs>300000||this.seen.has(e.id))return;
   if(this.active.size>=100||this.seen.size>=10000)throw Error('EVENT_CAPACITY');
   const signalBar=input.snapshot?.oneMinute?.find(b=>b.endMs===e.barClosedAtMs);
   const valid=validAnalysisBar(signalBar)&&signalBar.endMs<=at;
   this.write({type:'START',eventId:e.id,event:{id:e.id,symbol:e.symbol,timeframe:e.timeframe,price:e.price,barClosedAtMs:e.barClosedAtMs,detectedAtMs:e.detectedAtMs},
    longAWib:new Date(e.barClosedAtMs+7*3600000).toISOString().replace('Z','+07:00'),signalCandle:valid?signalBar:null,contextAsReceived:input.snapshot});
   this.seen.add(e.id);
   const r={event:structuredClone(e),lastContext:Object.fromEntries(Object.entries(input.snapshot??{}).map(([k,b])=>[k,b.at(-1)?.endMs??0])),lastEnd:e.barClosedAtMs,bars:0,gaps:valid&&at-e.barClosedAtMs<90000?0:1,mfe:0,mae:0,lastPrice:e.price,priceAtMs:e.barClosedAtMs};
   this.active.set(e.id,r);this.monitor.capture(e,input.snapshot);this.transition(r);return;
  }
  if(type==='GAP'){
   for(const r of this.active.values()){r.gaps++;this.write({type:'GAP',eventId:r.event.id,reason:input.reason});}
   this.monitor.resetContinuity('NATIVE_DISCONNECT');
   for(const r of this.active.values())this.transition(r);return;
  }
  for(const r of this.active.values()){
   if(input.symbol&&r.event.symbol!==input.symbol)continue;
   const end=r.event.barClosedAtMs+H;
   if(type==='BAR'){
    const b=input.bar;
    if(!validAnalysisBar(b)||b.endMs>at||at-b.endMs>90000){r.gaps++;this.write({type:'GAP',eventId:r.event.id,reason:'INVALID_OR_LATE_BAR'});continue;}
    if(b.endMs<=r.lastEnd||b.endMs>end)continue;
    if(b.endMs!==r.lastEnd+M){r.gaps++;this.write({type:'GAP',eventId:r.event.id,reason:'MISSING_CANDLE',afterMs:r.lastEnd,beforeMs:b.endMs});}
    r.lastEnd=b.endMs;r.lastPrice=b.close;r.priceAtMs=b.endMs;r.bars++;const extremaHighLowEligible=b.endMs-M>=r.event.detectedAtMs;this.extremes(r,extremaHighLowEligible?[b.high,b.low]:[b.close]);
    this.write({type:'BAR',eventId:r.event.id,bar:b,extremaHighLowEligible,mfePct:r.mfe,maePct:r.mae});
   }else if(type==='DECISION_BAR'){
    const nativeContext={};for(const [k,bars] of Object.entries(input.snapshot??{})){const added=bars.filter(b=>b.endMs>(r.lastContext[k]??0)&&b.endMs<=at);if(added.length){nativeContext[k]=added;r.lastContext[k]=added.at(-1).endMs;}}
    if(Object.keys(nativeContext).length)this.write({type:'CONTEXT',eventId:r.event.id,asOfMs:input.bar.endMs,nativeContext});
    this.monitor.onClosedBar(input.symbol,'1m',input.bar,input.snapshot);
    // Engine clue states are evidence, not trade recommendations.
    const m=this.monitor.records.get(r.event.id);
    const evidence=m?{v3State:m.v3.state,v3Reason:m.v3.reason,v4State:m.v4.state,v4Reason:m.v4.reason,pullback:m.v3.evidence?.pullback??null,continuationV3:m.v3.evidence?.continuation??null,continuationV4:m.v4.evidence?.continuation??null,volume:m.v3.evidence?.volume??null}:null;
    if(JSON.stringify(evidence)!==r.evidence){this.write({type:'CLUE',eventId:r.event.id,evidence});r.evidence=JSON.stringify(evidence);}
   }else if(type==='TICKER'){
    const t=input.ticker;
    if(!Number.isFinite(t?.lastPrice)||t.lastPrice<=0||!Number.isSafeInteger(t.observedAtMs)||t.observedAtMs>at||at-t.observedAtMs>=30000||t.observedAtMs<r.event.detectedAtMs||
     !Number.isSafeInteger(t.exchangeAtMs)||t.exchangeAtMs<r.event.barClosedAtMs||t.exchangeAtMs>at||at-t.exchangeAtMs>=30000){
      if(!r.staleTicker){r.gaps++;this.write({type:'GAP',eventId:r.event.id,reason:'STALE_OR_INVALID_TICKER'});r.staleTicker=true;}continue;
    }
    if(t.observedAtMs<=r.lastTicker||t.observedAtMs>end)continue;
    r.staleTicker=false;r.lastTicker=t.observedAtMs;r.lastPrice=t.lastPrice;r.priceAtMs=t.observedAtMs;
    this.extremes(r,[t.lastPrice]);this.monitor.onTicker(input.symbol,{...t,observedAtMs:t.sourceObservedAtMs??t.observedAtMs});
    const quote={price:t.lastPrice,observedAtMs:t.observedAtMs,exchangeAtMs:t.exchangeAtMs,sourceObservedAtMs:t.sourceObservedAtMs??null,quoteVolume24h:t.quoteVolume24h??null};
    const bucketAtMs=Math.floor(t.observedAtMs/10000)*10000;
    if(r.bucket&&r.bucket.bucketAtMs!==bucketAtMs)this.flushTicker(r);
    if(!r.bucket)r.bucket={bucketAtMs,durationMs:10000,count:0,first:quote,high:quote,low:quote};
    r.bucket.count++;r.bucket.last=quote;
    if(t.lastPrice>r.bucket.high.price)r.bucket.high=quote;
    if(t.lastPrice<r.bucket.low.price)r.bucket.low=quote;
    r.bucket.mfePct=r.mfe;r.bucket.maePct=r.mae;
   }
   if(r.bucket&&at>=r.bucket.bucketAtMs+10000)this.flushTicker(r);
   if(at-r.lastEnd>=90000&&!r.staleBar){r.gaps++;r.staleBar=true;this.write({type:'GAP',eventId:r.event.id,reason:'STALE_CANDLE'});}
   if(at-r.lastEnd<90000)r.staleBar=false;
   if(at-(r.lastTicker??r.event.detectedAtMs)>=30000&&!r.staleTicker){r.gaps++;r.staleTicker=true;this.write({type:'GAP',eventId:r.event.id,reason:'TICKER_FEED_STALE'});}
   this.transition(r,type==='TICKER'?input.ticker:null);
   if(type==='DECISION_BAR'&&r.lastEnd===end&&at>=end)this.finish(r,'WINDOW_ENDED');
  }
 }
 close(){for(const r of [...this.active.values()]){r.gaps++;this.finish(r,'SHUTDOWN');}this.store.close();}
}

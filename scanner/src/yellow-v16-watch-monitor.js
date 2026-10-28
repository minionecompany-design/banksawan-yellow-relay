/** V16 optional READ-ONLY monitor. No new Binance connection or FCM.
 * Receives the existing production LONG A and native closed candles only.
 * A restart loses continuity intentionally; never restore stale decisions.
 */
import {newReadinessWatch,advanceReadinessWatch,observeReadinessQuote} from './entry-readiness-v3.js';
import {newContinuationWatchV4,advanceContinuationWatchV4,observeContinuationQuoteV4} from './entry-continuation-v4.js';
import {decideSecondSignal1m,SECOND_SIGNAL_COMPOSITOR} from './second-signal-compositor-1m.js';
import {validAnalysisEventId} from './analysis-companion.js';
export const V16_MONITOR_METHOD='YELLOW_V16_WATCH_ONLY_1M';
const M=60_000,WINDOW=360*M;
const validPrice=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
export class YellowV16WatchMonitor {
 constructor({clock=()=>Date.now(),maxRecords=100}={}){
   if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>200)throw Error('INVALID_MONITOR_CAP');
   this.clock=clock;this.maxRecords=maxRecords;this.records=new Map();
   this.metrics={accepted:0,excluded:0,candleUpdates:0,duplicate:0,errors:0,expired:0,resets:0};
   this.enabled=true;
 }
 resetContinuity(reason='WS_RECOVERY_CONTINUITY_LOST'){
   if(!this.enabled)return;
   // Old 1M candidate cannot be reconstructed across a broken market stream.
   // Unlike a fatal monitor fault, NEW original LONG A may start a fresh watch.
   this.records.clear();this.metrics.resets++;
   this.metrics.lastResetReason=String(reason).slice(0,90);
 }
 disable(reason='MONITOR_FAULT'){
   this.enabled=false;this.records.clear();this.metrics.errors++;
   this.metrics.disabledReason=String(reason).slice(0,90);
 }
 capture(event,snapshot){
   if(!this.enabled)return false;
   if(event?.timeframe!=='1m'){this.metrics.excluded++;return false;}
   if(!validAnalysisEventId(event?.id)||event.signal!=='LONG_A'||
      event.id!==`${event.symbol}:1m:${event.barClosedAtMs}:LONG_A`||
      !validPrice(event.price)||!Number.isSafeInteger(event.detectedAtMs)||
      event.detectedAtMs<event.barClosedAtMs||event.detectedAtMs-event.barClosedAtMs>300_000)
      return false;
   if(this.records.has(event.id)){this.metrics.duplicate++;return false;}
   this.prune();
   if(this.records.size>=this.maxRecords){
     // Capacity exhaustion disables ONLY the second signal, not the 4-TF scanner.
     this.disable('MONITOR_CAPACITY');return false;
   }
   try{
     const v3=newReadinessWatch(event,event.detectedAtMs);
     const v4=newContinuationWatchV4(event,event.detectedAtMs);
     this.records.set(event.id,{event:structuredClone(event),v3,v4,
       baseSnapshot:structuredClone(snapshot),lastSnapshot:structuredClone(snapshot),
       riskLatchedAtMs:null,priorityLatchedAtMs:null,
       lastClosedAtMs:event.barClosedAtMs,invalid:false});
     this.metrics.accepted++;return true;
   }catch(e){this.metrics.errors++;return false;}
 }
 onClosedBar(symbol,timeframe,bar,snapshot){
   if(!this.enabled||timeframe!=='1m'||!bar||!Number.isSafeInteger(bar.endMs))return false;
   let updated=false;
   for(const r of this.records.values())if(r.event.symbol===symbol&&!r.invalid&&
       bar.endMs>r.lastClosedAtMs&&bar.endMs<=r.event.barClosedAtMs+WINDOW){
     try{
       if(bar.endMs!==r.lastClosedAtMs+M){
         r.invalid=true;continue;
       }
       const now=this.clock();
       const context=structuredClone(snapshot);
       r.v3=advanceReadinessWatch(r.v3,bar,context,now);
       r.v4=advanceContinuationWatchV4(r.v4,bar,context,now);
       r.lastSnapshot=context;r.lastClosedAtMs=bar.endMs;
       if(r.v3.state==='DATA_GAP'||r.v4.state==='DATA_GAP')r.invalid=true;
       else this.latch(r,null,now);
       this.metrics.candleUpdates++;updated=true;
     }catch(e){r.invalid=true;this.metrics.errors++;}
   }
   this.prune();return updated;
 }
 onTicker(symbol,ticker){
   if(!this.enabled||ticker?.observedAtMs>this.clock())return;
   for(const r of this.records.values())if(r.event.symbol===symbol&&!r.invalid){
     try{
       const now=this.clock();
       if(now-r.lastClosedAtMs>=90_000)continue;
       r.v3=observeReadinessQuote(r.v3,ticker,now);
       r.v4=observeContinuationQuoteV4(r.v4,ticker,now);
       this.latch(r,ticker,now);
     }catch(e){r.invalid=true;this.metrics.errors++;}
   }
 }
 latch(r,ticker,now){
   if(r.invalid||r.riskLatchedAtMs!==null)return;
   // Even a transient structural breakdown must never return from
   // "HINDARI" to "TUNGGU" while same LONG A is being monitored.
   const d=decideSecondSignal1m({event:r.event,v3:r.v3,v4:r.v4,
     snapshot:r.lastSnapshot,ticker,nowMs:now});
   if(d.status==='RED')r.riskLatchedAtMs=now;
   else if(d.priority===true&&r.priorityLatchedAtMs===null)r.priorityLatchedAtMs=now;
 }
 view(eventId,ticker,now=this.clock()){
   const r=this.records.get(eventId);
   if(!this.enabled||!r||r.event.timeframe!=='1m')return null;
   const ended=now>=r.event.barClosedAtMs+WINDOW;
   const validClock=Number.isSafeInteger(now)&&now>=r.event.barClosedAtMs;
   const freshCandle=validClock&&r.lastClosedAtMs>=r.event.barClosedAtMs&&
     now-r.lastClosedAtMs<90_000;
   const hasGap=r.invalid||r.v3.state==='DATA_GAP'||r.v4.state==='DATA_GAP';
   let status='WAIT',reason='WAIT_CONFIRMATION';
   if(!validClock||hasGap||!freshCandle){status='OFF';reason=hasGap?'NATIVE_DATA_GAP':'STALE_CANDLE';}
   else if(ended){status='OFF';reason='WATCH_WINDOW_ENDED';}
   else{
     this.latch(r,ticker,now);
     if(r.riskLatchedAtMs!==null){status='AVOID';reason='RISK_LATCHED';}
     else if(r.priorityLatchedAtMs!==null){status='PRIORITY';reason='STRUCTURE_WATCH_PRIORITY';}
     else if(r.v3.state==='ENDED'&&r.v4.state==='ENDED'){status='OFF';reason='WATCHES_ENDED';}
   }
   const validTicker=ticker&&validPrice(ticker.lastPrice)&&Number.isSafeInteger(ticker.observedAtMs)&&
     ticker.observedAtMs<=now&&now-ticker.observedAtMs<30_000&&
     ticker.observedAtMs>=r.event.barClosedAtMs;
   return {method:V16_MONITOR_METHOD,schemaVersion:1,mode:'WATCH_ONLY',eventId,
     status,reason,checkedAtMs:now,lastBarEndMs:r.lastClosedAtMs,
     startedAtMs:r.event.barClosedAtMs,watchUntilMs:r.event.barClosedAtMs+WINDOW,
     priority:r.priorityLatchedAtMs!==null,priorityAtMs:r.priorityLatchedAtMs,
     riskAtMs:r.riskLatchedAtMs,
     priceChangeSinceAPct:validTicker?Number(((ticker.lastPrice/r.event.price-1)*100).toFixed(4)):null,
     tickerAtMs:validTicker?ticker.observedAtMs:null,
     entryAllowed:false,entryPrice:null,stopLoss:null,tp1:null,
     source:SECOND_SIGNAL_COMPOSITOR};
 }
 prune(){
   const now=this.clock();
   for(const [id,r] of this.records)if(now>r.event.barClosedAtMs+WINDOW+120_000){
     this.records.delete(id);this.metrics.expired++;
   }
 }
 status(){return {enabled:this.enabled,mode:'WATCH_ONLY',method:V16_MONITOR_METHOD,
   active:this.records.size,...this.metrics};}
}

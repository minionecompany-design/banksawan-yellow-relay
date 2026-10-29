/** V17 isolated four-TF WATCH-ONLY lifecycle prototype.
 * No scanner hook, network, FCM, orders or Android contract until reviewed.
 * A timeframe-specific evidence evaluator is mandatory: this module does NOT
 * promote a 1m V3/V4 decision into a 5m/15m/1h decision.
 */
export const V17_FRAMES=Object.freeze({'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000});
export const V17_WINDOW_MS=120*60_000;
export const V17_METHOD='YELLOW_V17_FOUR_TF_WATCH_ONLY';
const validTime=x=>Number.isSafeInteger(x)&&x>0;
const validPrice=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
export class YellowV17WatchLifecycle {
  constructor({clock=()=>Date.now(),maxRecords=100}={}){
    if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>200)throw Error('INVALID_CAP');
    this.clock=clock;this.maxRecords=maxRecords;this.records=new Map();
    this.metrics={accepted:0,duplicate:0,rejected:0,expired:0,resets:0};
  }
  capture(event){
    const ms=V17_FRAMES[event?.timeframe],now=this.clock();
    if(!ms||event?.signal!=='LONG_A'||!validTime(event.barClosedAtMs)||
       !validTime(event.detectedAtMs)||event.detectedAtMs<event.barClosedAtMs||
       event.detectedAtMs-event.barClosedAtMs>5*60_000||
       event.barClosedAtMs>now||!validPrice(event.price)||
       typeof event.symbol!=='string'||!/^[A-Z0-9]{2,30}$/.test(event.symbol)||
       event.id!==`${event.symbol}:${event.timeframe}:${event.barClosedAtMs}:LONG_A`){
      this.metrics.rejected++;return false;
    }
    this.prune();
    if(this.records.has(event.id)){this.metrics.duplicate++;return false;}
    if(this.records.size>=this.maxRecords){this.metrics.rejected++;return false;}
    this.records.set(event.id,{event:{...event},lastBarEndMs:event.barClosedAtMs,
      invalid:false,riskAtMs:null,priorityAtMs:null,lastPriorityAtMs:null,
      reason:'WAIT_TF_EVIDENCE'});
    this.metrics.accepted++;return true;
  }
  /** Only an existing native closed candle may advance continuity. */
  onClosedBar(symbol,timeframe,bar){
    const step=V17_FRAMES[timeframe];
    if(!step||!validTime(bar?.endMs))return 0;
    let updated=0;
    for(const r of this.records.values()){
      if(r.event.symbol!==symbol||r.event.timeframe!==timeframe||r.invalid||
         bar.endMs<=r.lastBarEndMs)continue;
      if(bar.endMs!==r.lastBarEndMs+step||bar.endMs>this.clock()||
         bar.endMs>r.event.barClosedAtMs+V17_WINDOW_MS){
        r.invalid=true;r.reason='NATIVE_DATA_GAP';continue;
      }
      r.lastBarEndMs=bar.endMs;updated++;
    }
    return updated;
  }
  /** Evidence MUST come from an independently validated timeframe evaluator.
   * This lifecycle intentionally does not implement trading/priority heuristics.
   */
  observeDecision(eventId,{status,reason,atMs}={}){
    const r=this.records.get(eventId),now=this.clock();
    if(!r||r.invalid||!validTime(atMs)||atMs>now||
       atMs<r.event.barClosedAtMs||atMs>=r.event.barClosedAtMs+V17_WINDOW_MS||
       !['WAIT','PRIORITY','AVOID'].includes(status))return false;
    if(status==='AVOID'&&r.riskAtMs===null)r.riskAtMs=atMs;
    if(status==='PRIORITY'&&r.riskAtMs===null){
      if(r.priorityAtMs===null)r.priorityAtMs=atMs;
      r.lastPriorityAtMs=atMs;
    }
    r.reason=String(reason??'EVIDENCE_RECORDED').slice(0,80);return true;
  }
  view(eventId,now=this.clock()){
    const r=this.records.get(eventId);
    if(!r)return null;
    const end=r.event.barClosedAtMs+V17_WINDOW_MS;
    const stale=!validTime(now)||now<r.event.barClosedAtMs||
      now-r.lastBarEndMs>=Math.min(90_000,V17_FRAMES[r.event.timeframe]+30_000);
    let status='WAIT',reason=r.reason;
    if(now>=end){status='OFF';reason='WATCH_WINDOW_ENDED';}
    else if(r.invalid||stale){status='OFF';reason=r.invalid?'NATIVE_DATA_GAP':'STALE_CANDLE';}
    else if(r.riskAtMs!==null){status='AVOID';reason='RISK_LATCHED';}
    else if(r.lastPriorityAtMs!==null&&now-r.lastPriorityAtMs<=5*60_000){
      status='PRIORITY';reason='FRESH_TF_EVIDENCE';
    }
    return {method:V17_METHOD,mode:'WATCH_ONLY',eventId,timeframe:r.event.timeframe,
      status,reason,checkedAtMs:now,lastBarEndMs:r.lastBarEndMs,
      watchUntilMs:end,entryAllowed:false,entryPrice:null,stopLoss:null,tp1:null};
  }
  resetContinuity(){this.records.clear();this.metrics.resets++;}
  prune(){
    const now=this.clock();
    for(const [id,r] of this.records)if(now>r.event.barClosedAtMs+V17_WINDOW_MS+120_000){
      this.records.delete(id);this.metrics.expired++;
    }
  }
}

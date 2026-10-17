/**
 * YELLOW GOLD V1 -- optional, fail-open capture bridge.
 * Reuses the existing CandleBook's CLOSED candles only.
 * No Binance REST/WS, no HOME/FCM writes, no signal suppression.
 */
import path from 'node:path';
import {QualityCaptureV1} from './quality-capture-v1.js';
import {QualityCaptureStoreV1} from './quality-capture-store-v1.js';

const DEFAULT_WRITE_GAP_MS=5*60_000;
export class QualityCaptureBridgeV1 {
  constructor({dataDir,clock=()=>Date.now(),log=()=>{},capture=null,store=null,
    writeGapMs=DEFAULT_WRITE_GAP_MS}={}){
    if(!dataDir&&!store)throw Error('RESEARCH_DATA_DIR_REQUIRED');
    if(!Number.isSafeInteger(writeGapMs)||writeGapMs<0||writeGapMs>60*60_000)
      throw Error('INVALID_WRITE_GAP');
    this.clock=clock;this.log=log;this.capture=capture||new QualityCaptureV1({clock});
    this.store=store||new QualityCaptureStoreV1({
      filename:path.join(dataDir,'yellow-gold-research-v1.json')});
    this.writeGapMs=writeGapMs;
    this.enabled=false;this.initialized=false;this.dirty=false;this.writing=null;this.timer=null;
    this.lastWriteAtMs=0;
    this.metrics={accepted:0,updated:0,persisted:0,rejected:0,storageFailures:0,lastFault:null};
  }
  #report(reason){
    this.metrics.lastFault=String(reason).slice(0,160);
    // Research logging must not crash the scanner either.
    try{this.log('YELLOW_GOLD_RESEARCH_FAULT',this.metrics.lastFault);}catch{}
  }
  #disable(reason){
    this.enabled=false;this.dirty=false;
    if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
    this.metrics.storageFailures++;
    this.#report(reason);
  }
  async initialize(){
    if(this.initialized)return this.enabled;
    this.initialized=true;
    try {
      const existing=await this.store.restore();
      if(existing)this.capture.restore(existing);
      this.enabled=true;
      return true;
    }catch(e){this.#disable('RESTORE_'+(e?.message||'UNKNOWN'));return false;}
  }
  onAcceptedLongA(event,closedTargetBars){
    if(!this.enabled)return {accepted:false,reason:'RESEARCH_DISABLED'};
    try{
      const result=this.capture.acceptLongA(event,closedTargetBars);
      if(result.accepted){this.metrics.accepted++;this.#schedule();}
      else this.metrics.rejected++;
      return result;
    }catch(e){this.#disable('EVENT_'+(e?.message||'UNKNOWN'));
      return {accepted:false,reason:'RESEARCH_FAULT'};}
  }
  onClosedBar(symbol,timeframe,bar){
    if(!this.enabled)return {updated:0};
    try {
      const result=this.capture.acceptClosedBar(symbol,timeframe,bar);
      if(result.updated){this.metrics.updated+=result.updated;this.#schedule();}
      return result;
    }catch(e){this.#disable('BAR_'+(e?.message||'UNKNOWN'));return {updated:0};}
  }
  #schedule(){
    this.dirty=true;
    if(!this.enabled||this.writing||this.timer!==null)return;
    const gap=this.lastWriteAtMs?Math.max(0,this.writeGapMs-(this.clock()-this.lastWriteAtMs)):0;
    this.timer=setTimeout(()=>{this.timer=null;void this.#persist();},gap);
    this.timer.unref?.();
  }
  async #persist(){
    if(!this.enabled||this.writing||!this.dirty)return;
    this.dirty=false;
    this.writing=(async()=>{
      try{
        const snapshot=this.capture.snapshot();
        await this.store.save(snapshot);
        this.lastWriteAtMs=this.clock();
        this.metrics.persisted++;
      }catch(e){this.#disable('WRITE_'+(e?.message||'UNKNOWN'));}
    })();
    await this.writing;this.writing=null;
    if(this.enabled&&this.dirty)this.#schedule();
  }
  /** Optional bounded graceful flush, useful in offline acceptance tests. */
  async flush(){
    if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
    if(this.writing)await this.writing;
    if(this.enabled&&this.dirty)await this.#persist();
    return this.enabled;
  }
  status(){
    return {enabled:this.enabled,initialized:this.initialized,
      ...this.metrics,pendingRecords:this.capture.snapshot().records.length};
  }
}

/** Opt-in companion. CPU work is deferred until AFTER original FCM delivery.
 * Its bounded queue and separate atomic journal fail open for the scanner.
 */
import path from 'node:path';
import {AnalysisCompanionStore} from './analysis-companion-store.js';
import {ANALYSIS_METHOD,ANALYSIS_KEYS,ANALYSIS_FRAMES,ANALYSIS_PERIODS,ANALYSIS_HORIZON_MS,
  analyzeLongA,newPaperOutcome,advancePaperOutcome,summarizeAnalysis,validAnalysisEventId} from './analysis-companion.js';

const RETENTION_MS=24*60*60_000;
const ACTIVE=new Set(['WAITING_ENTRY','OPEN']);
const STATES=new Set(['WAITING_ENTRY','OPEN','NO_PLAN','NOT_ENTERED','INCOMPLETE_DATA',
  'TP1_BEFORE_SL','SL_BEFORE_TP1','AMBIGUOUS','TIMEOUT']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const positive=x=>finite(x)&&x>0;

function validRecord(record,now) {
  const a=record?.analysis,p=record?.paper;
  if (!a || !p || a.schemaVersion!==1 || a.method!==ANALYSIS_METHOD || a.mode!=='RESEARCH_ONLY' ||
      !validAnalysisEventId(a.eventId) || a.eventId!==`${a.symbol}:${a.timeframe}:${a.signalAtMs}:LONG_A` ||
      !Number.isSafeInteger(a.capturedAtMs) || a.capturedAtMs<a.signalAtMs || a.capturedAtMs>now ||
      a.capturedAtMs-a.signalAtMs>300_000 || a.expiresAtMs!==a.signalAtMs+900_000 ||
      !['READY','PARTIAL'].includes(a.availability) || !Array.isArray(a.frames) || a.frames.length!==4 ||
      !Array.isArray(a.warnings) || a.warnings.some(w=>typeof w!=='string'||w.length>80) ||
      !STATES.has(p.status) || p.entryAtMs!==Math.ceil(a.capturedAtMs/60_000)*60_000 ||
      p.deadlineMs!==p.entryAtMs+ANALYSIS_HORIZON_MS || !Number.isSafeInteger(p.lastBarEndMs) ||
      p.lastBarEndMs<p.entryAtMs || p.lastBarEndMs>p.deadlineMs ||
      !finite(p.costBps) || p.costBps<0 || p.costBps>1000 || !finite(p.mfePct) || !finite(p.maePct)) return false;
  if (!a.frames.every((f,i)=>f.timeframe===ANALYSIS_FRAMES[i] &&
      (f.availability==='UNAVAILABLE' || f.availability==='READY' &&
       f.candleEndMs===Math.floor(a.signalAtMs/ANALYSIS_PERIODS[f.timeframe])*ANALYSIS_PERIODS[f.timeframe] &&
       [f.close,f.ma7,f.ma25,f.ma99].every(positive) && finite(f.atr14) && f.atr14>=0 &&
       ['UP','DOWN','MIXED'].includes(f.trend) && (f.relativeVolume===null||finite(f.relativeVolume)&&f.relativeVolume>=0)))) return false;
  if (a.frames.every(f=>f.availability==='READY')!==(a.availability==='READY')) return false;
  if (a.levels && (!['BREAKOUT','BREAKDOWN','RETEST','INSIDE_RANGE'].includes(a.levels.interaction) ||
      !['support','resistance','breakoutLevel'].every(k=>a.levels[k]===null||positive(a.levels[k])) ||
      ![a.levels.rangeHigh,a.levels.rangeLow].every(positive))) return false;
  if (a.plan) {
    const q=a.plan;
    if (a.availability!=='READY' || !['referenceEntry','entryLow','entryHigh','stopLoss','tp1','tp2','tp3','riskPct'].every(k=>positive(q[k])) ||
        !(q.stopLoss<q.entryLow && q.entryLow<=q.referenceEntry && q.referenceEntry<=q.entryHigh &&
          q.entryHigh<=q.tp1 && q.tp1<q.tp2 && q.tp2<q.tp3) ||
        !(q.roomToResistanceR===null||finite(q.roomToResistanceR)&&q.roomToResistanceR>0)) return false;
    if (p.status==='NO_PLAN') return false;
  } else if (p.status!=='NO_PLAN') return false;
  if (p.status==='OPEN' && (!positive(p.entryPrice)||!a.plan)) return false;
  if (!['entryPrice','exitPrice'].every(k=>p[k]===null||positive(p[k])) ||
      !['grossReturnPct','netReturnPct'].every(k=>p[k]===null||finite(p[k])) ||
      !(p.endedAtMs===null||Number.isSafeInteger(p.endedAtMs)&&p.endedAtMs<=now)) return false;
  if (['TP1_BEFORE_SL','SL_BEFORE_TP1','TIMEOUT'].includes(p.status) &&
      (!positive(p.entryPrice)||!positive(p.exitPrice)||!finite(p.netReturnPct)||p.endedAtMs===null)) return false;
  return true;
}

export class AnalysisCompanionBridge {
  constructor({dataDir,clock=()=>Date.now(),log=()=>{},store=null,maxRecords=500,maxQueue=128,writeGapMs=300_000}={}) {
    if (!store && !dataDir || !Number.isSafeInteger(maxRecords) || maxRecords<1 || maxRecords>1000 ||
        !Number.isSafeInteger(maxQueue) || maxQueue<1 || maxQueue>512 ||
        !Number.isSafeInteger(writeGapMs) || writeGapMs<0 || writeGapMs>3_600_000) throw Error('INVALID_ANALYSIS_CONFIG');
    this.clock=clock;this.log=log;this.maxRecords=maxRecords;this.maxQueue=maxQueue;this.writeGapMs=writeGapMs;
    this.store=store||new AnalysisCompanionStore(path.join(dataDir,'yellow-analysis-companion-v1.json'));
    this.records=new Map();this.queue=[];this.idle=[];this.scheduled=false;
    this.enabled=false;this.initialized=false;this.dirty=false;this.timer=null;this.writing=null;this.lastWriteAtMs=0;
    this.metrics={captured:0,duplicates:0,rejected:0,droppedJobs:0,evicted:0,persisted:0,failures:0,lastFault:null};
  }
  #disable(reason) {
    this.enabled=false;this.metrics.failures++;this.metrics.lastFault=String(reason).slice(0,160);
    this.queue=[];this.dirty=false;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;
    try{this.log('YELLOW_ANALYSIS_FAULT',this.metrics.lastFault);}catch{}
    this.#resolveIdle();
  }
  async initialize() {
    if (this.initialized) return this.enabled;
    this.initialized=true;
    try {
      const doc=await this.store.restore();
      if (doc) {
        if (doc.schemaVersion!==1 || doc.method!==ANALYSIS_METHOD || !Array.isArray(doc.records) ||
            doc.records.length>this.maxRecords || !doc.records.every(r=>validRecord(r,this.clock())) ||
            new Set(doc.records.map(r=>r.analysis.eventId)).size!==doc.records.length) throw Error('INVALID_ANALYSIS_JOURNAL');
        this.records=new Map(doc.records.map(r=>[r.analysis.eventId,structuredClone(r)]));
        if (doc.counters && ['captured','duplicates','rejected','droppedJobs','evicted'].every(k=>
          Number.isSafeInteger(doc.counters[k])&&doc.counters[k]>=0))
          for(const key of ['captured','duplicates','rejected','droppedJobs','evicted'])this.metrics[key]=doc.counters[key];
      }
      this.enabled=true;this.#prune();return true;
    } catch(e) {this.#disable('RESTORE_'+e.message);return false;}
  }
  #enqueue(job) {
    if (!this.enabled) return false;
    if (this.queue.length>=this.maxQueue) {this.metrics.droppedJobs++;this.#scheduleWrite();return false;}
    this.queue.push(job);
    if(!this.scheduled) {this.scheduled=true;setImmediate(()=>this.#runOne());}
    return true;
  }
  #runOne() {
    if (this.enabled) {
      const job=this.queue.shift();
      if (job) try{job();}catch(e){this.#disable('JOB_'+e.message);}
    }
    if (this.enabled&&this.queue.length) setImmediate(()=>this.#runOne());
    else {this.scheduled=false;this.#resolveIdle();}
  }
  #resolveIdle(){if(!this.queue.length)for(const resolve of this.idle.splice(0))resolve();}
  async waitIdle(){if(this.scheduled||this.queue.length)await new Promise(resolve=>this.idle.push(resolve));}
  capture(event,snapshot) {
    if(!this.enabled)return false;
    const capturedAtMs=event.detectedAtMs??this.clock();
    const copy=Object.fromEntries(Object.values(ANALYSIS_KEYS).map(key=>[key,
      Array.isArray(snapshot?.[key])?snapshot[key].slice(-1000).map(b=>({...b})):null]));
    const frozenEvent={...event};
    return this.#enqueue(()=>{
      this.#prune();
      if(this.records.has(frozenEvent.id)){this.metrics.duplicates++;this.#scheduleWrite();return;}
      let analysis;
      try{analysis=analyzeLongA(frozenEvent,copy,capturedAtMs);}catch{this.metrics.rejected++;this.#scheduleWrite();return;}
      if(this.records.size>=this.maxRecords){
        const evict=[...this.records].find(([,r])=>!ACTIVE.has(r.paper.status));
        if(!evict){this.metrics.rejected++;this.#scheduleWrite();return;}
        this.records.delete(evict[0]);this.metrics.evicted++;
      }
      this.records.set(analysis.eventId,{analysis,paper:newPaperOutcome(analysis)});
      this.metrics.captured++;this.#scheduleWrite();
    });
  }
  onClosedBar(symbol,timeframe,bar) {
    if(timeframe!=='1m'||bar?.endMs>this.clock())return false;
    const copy={...bar};
    return this.#enqueue(()=>{
      this.#prune();
      for(const record of this.records.values())if(record.analysis.symbol===symbol && ACTIVE.has(record.paper.status)){
        const next=advancePaperOutcome(record.analysis,record.paper,copy);
        if(next!==record.paper){record.paper=next;this.#scheduleWrite();}
      }
    });
  }
  #prune() {
    const now=this.clock();
    for(const [id,record] of this.records){
      if(now-record.analysis.capturedAtMs>RETENTION_MS){this.records.delete(id);this.metrics.evicted++;this.#scheduleWrite();}
      else if(ACTIVE.has(record.paper.status)&&now>record.paper.deadlineMs+120_000){
        record.paper={...record.paper,status:'INCOMPLETE_DATA',endedAtMs:now};this.#scheduleWrite();
      }
    }
  }
  get(eventId) {
    if(!this.enabled)return null;
    this.#prune();const record=this.records.get(eventId);
    return record?structuredClone({...record.analysis,paper:record.paper,scenarioExpired:this.clock()>=record.analysis.expiresAtMs}):null;
  }
  has(eventId){return this.enabled&&this.records.has(eventId);}
  summary(){this.#prune();return {...summarizeAnalysis([...this.records.values()]),retentionHours:24,
    capacity:this.maxRecords,evicted:this.metrics.evicted,rejected:this.metrics.rejected,droppedJobs:this.metrics.droppedJobs};}
  status(){return {enabled:this.enabled,initialized:this.initialized,method:ANALYSIS_METHOD,
    pendingJobs:this.queue.length,retainedRecords:this.records.size,...this.metrics};}
  snapshot(){return {schemaVersion:1,method:ANALYSIS_METHOD,records:structuredClone([...this.records.values()]),
    counters:Object.fromEntries(['captured','duplicates','rejected','droppedJobs','evicted'].map(k=>[k,this.metrics[k]]))};}
  #scheduleWrite() {
    this.dirty=true;
    if(!this.enabled||this.writing||this.timer!==null)return;
    const delay=this.lastWriteAtMs?Math.max(0,this.writeGapMs-(this.clock()-this.lastWriteAtMs)):0;
    this.timer=setTimeout(()=>{this.timer=null;void this.#persist();},delay);this.timer.unref?.();
  }
  async #persist() {
    if(!this.enabled||this.writing||!this.dirty)return;
    this.dirty=false;
    this.writing=(async()=>{
      try{await this.store.save(this.snapshot());this.lastWriteAtMs=this.clock();this.metrics.persisted++;}
      catch(e){this.#disable('WRITE_'+e.message);}
    })();
    await this.writing;this.writing=null;
    if(this.enabled&&this.dirty)this.#scheduleWrite();
  }
  async flush() {
    await this.waitIdle();
    if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
    if(this.writing)await this.writing;
    this.#prune();
    if(this.enabled&&this.dirty)await this.#persist();
    if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
    return this.enabled;
  }
}

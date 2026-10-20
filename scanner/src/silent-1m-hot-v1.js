/** Passive 1m LONG_A -> HOT natural-cohort observer.
 * Absolutely no publication, HOME mutations, Binance traffic or trade orders.
 * Counts evaluate CLOSED 1m bars only; HOT's own candle high is never treated
 * as a post-confirmation opportunity (avoids intrabar lookahead).
 */
import {readFile,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const MIN=60_000, WINDOW=120*MIN, RETENTION=7*24*60*MIN;
const HOT_COUNTS=new Set([9,13,14,15,16]);
const symbolOK=s=>/^[A-Z0-9]{2,25}USDT$/.test(s||'');
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const pct=(a,b)=>Math.round((a/b-1)*10000)/100;
const blank=()=>({events:0,pending:0,completed:0,incomplete:0,
  withHot:0,hot1:0,hot2:0,hot3:0,positiveAfterHot:0,
  candidateConfirmed:0,weakWithoutConfirmation:0,strongWithoutConfirmation:0,
  strongAfterConfirmation:0,weakAfterConfirmation:0});
const validBar=b=>Number.isSafeInteger(b?.endMs)&&b.endMs>0&&b.endMs%MIN===0&&
  [b.open,b.high,b.low,b.close].every(x=>finite(x)&&x>0)&&
  b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high);

export class Silent1mHotV1 {
  constructor({filename,clock=()=>Date.now(),log=()=>{},maxRecords=240,writeGapMs=60_000}={}){
    if(typeof filename!=='string'||!path.isAbsolute(filename)||!filename.endsWith('.json'))
      throw Error('INVALID_SILENT_SHADOW_PATH');
    if(!Number.isSafeInteger(maxRecords)||maxRecords<10||maxRecords>1000)
      throw Error('INVALID_SILENT_SHADOW_LIMIT');
    this.filename=filename;this.clock=clock;this.log=log;this.maxRecords=maxRecords;
    this.writeGapMs=writeGapMs;this.enabled=false;this.initialized=false;
    this.rows=[];this.dirty=false;this.timer=null;this.writing=null;this.lastWriteAtMs=0;
    this.metrics={persisted:0,evicted:0,storageFailures:0,lastFault:null};
  }
  fail(reason){
    this.enabled=false;this.metrics.storageFailures++;
    this.metrics.lastFault=String(reason).slice(0,120);
    if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
    try{this.log('YELLOW_1M_HOT_SHADOW_FAULT',this.metrics.lastFault);}catch{}
  }
  async initialize(){
    if(this.initialized)return this.enabled;
    this.initialized=true;
    try{
      let saved=null;
      try{saved=JSON.parse(await readFile(this.filename,'utf8'));}
      catch(e){if(e?.code!=='ENOENT')throw e;}
      if(saved!==null){
        if(saved.version!==1||saved.mode!=='SILENT_RESEARCH'||!Array.isArray(saved.records)||
           saved.records.length>this.maxRecords)throw Error('INVALID_SILENT_RESEARCH_DATA');
        for(const r of saved.records)
          if(!symbolOK(r.symbol)||!finite(r.startPrice)||r.startPrice<=0||
             !Number.isSafeInteger(r.startMs)||r.startMs<=0||
             !['PENDING','COMPLETE','INCOMPLETE'].includes(r.status))
            throw Error('INVALID_SILENT_RESEARCH_RECORD');
        this.rows=saved.records;
      }
      this.enabled=true;this.trim();
    }catch(e){this.fail('RESTORE_'+(e?.message||'UNKNOWN'));}
    return this.enabled;
  }
  trim(){
    const before=this.rows.length,cutoff=this.clock()-RETENTION;
    this.rows=this.rows.filter(x=>x.startMs>=cutoff);
    if(this.rows.length>this.maxRecords){
      this.rows.splice(0,this.rows.length-this.maxRecords);
    }
    this.metrics.evicted+=before-this.rows.length;
  }
  dirtySoon(){
    if(!this.enabled)return;
    this.dirty=true;
    if(this.timer!==null||this.writing)return;
    const gap=this.lastWriteAtMs?Math.max(0,this.writeGapMs-(this.clock()-this.lastWriteAtMs)):0;
    this.timer=setTimeout(()=>{this.timer=null;void this.flush();},gap);
    this.timer.unref?.();
  }
  async flush(){
    if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
    if(!this.enabled||!this.dirty)return;
    if(this.writing){await this.writing; if(this.enabled&&this.dirty)return this.flush();return;}
    this.dirty=false;
    const json=JSON.stringify({version:1,mode:'SILENT_RESEARCH',records:this.rows});
    this.writing=(async()=>{
      let tmp=null;
      try{
        if(Buffer.byteLength(json,'utf8')>2*1024*1024)throw Error('SHADOW_FILE_TOO_LARGE');
        await mkdir(path.dirname(this.filename),{recursive:true});
        tmp=this.filename+'.tmp.'+randomUUID();
        await writeFile(tmp,json,{encoding:'utf8',flag:'wx',mode:0o600});
        await rename(tmp,this.filename);
        this.lastWriteAtMs=this.clock();this.metrics.persisted++;
      }catch(e){this.fail('PERSIST_'+(e?.message||'UNKNOWN'));if(tmp)try{await unlink(tmp);}catch{}}
    })();
    try{await this.writing;}finally{this.writing=null;}
    if(this.enabled&&this.dirty)this.dirtySoon();
  }
  onLongA(e){
    if(!this.enabled)return;
    try{
      if(e?.signal!=='LONG_A'||e.timeframe!=='1m'||!symbolOK(e.symbol)||
         !Number.isSafeInteger(e.barClosedAtMs)||e.barClosedAtMs<=0||
         !finite(e.price)||e.price<=0||e.id!==e.symbol+':1m:'+e.barClosedAtMs+':LONG_A')
        return;
      if(this.rows.some(x=>x.id===e.id))return;
      this.rows.push({id:e.id,symbol:e.symbol,startMs:e.barClosedAtMs,startPrice:e.price,
        endMs:e.barClosedAtMs+WINDOW,lastEndMs:e.barClosedAtMs,
        status:'PENDING',high:e.price,low:e.price,hot:[],
        selected:null,afterHigh:null,afterLow:null});
      this.trim();this.dirtySoon();
    }catch(e){this.fail('ON_LONG_A_'+(e?.message||'UNKNOWN'));}
  }
  /** Called only when an already-evaluated target 1m candle was closed. */
  onClosedBar(symbol,bar,state){
    if(!this.enabled||!symbolOK(symbol))return;
    try{
      if(!validBar(bar))return;
      let changed=false;
      for(const r of this.rows){
        if(r.symbol!==symbol||r.status!=='PENDING'||bar.endMs<=r.lastEndMs)continue;
        if(bar.endMs-r.lastEndMs!==MIN||bar.endMs>r.endMs){
          r.status='INCOMPLETE';changed=true;continue;
        }
        // Only measure price movement AFTER the original A candle.
        r.high=Math.max(r.high,bar.high);r.low=Math.min(r.low,bar.low);
        // After-confirmation MFE/MAE starts at the NEXT bar, never the HOT bar.
        if(r.selected&&bar.endMs>r.selected.at){
          r.afterHigh=Math.max(r.afterHigh,bar.high);
          r.afterLow=Math.min(r.afterLow,bar.low);
        }
        const hot=state?.tradeState!==0&&HOT_COUNTS.has(state?.countUp);
        if(hot){
          const ordinal=r.hot.length+1;
          r.hot.push({at:bar.endMs,price:bar.close,ordinal,countUp:state.countUp});
          if(!r.selected&&bar.close>r.startPrice){
            r.selected={at:bar.endMs,price:bar.close,ordinal};
            r.afterHigh=bar.close;r.afterLow=bar.close;
          }
        }
        r.lastEndMs=bar.endMs;
        if(bar.endMs===r.endMs)r.status='COMPLETE';
        changed=true;
      }
      if(changed)this.dirtySoon();
    }catch(e){this.fail('ON_BAR_'+(e?.message||'UNKNOWN'));}
  }
  status(){
    const now=this.clock(),sum=blank(),recent=blank();
    for(const r of this.rows){
      for(const z of [sum,...(r.startMs>=now-24*60*MIN?[recent]:[])]){
        z.events++;
        if(r.status==='PENDING'){z.pending++;continue;}
        if(r.status==='INCOMPLETE'){z.incomplete++;continue;}
        z.completed++;
        if(r.hot.length)z.withHot++;
        if(r.hot.length>=1)z.hot1++;
        if(r.hot.length>=2)z.hot2++;
        if(r.hot.length>=3)z.hot3++;
        if(r.hot.some(h=>h.price>r.startPrice))z.positiveAfterHot++;
        if(r.selected){
          z.candidateConfirmed++;
          const post=pct(r.afterHigh,r.selected.price);
          if(post>=5)z.strongAfterConfirmation++;
          if(post<2)z.weakAfterConfirmation++;
        }else{
          const mfe=pct(r.high,r.startPrice);
          if(mfe<2)z.weakWithoutConfirmation++;
          if(mfe>=5)z.strongWithoutConfirmation++;
        }
      }
    }
    return {enabled:this.enabled,initialized:this.initialized,mode:'SILENT_RESEARCH',
      sendsFCM:false,entersHome:false,windowMinutes:120,recordCap:this.maxRecords,
      ...this.metrics,allRetained:sum,last24h:recent};
  }
}

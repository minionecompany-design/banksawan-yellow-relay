/** All Binance REST calls MUST pass through this single process-wide guard.
 * No retries after 418/429/451. A persistent latch stops reconnect storms.
 * The budget only covers this Railway process; it does not know the BR IP budget.
 */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
const BLOCKING = new Set([418,429,451]);
export class CircuitOpen extends Error { constructor(reason){super('BINANCE_CIRCUIT_OPEN:'+reason);this.name='CircuitOpen';} }
/** Transient REST pause only. This is NOT a Binance ban or a persisted hard latch. */
export class RestPaused extends Error {
  constructor(untilMs){super('BINANCE_REST_PAUSED_FOR_IP_WEIGHT_HEADROOM');this.name='RestPaused';this.untilMs=untilMs;}
}
export class RequestGuard {
  constructor({filename, fetchImpl=globalThis.fetch, clock=()=>Date.now(), sleep=ms=>new Promise(r=>setTimeout(r,ms)),
    weightPerMinute=60, minGapMs=750, remoteWeightMax=400, remotePauseMs=90_000, timeoutMs=9000}={}){
    if(!filename)throw new Error('PERSISTENT_CIRCUIT_FILE_REQUIRED');
    this.filename=filename;this.fetchImpl=fetchImpl;this.clock=clock;this.sleep=sleep;
    this.weightPerMinute=weightPerMinute;this.minGapMs=minGapMs;this.remoteWeightMax=remoteWeightMax;
    if(!Number.isFinite(remotePauseMs)||remotePauseMs<65_000)throw new Error('INVALID_REMOTE_WEIGHT_PAUSE');
    this.remotePauseMs=remotePauseMs;this.remotePauseUntilMs=0;
    this.remoteLastObservedWeight=null;this.remotePauses=0;
    this.timeoutMs=timeoutMs;this.charges=[];this.lastRequestAt=0;this.closedReason=null;
    this.serial=Promise.resolve();this.calls=0;this.weight=0;this.statusCounts={};
  }
  async restore(){try{const obj=JSON.parse(await readFile(this.filename,'utf8'));this.closedReason=obj.reason||null;}
    catch(e){if(e.code!=='ENOENT')throw new CircuitOpen('INVALID_PERSISTED_CIRCUIT');}}
  async latch(reason){this.closedReason=reason;await mkdir(path.dirname(this.filename),{recursive:true});
    const temp=this.filename+'.tmp.'+process.pid;
    await writeFile(temp,JSON.stringify({reason,atMs:this.clock()}));await rename(temp,this.filename);
  }
  isRemotePaused(){return this.clock()<this.remotePauseUntilMs;}
  canRequest(){return !this.closedReason&&!this.isRemotePaused();}
  async getJson(url,{weight=1}={}){
    // All entry points serialized to prevent a concurrent burst bypass.
    const job=this.serial.then(()=>this.#perform(url,weight));this.serial=job.catch(()=>{});return job;
  }
  async #perform(url,weight){
    if(this.closedReason)throw new CircuitOpen(this.closedReason);
    if(this.isRemotePaused())throw new RestPaused(this.remotePauseUntilMs);
    const target=new URL(url);
    if(target.protocol!=='https:'||target.hostname!=='fapi.binance.com'||!target.pathname.startsWith('/fapi/v1/'))
      throw new Error('BINANCE_URL_NOT_ALLOWLISTED');
    if(!Number.isInteger(weight)||weight<1||weight>this.weightPerMinute)throw new Error('INVALID_WEIGHT');
    const now=this.clock();this.charges=this.charges.filter(x=>now-x.at<60000);
    const spent=this.charges.reduce((s,x)=>s+x.weight,0);
    if(spent+weight>this.weightPerMinute){
      const delay=60000-(now-this.charges[0].at)+25;
      await this.sleep(Math.max(1,delay));
    }
    const elapsed=this.clock()-this.lastRequestAt;
    if(elapsed<this.minGapMs)await this.sleep(this.minGapMs-elapsed);
    if(this.closedReason)throw new CircuitOpen(this.closedReason);
    if(this.isRemotePaused())throw new RestPaused(this.remotePauseUntilMs);
    const nextNow=this.clock();this.charges=this.charges.filter(x=>nextNow-x.at<60000);
    if(this.charges.reduce((s,x)=>s+x.weight,0)+weight>this.weightPerMinute)
      throw new CircuitOpen('LOCAL_WEIGHT_WINDOW_GUARD');
    this.charges.push({at:nextNow,weight});this.lastRequestAt=nextNow;
    this.calls++;this.weight+=weight;
    let res;
    try{res=await this.fetchImpl(url,{signal:AbortSignal.timeout(this.timeoutMs),headers:{'User-Agent':'banksawan-yellow-v6-safety'}});}
    catch(e){throw new Error('BINANCE_TRANSPORT_FAILED:'+String(e?.message||e));}
    this.statusCounts[res.status]=(this.statusCounts[res.status]||0)+1;
    // HTTP bans ALWAYS win, regardless of the remote weight header.
    if(BLOCKING.has(res.status)){await this.latch('HTTP_'+res.status);throw new CircuitOpen(this.closedReason);}
    const rawWeight=res.headers?.get?.('x-mbx-used-weight-1m');
    const reported=rawWeight===null||rawWeight===undefined||rawWeight===''?NaN:Number(rawWeight);
    if(Number.isFinite(reported)&&reported>=this.remoteWeightMax){
      // Binance header measures IP-wide weight, which may include other consumers.
      // Finish THIS response; defer all FUTURE REST without persisting a hard ban.
      // The pause is at least one rolling 1m window; later probes remain serialized.
      this.remotePauseUntilMs=Math.max(this.remotePauseUntilMs,this.clock()+this.remotePauseMs);
      this.remotePauses++;
    }
    if(Number.isFinite(reported))this.remoteLastObservedWeight=reported;
    if(!res.ok)throw new Error('BINANCE_HTTP_'+res.status);
    return res.json();
  }
  metrics(){return {calls:this.calls,weight:this.weight,statusCounts:{...this.statusCounts},
    circuitOpen:!!this.closedReason,circuitReason:this.closedReason,
    remotePaused:this.isRemotePaused(),remotePauseUntilMs:this.remotePauseUntilMs,
    remoteLastObservedWeight:this.remoteLastObservedWeight,remotePauses:this.remotePauses};}
}
export function klineWeight(limit){return limit<100?1:limit<500?2:limit<=1000?5:10;}

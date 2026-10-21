/** LAB-only fail-closed Binance USD-M REST gate. No retry after 418/429/451.
 * Limit is PER PROCESS; we deliberately undershoot exchange's IP-wide budget.
 */
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const BLOCK=new Set([418,429,451]);
export class LabRestGuard {
  constructor({filename='/data/lab-circuit.json',fetchImpl=globalThis.fetch,clock=()=>Date.now(),
    sleep=ms=>new Promise(r=>setTimeout(r,ms)),budget=20,gapMs=3100,remoteMax=250}={}){
    if(!path.isAbsolute(filename)||!Number.isInteger(budget)||budget<1||budget>30||gapMs<2000||remoteMax>400)
      throw Error('UNSAFE_LAB_REST_GUARD_OPTIONS');
    this.filename=filename;this.fetchImpl=fetchImpl;this.clock=clock;this.sleep=sleep;
    this.budget=budget;this.gapMs=gapMs;this.remoteMax=remoteMax;
    this.used=[];this.lastAt=0;this.serial=Promise.resolve();this.latched=null;this.pauseUntil=0;
    this.calls=0;this.weight=0;this.lastRemoteWeight=null;this.httpStatuses={};
  }
  async init(){try{const d=JSON.parse(await readFile(this.filename,'utf8'));this.latched=d.reason||'CORRUPT_CIRCUIT';}
    catch(e){if(e.code!=='ENOENT')this.latched='CIRCUIT_FILE_UNREADABLE';}}
  async stop(reason){this.latched=String(reason);await mkdir(path.dirname(this.filename),{recursive:true});
    const tmp=this.filename+'.tmp';await writeFile(tmp,JSON.stringify({reason:this.latched,at:this.clock()}));await rename(tmp,this.filename);}
  get blocked(){return !!this.latched||this.clock()<this.pauseUntil;}
  getJson(url,weight=2){const p=this.serial.then(()=>this.#get(url,weight));this.serial=p.catch(()=>{});return p;}
  async #get(url,weight){
    if(this.latched)throw Error('LAB_REST_LATCHED:'+this.latched);
    if(this.clock()<this.pauseUntil)throw Error('LAB_REST_PAUSED_REMOTE_WEIGHT');
    const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='fapi.binance.com'||
      !['/fapi/v1/exchangeInfo','/fapi/v1/klines'].includes(u.pathname))throw Error('LAB_REST_URL_NOT_ALLOWED');
    if(!Number.isInteger(weight)||weight<1||weight>this.budget)throw Error('INVALID_LAB_WEIGHT');
    while(true){
      if(this.latched||this.clock()<this.pauseUntil)throw Error('LAB_REST_BLOCKED');
      const now=this.clock();this.used=this.used.filter(x=>now-x.t<60000);
      const spent=this.used.reduce((a,x)=>a+x.w,0);
      const waitGap=Math.max(0,this.gapMs-(now-this.lastAt));
      if(spent+weight<=this.budget&&waitGap===0)break;
      const waitBudget=spent+weight>this.budget?Math.max(1,60050-(now-this.used[0].t)):0;
      await this.sleep(Math.max(waitGap,waitBudget,1));
    }
    const at=this.clock();this.used.push({t:at,w:weight});this.lastAt=at;
    this.calls++;this.weight+=weight;
    let response;try{response=await this.fetchImpl(url,{signal:AbortSignal.timeout(9000),headers:{'user-agent':'banksawan-yellow-lab-shadow'}});}
    catch(e){throw Error('LAB_REST_TRANSPORT:'+String(e.message));}
    this.httpStatuses[response.status]=(this.httpStatuses[response.status]||0)+1;
    if(BLOCK.has(response.status)){await this.stop('HTTP_'+response.status);throw Error('LAB_REST_LATCHED_HTTP_'+response.status);}
    const raw=response.headers?.get?.('x-mbx-used-weight-1m');const remote=raw==null?NaN:Number(raw);
    if(Number.isFinite(remote)){this.lastRemoteWeight=remote;
      if(remote>=this.remoteMax)this.pauseUntil=this.clock()+120000;}
    if(!response.ok)throw Error('LAB_REST_HTTP_'+response.status);
    return response.json();
  }
  metrics(){return {calls:this.calls,weight:this.weight,budgetPerMinute:this.budget,minGapMs:this.gapMs,
    lastRemoteWeight:this.lastRemoteWeight,paused:this.clock()<this.pauseUntil,circuitOpen:!!this.latched,
    circuitReason:this.latched,httpStatuses:{...this.httpStatuses}};}
}

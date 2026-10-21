/** YELLOW GOLD silent 1M FIRST A -> PROTECT -> selected LONG B.
 * Offline deterministic state machine; event-time deadlines are NEVER extended.
 * Persistent journal protects against duplicate B after restart.
 */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {productEligible,eligibleEvent} from './product-policy.js';
export const EPISODE_WINDOW_MS=120*60_000;
export const PROTECT_WINDOW_MS=90*60_000;
const symbolOK=s=>typeof s==='string'&&/^[A-Z0-9]{2,25}USDT$/.test(s);
const minute=t=>Number.isSafeInteger(t)&&t>0&&t%60_000===0;
const clone=v=>JSON.parse(JSON.stringify(v));

function validEntry(e,sym){
  if(!e||!symbolOK(sym)||e.symbol!==sym||!minute(e.firstAAtMs)||
     !productEligible(e.firstAPrice,e.firstAChangePct,e.firstAQuoteVolume24h)||
     !['OPEN','SELECTED','CANCELLED'].includes(e.status)||
     (e.protectAtMs!==null&&(!minute(e.protectAtMs)||e.protectAtMs<=e.firstAAtMs||
       e.protectAtMs>e.firstAAtMs+EPISODE_WINDOW_MS)))return false;
  if(e.status==='SELECTED'){
    if(!e.selected||e.selected.signal!=='LONG_B'||e.selected.timeframe!=='1m'||
       e.selected.symbol!==sym||!minute(e.selected.barClosedAtMs)||
       e.selected.barClosedAtMs>e.firstAAtMs+EPISODE_WINDOW_MS||
       !minute(e.protectAtMs)||e.selected.barClosedAtMs<=e.protectAtMs||
       e.selected.barClosedAtMs-e.protectAtMs>PROTECT_WINDOW_MS||
       !eligibleEvent(e.selected))return false;
  }
  return true;
}
export class OneMinuteBEpisodes {
  constructor({filename,clock=()=>Date.now()}={}){
    if(!path.isAbsolute(filename))throw Error('EPISODE_ABSOLUTE_PATH_REQUIRED');
    this.filename=filename;this.clock=clock;this.rows=new Map();this.chain=Promise.resolve();
  }
  async restore(){
    let obj;
    try{obj=JSON.parse(await readFile(this.filename,'utf8'));}
    catch(e){if(e.code==='ENOENT')return;throw Error('EPISODE_JOURNAL_UNREADABLE');}
    if(obj?.version!==1||!Array.isArray(obj.rows))throw Error('EPISODE_JOURNAL_INVALID');
    const next=new Map();
    for(const item of obj.rows){
      if(!validEntry(item,item?.symbol)||next.has(item.symbol))throw Error('EPISODE_ROW_INVALID');
      next.set(item.symbol,clone(item));
    }
    this.rows=next;
  }
  #prune(){
    const now=this.clock();
    for(const [sym,e] of this.rows)if(now-e.firstAAtMs>24*60*60_000)
      this.rows.delete(sym);
  }
  async #commit(){
    this.#prune();
    const body=JSON.stringify({version:1,rows:[...this.rows.values()]});
    await mkdir(path.dirname(this.filename),{recursive:true});
    const temp=this.filename+'.tmp';
    await writeFile(temp,body,'utf8');await rename(temp,this.filename);
  }
  async #serial(work){
    const next=this.chain.then(work);this.chain=next.catch(()=>{});return next;
  }
  active(symbol,atMs=this.clock()){
    const e=this.rows.get(symbol);
    return !!e&&e.status==='OPEN'&&atMs>=e.firstAAtMs&&
      atMs<=e.firstAAtMs+EPISODE_WINDOW_MS;
  }
  activeSymbols(atMs=this.clock()){
    return [...this.rows.keys()].filter(s=>this.active(s,atMs));
  }
  status(){
    const at=this.clock();
    return {active:this.activeSymbols(at).length,selected:[...this.rows.values()].filter(e=>e.status==='SELECTED').length};
  }
  async cancel(symbol,reason='COVERAGE_LOST'){
    return this.#serial(async()=>{
      const e=this.rows.get(symbol);
      if(!e||e.status!=='OPEN')return false;
      e.status='CANCELLED';e.reason=String(reason).slice(0,80);
      await this.#commit();return true;
    });
  }
  async observe(event,{quoteVolumeAtA}={}){
    return this.#serial(async()=>{
      if(!event||event.timeframe!=='1m'||!symbolOK(event.symbol)||
         !minute(event.barClosedAtMs)||!['LONG_A','PROTECT','LONG_B','OUT_FINAL'].includes(event.signal)||
         event.id!==event.symbol+':1m:'+event.barClosedAtMs+':'+event.signal)
        return {status:'INVALID'};
      const t=event.barClosedAtMs,sym=event.symbol;
      const existing=this.rows.get(sym);
      if(event.signal==='LONG_A'){
        // Fresh starts never extend an existing episode, even if LONG A repeats.
        if(existing&&t<=existing.firstAAtMs+EPISODE_WINDOW_MS)
          return {status:'EPISODE_ALREADY_EXISTS'};
        if(!productEligible(event.price,event.binance24hChangePct,quoteVolumeAtA))
          return {status:'FIRST_A_NOT_ELIGIBLE'};
        this.rows.set(sym,{symbol:sym,firstAAtMs:t,firstAPrice:event.price,
          firstAChangePct:event.binance24hChangePct,firstAQuoteVolume24h:quoteVolumeAtA,
          protectAtMs:null,status:'OPEN'});
        await this.#commit();return {status:'FIRST_A_PINNED'};
      }
      if(!existing||existing.status!=='OPEN'||t<=existing.firstAAtMs||
         t>existing.firstAAtMs+EPISODE_WINDOW_MS)
        return {status:'NOT_IN_OPEN_EPISODE'};
      if(event.signal==='OUT_FINAL'){
        existing.status='CANCELLED';existing.reason='PINE_OUT_FINAL';
        await this.#commit();return {status:'CANCELLED'};
      }
      if(event.signal==='PROTECT'){
        if(existing.protectAtMs===null||t>existing.protectAtMs){
          existing.protectAtMs=t;await this.#commit();return {status:'PROTECTED'};
        }
        return {status:'PROTECT_DUPLICATE'};
      }
      if(event.signal==='LONG_B'){
        if(existing.protectAtMs===null||t<=existing.protectAtMs||
           t-existing.protectAtMs>PROTECT_WINDOW_MS)
          return {status:'PROTECT_WINDOW_INVALID'};
        // The event's P/price still originate from the closed 1M evaluation;
        // FIRST A's q is pinned, not silently replaced by today's 24h q.
        const b={...event,quoteVolume24h:existing.firstAQuoteVolume24h,
          episodeStartedAtMs:existing.firstAAtMs,protectAtMs:existing.protectAtMs,
          firstAQuoteVolume24h:existing.firstAQuoteVolume24h,
          firstAChangePct:existing.firstAChangePct,firstAPrice:existing.firstAPrice};
        if(!eligibleEvent(b))return {status:'LONG_B_INELIGIBLE'};
        existing.status='SELECTED';existing.selected=clone(b);
        await this.#commit();return {status:'LONG_B_SELECTED',event:b};
      }
      return {status:'IGNORED'};
    });
  }
}

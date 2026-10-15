/** Durable HOME + dedupe + foreground polling event feed (single process).
 * All writes are serialized + atomic rename. Must use a persistent volume.
 */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
const MAX_AGE=5*60_000, HOME_TTL=24*60*60_000;
const frames=new Set(['1m','5m','15m','1h']);
export class LiveHomeLedger {
  constructor({filename,clock=()=>Date.now()}={}){if(!filename)throw new Error('PERSISTENT_LEDGER_REQUIRED');
    this.filename=filename;this.clock=clock;this.doc={version:1,home:[],events:[],claimed:[]};this.chain=Promise.resolve();}
  async restore(){try{const data=JSON.parse(await readFile(this.filename,'utf8'));
      if(data.version!==1||!Array.isArray(data.home)||!Array.isArray(data.events)||!Array.isArray(data.claimed))
        throw new Error('LEDGER_CORRUPT_FAIL_CLOSED');this.doc=data;
    }catch(e){if(e.code!=='ENOENT')throw e;}this.#prune();}
  #prune(){const now=this.clock();this.doc.home=this.doc.home.filter(x=>x.homeExpiresMs>now);
    this.doc.events=this.doc.events.filter(x=>x.expiresAtMs>now);
    this.doc.claimed=this.doc.claimed.filter(x=>x.expiresAtMs>now);}
  async #persist(){await mkdir(path.dirname(this.filename),{recursive:true});
    const tmp=this.filename+'.tmp.'+process.pid;
    await writeFile(tmp,JSON.stringify(this.doc),'utf8');await rename(tmp,this.filename);}
  async accept(event){const job=this.chain.then(async()=>{
      const now=this.clock();this.#prune();
      if(!event||event.signal!=='LONG_A'||!frames.has(event.timeframe)||
        !/^[A-Z0-9]{2,25}USDT$/.test(event.symbol||'')||
        event.id!==`${event.symbol}:${event.timeframe}:${event.barClosedAtMs}:LONG_A`||
        !Number.isSafeInteger(event.barClosedAtMs)||now<event.barClosedAtMs||now-event.barClosedAtMs>MAX_AGE||
        !(Number.isFinite(event.price)&&event.price>0&&event.price<10)||
        !(Number.isFinite(event.binance24hChangePct)&&event.binance24hChangePct>=1))
        return {accepted:false,reason:'INVALID_OR_EXPIRED_EVENT'};
      if(this.doc.claimed.some(x=>x.id===event.id))return {accepted:false,reason:'DUPLICATE'};
      const record={id:event.id,signal:'LONG_A',symbol:event.symbol,timeframe:event.timeframe,price:event.price,
        binance24hChangePct:event.binance24hChangePct,priority:event.priority,
        barClosedAtMs:event.barClosedAtMs,detectedAtMs:now,expiresAtMs:event.barClosedAtMs+MAX_AGE};
      this.doc.claimed.push({id:event.id,expiresAtMs:event.barClosedAtMs+HOME_TTL});
      this.doc.events.push(record);
      if(!this.doc.home.some(x=>x.symbol===event.symbol))
        this.doc.home.push({...record,firstSeenMs:now,homeExpiresMs:now+HOME_TTL});
      await this.#persist();return {accepted:true,event:record};
    });this.chain=job.catch(()=>{});return job;}
  home(){this.#prune();return this.doc.home.slice().sort((a,b)=>b.firstSeenMs-a.firstSeenMs).map(x=>({...x}));}
  eventsSince(afterMs=0){this.#prune();return this.doc.events.filter(x=>x.detectedAtMs>afterMs).map(x=>({...x}));}
}

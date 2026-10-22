import {TrackedSlots} from './tracked-slots.js';
import {ClosedCandleLanes} from './closed-candle-lanes.js';
import {evaluateCausalLongA} from './evaluate-causal-long-a.js';
import {POLICY} from './product-policy.js';
import {EventJournal} from './event-journal.js';
/** Offline-only orchestrator: no exchange, FCM, Railway or order connectivity. */
export class OfflineYellowScanner {
 constructor({now=Date.now,capacity=POLICY.maxTracked,journalPath=null}={}){
  this.now=now;this.slots=new TrackedSlots(capacity);this.histories=new Map();
  this.events=[];this.claims=new Set();
  this.journal=journalPath?new EventJournal(journalPath):null;
  this.restored=!this.journal;
  this.verifiedBootstraps=new Set();
  this.lanes=new ClosedCandleLanes({now,evaluate:({symbol,timeframe,candle})=>
    evaluateCausalLongA({timeframe,closedAtMs:candle.closedAtMs,histories:this.histories.get(symbol)})});
 }
 async restoreJournal(){
  if(!this.journal)throw Error('JOURNAL_NOT_CONFIGURED');
  await this.journal.restore();this.claims=new Set(this.journal.ids);
  this.events=this.journal.list();this.restored=true;
  // Restart must not replay old candles as fresh alerts. Each timeframe
  // resumes only after an independently verified closed-bar bootstrap.
 }
 admit(rows){return this.slots.update(rows);}
 bootstrapLane(symbol,timeframe,lastClosedAtMs){
  if(!this.restored)throw Error('JOURNAL_RESTORE_REQUIRED');
  if(!this.slots.symbols.includes(symbol))throw Error('SYMBOL_NOT_TRACKED');
  this.lanes.resetAfterVerifiedBootstrap(symbol,timeframe,lastClosedAtMs);
  this.verifiedBootstraps.add(symbol+':'+timeframe);
 }
 /** The caller is responsible for a complete closed-candle source history. */
 setHistory(symbol,histories){
  if(!this.slots.symbols.includes(symbol))throw Error('SYMBOL_NOT_TRACKED');
  this.histories.set(symbol,histories);
 }
 async process({symbol,timeframe,candle,market}){
  if(this.journal && !this.verifiedBootstraps?.has(symbol+':'+timeframe))
   return {status:'BOOTSTRAP_REQUIRED',event:null};
  if(!this.restored)throw Error('JOURNAL_RESTORE_REQUIRED');
  if(!this.slots.symbols.includes(symbol))return {status:'SYMBOL_NOT_TRACKED',event:null};
  if(market?.symbol!==symbol)return {status:'MISMATCHED_MARKET_SYMBOL',event:null};
  const result=this.lanes.process({symbol,timeframe,candle,market});
  if(result.status!=='LONG_A')return result;
  const {event}=result;
  if(this.claims.has(event.id))return {status:'DUPLICATE_EVENT',event:null};
  if(this.journal){
   const accepted=await this.journal.accept(event);
   if(!accepted)return {status:'DUPLICATE_EVENT',event:null};
  }
  this.claims.add(event.id);this.events.push(event);
  return result;
 }
 emitted(){return this.events.map(x=>({...x,market:{...x.market}}));}
}

import {normalizeOfficialUsdmSnapshot} from './official-usdm-feed.js';
import {cleanApiSnapshot} from './api-view.js';
/**
 * Offline source-to-scanner acceptance boundary.
 * No HTTP, credentials, Firebase, Railway or trading orders.
 * The sole supported process() path fails closed on stale/unauthorized feed
 * instead of processing a previously admitted symbol with yesterday's prices.
 */
export class OfficialUsdMScanGate {
 constructor({scanner,now=Date.now,maxAgeMs=90_000}={}){
  if(!scanner||typeof scanner.admit!=='function'||typeof scanner.process!=='function'||
   typeof now!=='function'||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>90_000)
   throw Error('INVALID_USDM_SCAN_GATE');
  this.scanner=scanner;this.now=now;this.maxAgeMs=maxAgeMs;
  this.source=null;this.lastReceivedAt=null;this.rowsBySymbol=new Map();
  this.failedReason='NO_FEED';
 }
 ingest(snapshot){
  const evaluated=normalizeOfficialUsdmSnapshot({...snapshot,nowMs:this.now()});
  if(evaluated.dataState!=='OK'){
   this.source=null;this.lastReceivedAt=null;this.rowsBySymbol.clear();
   this.failedReason=evaluated.reason;
   return Object.freeze({dataState:'UNAVAILABLE',reason:evaluated.reason,
    eligible:null,tracked:null,details:evaluated.details});
  }
  const admission=this.scanner.admit(evaluated.rows);
  this.rowsBySymbol=new Map(evaluated.rows.map(x=>[x.symbol,x]));
  this.source=evaluated;
  this.lastReceivedAt=snapshot.receivedAtMs;
  this.failedReason=null;
  return Object.freeze({dataState:'OK',reason:null,eligible:admission.eligible,
   tracked:admission.tracked.length});
 }
 #ready(){
  if(!this.source||this.failedReason)return false;
  if(this.now()-this.lastReceivedAt>this.maxAgeMs||this.now()<this.lastReceivedAt-5000){
   this.source=null;this.rowsBySymbol.clear();this.lastReceivedAt=null;
   this.failedReason='STALE';return false;
  }
  return true;
 }
 async process(request){
  if(!this.#ready())return {status:'SOURCE_UNAVAILABLE',event:null,reason:this.failedReason};
  const market=this.rowsBySymbol.get(request?.symbol);
  if(!market)return {status:'NOT_OFFICIAL_USDM_SYMBOL',event:null};
  // Never trust request.market from a caller or mismatched ticker data.
  return this.scanner.process({...request,market});
 }
 snapshot(){
  if(!this.#ready())return cleanApiSnapshot({now:this.now(),sourceStatus:this.failedReason});
  return cleanApiSnapshot({rows:this.source.rows,
   trackedSymbols:[...this.scanner.slots.symbols],events:this.scanner.emitted(),
   now:this.now()});
 }
}

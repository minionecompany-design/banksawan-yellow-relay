import {TrackedSlots} from './tracked-slots.js';
import {ClosedCandleLanes} from './closed-candle-lanes.js';
import {evaluateCausalLongA} from './evaluate-causal-long-a.js';
import {POLICY} from './product-policy.js';
/** Offline-only orchestrator: no exchange, FCM, Railway or order connectivity. */
export class OfflineYellowScanner {
 constructor({now=Date.now,capacity=POLICY.maxTracked}={}){
  this.now=now;this.slots=new TrackedSlots(capacity);this.histories=new Map();
  this.events=[];this.claims=new Set();
  this.lanes=new ClosedCandleLanes({now,evaluate:({symbol,timeframe,candle})=>
    evaluateCausalLongA({timeframe,closedAtMs:candle.closedAtMs,histories:this.histories.get(symbol)})});
 }
 admit(rows){return this.slots.update(rows);}
 /** The caller is responsible for a complete closed-candle source history. */
 setHistory(symbol,histories){
  if(!this.slots.symbols.includes(symbol))throw Error('SYMBOL_NOT_TRACKED');
  this.histories.set(symbol,histories);
 }
 process({symbol,timeframe,candle,market}){
  if(!this.slots.symbols.includes(symbol))return {status:'SYMBOL_NOT_TRACKED',event:null};
  if(market?.symbol!==symbol)return {status:'MISMATCHED_MARKET_SYMBOL',event:null};
  const result=this.lanes.process({symbol,timeframe,candle,market});
  if(result.status!=='LONG_A')return result;
  const {event}=result;
  if(this.claims.has(event.id))return {status:'DUPLICATE_EVENT',event:null};
  this.claims.add(event.id);this.events.push(event);
  return result;
 }
 emitted(){return this.events.map(x=>({...x,market:{...x.market}}));}
}

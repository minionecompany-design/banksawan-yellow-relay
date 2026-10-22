import {alertIsAllowed,POLICY} from './product-policy.js';
export const FRAME_MS=Object.freeze({'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000});
/** Stage-1 causal lane controller. Pattern calculation is injected and MUST be
 * independently Pine-parity validated before a production feed is allowed.
 * Never guesses LONG A from price/volume alone. */
export class ClosedCandleLanes {
 constructor({evaluate,now=Date.now}={}){
  if(typeof evaluate!=='function')throw Error('EVALUATOR_REQUIRED');
  this.evaluate=evaluate;this.now=now;this.last=new Map();this.quarantined=new Set();
 }
 process({symbol,timeframe,candle,market}){
  const duration=FRAME_MS[timeframe];
  if(!duration||!typeofSymbol(symbol))return {status:'INVALID_IDENTITY',event:null};
  const key=symbol+':'+timeframe;
  if(this.quarantined.has(key))return {status:'GAP_REBOOTSTRAP_REQUIRED',event:null};
  const end=candle?.closedAtMs;
  if(!Number.isSafeInteger(end)||end<=0||end%duration!==0||
    candle.closed!==true||end>this.now())return {status:'UNCONFIRMED_CANDLE',event:null};
  const previous=this.last.get(key);
  if(previous!==undefined){
   if(end<=previous)return {status:'ALREADY_PROCESSED',event:null};
   if(end-previous!==duration){
    this.quarantined.add(key);
    return {status:'GAP_REBOOTSTRAP_REQUIRED',event:null};
   }
  }
  // Evaluate first, then commit bar cursor: malformed/incomplete MTF input
  // must not be mistaken for a fully processed candle.
  const decision=this.evaluate({symbol,timeframe,candle,market});
  if(!decision||decision.ready!==true)return {status:'INSUFFICIENT_CONFIRMED_MTF',event:null};
  this.last.set(key,end);
  if(decision.longA!==true)return {status:'NO_PATTERN',event:null};
  const event={id:`${symbol}:${timeframe}:${end}:LONG_A`,symbol,timeframe,signal:'LONG_A',
   barClosedAtMs:end,market};
  return alertIsAllowed(event)?{status:'LONG_A',event}:{status:'PRODUCT_FILTER',event:null};
 }
 /** Explicit warmup from independently validated historical candles only. */
 resetAfterVerifiedBootstrap(symbol,timeframe,lastClosedAtMs){
  const d=FRAME_MS[timeframe],key=symbol+':'+timeframe;
  if(!d||!typeofSymbol(symbol)||!Number.isSafeInteger(lastClosedAtMs)||
    lastClosedAtMs<=0||lastClosedAtMs%d!==0)throw Error('INVALID_BOOTSTRAP');
  this.last.set(key,lastClosedAtMs);this.quarantined.delete(key);
 }
}
function typeofSymbol(s){return typeof s==='string'&&/^[A-Z0-9]{2,25}USDT$/.test(s);}

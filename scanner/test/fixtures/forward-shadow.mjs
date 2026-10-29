import {ForwardShadow1m} from '../../src/forward-shadow-1m.js';
import {event as raw,context} from './entry-watch.mjs';
import {T,M} from './analysis-companion.mjs';
export {T,M};
export const config={startedAtMs:T,sourceCommit:'a'.repeat(40),provenance:'SYNTHETIC_QA',maxEvents:1000};
export const event={...raw,signal:'LONG_A'};
export const candle=(i,o,h,l,c,v=100)=>({endMs:T+i*M,open:o,high:h,low:l,close:c,volume:v});
export const stair=()=>[candle(1,1,1.004,1,1.002),candle(2,1.002,1.005,1.001,1.003),
 candle(3,1.003,1.004,1.0015,1.0035),candle(4,1.0035,1.005,1.002,1.004),
 candle(5,1.004,1.005,1.0025,1.0045),candle(6,1.0045,1.0095,1.003,1.009,250)];
export const startInput={type:'LONG_A',event,receivedAtMs:T+5000};
export const warmInput={type:'WARMUP',symbol:event.symbol,candles:context(T),capturedAtMs:T+5000,receivedAtMs:T+6000};
export const native=(bar,at=bar.endMs+1000,timeframe='1m')=>({type:'NATIVE_BAR',symbol:event.symbol,
 timeframe,bar,receivedAtMs:at,exchangeAtMs:bar.endMs+10});
export const quote=(price,at)=>({type:'TICKER',symbol:event.symbol,receivedAtMs:at,
 ticker:{lastPrice:price,observedAtMs:at,exchangeAtMs:at-10,priceChangePercent:2,quoteVolume24h:20_000_000}});
export function inputs(){
 const out=[structuredClone(startInput),structuredClone(warmInput)];
 for(const bar of stair()){
  out.push(native(bar));
  if((bar.endMs-T)%(5*M)===0)out.push(native({endMs:bar.endMs,open:1,high:1.08,low:.99,
    close:1.0015,volume:100},bar.endMs+1500,'5m'));
 }
 return out;
}
export function fixture(){const o=new ForwardShadow1m(config);for(const i of inputs())o.apply(i);return o;}

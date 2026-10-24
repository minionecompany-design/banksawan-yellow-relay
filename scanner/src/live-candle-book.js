/** Strict candle book. Never treats a partial WS bar as closed; no gap bridging. */
import {PERIODS} from './parallel-long-a.js';
import {normalizeBinanceKlines} from './binance-fixture-adapter.js';
export const KEYS={'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'};
const MAX=190;
export class CandleGap extends Error {constructor(code){super(code);this.name='CandleGap';}}
export class CandleBook {
  constructor(symbol,{retainRecoveryHistory=false}={}){this.symbol=symbol;
    this.retainRecoveryHistory=retainRecoveryHistory;
    this.legacyLengths=Object.fromEntries(Object.keys(PERIODS).map(tf=>[tf,MAX]));
    this.limits=retainRecoveryHistory?{'1m':999,'5m':499,'15m':249,'1h':190}:Object.fromEntries(Object.keys(PERIODS).map(tf=>[tf,MAX]));
    this.history=Object.fromEntries(Object.keys(PERIODS).map(tf=>[tf,[]]));}
  bootstrap(tf,rows,nowMs){const bars=normalizeBinanceKlines(rows.filter(r=>Number(r[6])+1<=nowMs),tf,{asOfMs:nowMs});
    if(bars.length<140)throw new CandleGap('INSUFFICIENT_BOOTSTRAP_'+tf);
    this.history[tf]=bars.slice(-this.limits[tf]);
    if(this.retainRecoveryHistory)this.legacyLengths[tf]=Math.min(170,bars.length);
  }
  latest(tf){return this.history[tf]?.at(-1)||null;}
  ingestKline(message,nowMs){
    const k=message?.k,tf=k?.i;
    if(!Object.hasOwn(PERIODS,tf)||k?.s!==this.symbol||k.x!==true)return {status:'IGNORED'};
    const period=PERIODS[tf],start=Number(k.t),end=Number(k.T)+1;
    const open=Number(k.o),high=Number(k.h),low=Number(k.l),close=Number(k.c),volume=Number(k.v);
    if(!Number.isSafeInteger(start)||start%period!==0||end!==start+period||end>nowMs||
      ![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)||
      !Number.isFinite(volume)||volume<0||high<Math.max(open,close)||low>Math.min(open,close))
      throw new CandleGap('MALFORMED_OR_OPEN_KLINE');
    const bars=this.history[tf],prior=bars.at(-1);
    if(prior&&prior.endMs===end)return {status:'DUPLICATE'};
    if(prior&&end-prior.endMs!==period)throw new CandleGap('MISSING_OR_OUT_OF_ORDER_'+tf);
    const bar={endMs:end,open,high,low,close,volume};
    bars.push(bar);if(bars.length>this.limits[tf])bars.shift();
    this.legacyLengths[tf]=Math.min(MAX,this.legacyLengths[tf]+1);
    return {status:'APPENDED',timeframe:tf,endMs:end};
  }
  snapshot(){return Object.fromEntries(Object.entries(KEYS).map(([tf,key])=>[key,this.history[tf].slice(-this.legacyLengths[tf])]));}
  pineSnapshot(){return Object.fromEntries(Object.entries(KEYS).map(([tf,key])=>[key,this.history[tf].slice()]));}
}

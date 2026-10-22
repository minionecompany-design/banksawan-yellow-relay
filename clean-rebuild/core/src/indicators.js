/** Pure indicators from CLOSED, contiguous OHLCV only. No current/open bar. */
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function sma(values,n){if(!Number.isInteger(n)||n<1||values.length<n)return null;const xs=values.slice(-n);return xs.every(finite)?xs.reduce((a,b)=>a+b,0)/n:null;}
export function wilderRsi(closes,period=14){
 if(closes.length<period+1||closes.some(x=>!finite(x)||x<=0))return [];
 let gain=0,loss=0;for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}
 gain/=period;loss/=period;const value=()=>loss===0?(gain===0?50:100):100-100/(1+gain/loss);
 const result=[value()];for(let i=period+1;i<closes.length;i++){const d=closes[i]-closes[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;result.push(value());}return result;
}
export function metrics(bars){
 if(!Array.isArray(bars)||bars.length<112||bars.some(b=>!b||b.closed!==true||!finite(b.close)||b.close<=0||!finite(b.volume)||b.volume<0))return null;
 const c=bars.map(b=>b.close),v=bars.map(b=>b.volume),r=wilderRsi(c),meanVolume=sma(v,20);
 const result={close:c.at(-1),ma7:sma(c,7),ma25:sma(c,25),ma99:sma(c,99),rsi:r.at(-1),rsiAvg:sma(r,14),volRatio:meanVolume>0?v.at(-1)/meanVolume:0};
 return Object.values(result).every(finite)?result:null;
}
export const FRAME_MS=Object.freeze({'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000});
export function validatedBars(bars,tf,end){
 const d=FRAME_MS[tf];if(!d||!Number.isSafeInteger(end)||end<=0||end%d!==0||!Array.isArray(bars)||bars.length<112)return false;
 return bars.every((bar,i)=>bar?.closed===true&&Number.isSafeInteger(bar.closedAtMs)&&bar.closedAtMs>0&&bar.closedAtMs%d===0&&
  (i===0||bar.closedAtMs-bars[i-1].closedAtMs===d))&&bars.at(-1).closedAtMs===end;
}
/** Higher TFs are previous fully closed candles as-of evaluation close, never current TF. */
export function asOfPreviousEnd(evaluationClosedAtMs,targetTf){
 const d=FRAME_MS[targetTf];if(!d||!Number.isSafeInteger(evaluationClosedAtMs)||evaluationClosedAtMs<=0)throw Error('INVALID_AS_OF');
 return Math.floor((evaluationClosedAtMs-1)/d)*d;
}

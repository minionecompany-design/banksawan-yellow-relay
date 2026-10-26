import {ANALYSIS_FRAMES,ANALYSIS_KEYS,ANALYSIS_PERIODS} from '../../src/analysis-companion.js';
export const T=Date.UTC(2026,9,26,12), M=60_000;
export function fixture(tf='1m') {
  const snapshot={};
  for(const frame of ANALYSIS_FRAMES){
    const period=ANALYSIS_PERIODS[frame],end=Math.floor(T/period)*period;
    snapshot[ANALYSIS_KEYS[frame]]=Array.from({length:170},(_,i)=>{
      const close=.5+i*.0002;
      return {endMs:end-(169-i)*period,open:close-.0001,high:close+.0003,low:close-.0004,
        close,volume:i===169?200:100};
    });
  }
  const event={id:`TESTUSDT:${tf}:${T}:LONG_A`,signal:'LONG_A',symbol:'TESTUSDT',timeframe:tf,
    price:snapshot[ANALYSIS_KEYS[tf]].at(-1).close,barClosedAtMs:T,detectedAtMs:T+4000,
    binance24hChangePct:2.5,quoteVolume24h:20_000_000};
  return {event,snapshot};
}

// Consistent synthetic 1m OHLCV aggregated to every context, never market evidence.
export function pineDeliveryFixture(){
  const all=[];
  for(let i=0;i<16000;i++){
    const j=i-15000,close=j<0?.05+i*.000001:j<180?.065-j*.00001:j<420?.0632+(j-180)*.000012:
      .06608+(j-420)*.000001+.00006*Math.sin((j-420)*.2);
    const open=all.at(-1)?.close??close;
    all.push({endMs:T-(15999-i)*M,open,high:Math.max(open,close)+.00001,
      low:Math.min(open,close)-.00001,close,volume:100});
  }
  const data={oneMinute:all.slice(-999)};
  for(const [key,span,limit] of [['fiveMinute',5*M,499],['fifteenMinute',15*M,249],['oneHour',60*M,170]]){
    const groups=new Map();for(const b of all){const k=Math.floor((b.endMs-1)/span);
      if(!groups.has(k))groups.set(k,[]);groups.get(k).push(b);}
    data[key]=[...groups.values()].filter(g=>g.length===span/M&&g.at(-1).endMs%span===0)
      .map(g=>({endMs:g.at(-1).endMs,open:g[0].open,high:Math.max(...g.map(b=>b.high)),
        low:Math.min(...g.map(b=>b.low)),close:g.at(-1).close,volume:g.reduce((s,b)=>s+b.volume,0)})).slice(-limit);
  }
  const at=i=>{
    const end=data.oneMinute[i].endMs;
    return Object.fromEntries(Object.entries(data).map(([key,bars])=>[key,bars.filter(b=>b.endMs<=end)]));
  };
  return {data,at};
}

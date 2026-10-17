/**
 * YELLOW GOLD — research-only, causal quality annotation of an ALREADY
 * CONFIRMED LONG_A. No REST, no WebSocket, no FCM, no HOME, no execution.
 *
 * This deliberately cannot emit, suppress, or modify scanner events.
 * Provisional parameters MUST be calibrated on forward natural samples
 * before any production decision is proposed.
 */
const PERIODS = Object.freeze({'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000});
const PARAMS = Object.freeze({
  '1m':Object.freeze({baseRangePct:7,extension25Pct:8}),
  '5m':Object.freeze({baseRangePct:12,extension25Pct:12}),
  '15m':Object.freeze({baseRangePct:18,extension25Pct:18}),
  '1h':Object.freeze({baseRangePct:26,extension25Pct:25}),
});
const avg = numbers => numbers.reduce((a,b)=>a+b,0)/numbers.length;
const pct = (a,b) => b>0?100*(a/b-1):null;
const finite = x => typeof x==='number' && Number.isFinite(x);
const round = x => finite(x)?Math.round(x*10000)/10000:null;
const signalId = e => e.symbol+':'+e.timeframe+':'+e.barClosedAtMs+':LONG_A';
const rejected = reason => ({status:'UNVERIFIED',reason,deliveryAction:'NONE',grade:null,features:null});

export function inspectLongAQuality(event,rawBars){
  if(!event || event.signal!=='LONG_A' || !Object.hasOwn(PERIODS,event.timeframe) ||
    !/^[A-Z0-9]{2,25}USDT$/.test(event.symbol||'') ||
    !Number.isSafeInteger(event.barClosedAtMs) || event.id!==signalId(event) ||
    !(finite(event.price)&&event.price>0)) return rejected('INVALID_LONG_A_EVENT');
  if(!Array.isArray(rawBars))return rejected('CANDLES_NOT_PROVIDED');
  const period=PERIODS[event.timeframe], t=event.barClosedAtMs;
  // Ignore all future data, including future modifications and higher highs.
  const bars=rawBars.filter(x=>x && Number.isSafeInteger(x.endMs)&&x.endMs<=t)
    .sort((a,b)=>a.endMs-b.endMs).slice(-61);
  if(bars.length<61 || bars.at(-1).endMs!==t) return rejected('INSUFFICIENT_AS_OF_CANDLES');
  // Price in the genuine LONG_A event must match the exact closed candle.
  if(Math.abs(bars.at(-1).close-event.price)>Math.max(1e-10,Math.abs(event.price)*1e-8))
    return rejected('EVENT_PRICE_MISMATCH');
  for(let i=0;i<bars.length;i++){
    const b=bars[i];
    if((i&&b.endMs-bars[i-1].endMs!==period)||b.endMs%period!==0 ||
      ![b.open,b.high,b.low,b.close,b.volume].every(finite) ||
      b.open<=0||b.high<=0||b.low<=0||b.close<=0||b.volume<0 ||
      b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.high<b.low)
      return rejected('INVALID_OR_GAPPED_CANDLES');
  }
  const now=bars.at(-1), prev=bars.slice(0,-1), previous20=prev.slice(-20);
  const earlier20=prev.slice(-40,-20), previous8=prev.slice(-8);
  const recent3=prev.slice(-3), previous10=prev.slice(-10);
  const ma7=avg(bars.slice(-7).map(b=>b.close));
  const ma25=avg(bars.slice(-25).map(b=>b.close));
  const previousMa25=avg(prev.slice(-25).map(b=>b.close));
  const vol20=avg(prev.slice(-20).map(b=>b.volume));
  const volRatio=vol20>0?now.volume/vol20:null;
  const persistRatio=vol20>0?avg(recent3.map(b=>b.volume))/vol20:null;
  const baseHi=Math.max(...previous20.map(b=>b.high));
  const baseLo=Math.min(...previous20.map(b=>b.low));
  const priorHi=Math.max(...earlier20.map(b=>b.high));
  const priorLo=Math.min(...earlier20.map(b=>b.low));
  const previousBaseRange=100*(baseHi/baseLo-1);
  const earlierBaseRange=100*(priorHi/priorLo-1);
  const distanceMa7Pct=pct(now.close,ma7);
  const distanceMa25Pct=pct(now.close,ma25);
  const rise10Pct=pct(now.close,previous10[0].close);
  const candleClosePosition=now.high>now.low?(now.close-now.low)/(now.high-now.low):0.5;
  const p=PARAMS[event.timeframe];
  // Two alternative structures. Do NOT demand that 1m+5m+15m+1h all signal.
  const earlyBase=previousBaseRange<=p.baseRangePct &&
    previousBaseRange<=earlierBaseRange*1.15 && now.close>=baseHi*0.995;
  const continuation=ma7>=ma25 && ma25>=previousMa25 &&
    Math.min(...previous8.map(b=>b.low))>=ma25*.93 && now.close>=ma7*.995;
  const structure=earlyBase||continuation;
  const release=now.close>=now.open && candleClosePosition>=.58 &&
    (volRatio>=1.25 || (volRatio>=1.0 && persistRatio>=1.15));
  const notChasing=distanceMa7Pct<=2.5 && distanceMa25Pct<=p.extension25Pct &&
    rise10Pct<=p.extension25Pct*1.8;
  const flags={structure,release,notChasing};
  const strengths=Object.values(flags).filter(Boolean).length;
  // A provisional ranking, NOT an instruction to suppress LONG_A. Conservative
  // second tier still retained; no daily cap; no timeout to wait for other TF.
  const grade=strengths===3?'GOLD_RESEARCH':strengths===2?'REVIEW_RESEARCH':'WEAK_RESEARCH';
  return {status:'ASSESSED',reason:null,deliveryAction:'NONE',grade,
    flags,paths:{earlyBase,continuation},
    features:{volumeRatio:round(volRatio),volumePersistenceRatio:round(persistRatio),
      previousBaseRangePct:round(previousBaseRange),earlierBaseRangePct:round(earlierBaseRange),
      distanceMa7Pct:round(distanceMa7Pct),distanceMa25Pct:round(distanceMa25Pct),
      rise10Pct:round(rise10Pct),candleClosePosition:round(candleClosePosition),
      previousMa25SlopePct:round(pct(ma25,previousMa25))},
    notes:['PROVISIONAL_THRESHOLDS','NOT_TRADING_ADVICE','NOT_CONNECTED_TO_LIVE_DELIVERY']};
}

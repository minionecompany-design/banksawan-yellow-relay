/**
 * DETERMINISTIC SYNTHETIC FIXTURE ONLY. The output is NOT historical Binance data.
 * Generates one chronologically consistent 1m feed and derives completed 5m/15m/1h
 * candles from those same minute candles, so MTF inputs cannot contradict each other.
 * As-of mock Binance 24h fields are attached solely to exercise the selector.
 */
const SPAN={oneMinute:60_000,fiveMinute:300_000,fifteenMinute:900_000,oneHour:3_600_000};
function completedBuckets(oneMinute,step){
  const span=SPAN[step];
  const grouped=new Map();
  for(const c of oneMinute){
    const bucket=Math.floor((c.endMs-1)/span);
    if(!grouped.has(bucket))grouped.set(bucket,[]);
    grouped.get(bucket).push(c);
  }
  const expected=span/60_000;
  return [...grouped.entries()].filter(([bucket,group])=>
    group.length===expected && group.at(-1).endMs===(bucket+1)*span &&
    group.every((bar,i)=>bar.endMs===(bucket*span)+(i+1)*60_000))
    .map(([,group])=>({endMs:group.at(-1).endMs,
      close:group.at(-1).close,volume:group.reduce((sum,x)=>sum+x.volume,0)}));
}
const SCENARIOS=Object.freeze({
  '1m':{size:7400,shape:0},
  '5m':{size:7400,shape:1,startBack:230,dropBars:45,drop:0.000003,recover:0.000001,recoverBars:110},
  '15m':{size:7600,shape:1,startBack:460,dropBars:135,drop:0.000002,recover:0.000002,recoverBars:180},
  '1h':{size:16000,shape:0,startBack:2400,dropBars:540,drop:0.000003,recover:0.000001,recoverBars:1400}
});
export function makeSyntheticParallelDataset({symbol='TESTUSDT',scenario='1m',size=null,
   endMs=Date.UTC(2026,9,15,12),change24hPct=2.5,shape=null}={}){
  if(!SCENARIOS[scenario])throw new Error('UNKNOWN_SYNTHETIC_SCENARIO');
  const config=SCENARIOS[scenario];size=size??config.size;shape=shape??config.shape;
  if(size<7200||endMs%3_600_000!==0)throw new Error('SYNTHETIC_SHAPE_REQUIRES_AT_LEAST_7200_MINUTES_AND_ALIGNED_END');
  const start=endMs-size*60_000,oneMinute=[];
  for(let i=0;i<size;i++){
    const t=i-size+125;let dip=0;
    if(t>=0&&t<=10)dip=-t*.000008;
    else if(t>10&&t<27)dip=-10*.000008*(1-(t-10)/17);
    let correction=0;
    if(config.startBack){
      const local=i-(size-config.startBack),bottom=config.dropBars,recoverEnd=bottom+config.recoverBars;
      if(local>0 && local<=bottom)correction=-config.drop*local;
      else if(local>bottom && local<recoverEnd)correction=-config.drop*bottom+config.recover*(local-bottom);
      else if(local>=recoverEnd)correction=-config.drop*bottom+config.recover*config.recoverBars;
    }
    const close=0.05+i*.000001+0.00002*Math.sin(i*(.1+shape*.025))+dip+correction;
    oneMinute.push({endMs:start+(i+1)*60_000,close,volume:100+(i%7)*5});
  }
  const tickers=oneMinute.map(b=>({symbol,source:'BINANCE_USDM_FUTURES',
    contractType:'PERPETUAL',status:'TRADING',observedAtMs:b.endMs,
    lastPrice:b.close,priceChangePercent:change24hPct,quoteVolume24h:20_000_000}));
  return {symbol,oneMinute,
    fiveMinute:completedBuckets(oneMinute,'fiveMinute'),
    fifteenMinute:completedBuckets(oneMinute,'fifteenMinute'),
    oneHour:completedBuckets(oneMinute,'oneHour'),tickers};
}

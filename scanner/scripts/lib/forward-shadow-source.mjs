/** Narrow public read-only source adapter. No account or trading endpoints. */
export const YELLOW_READ_BASE='https://yellow-live-shadow-yc94-production.up.railway.app';
export const SHADOW_WS='wss://fstream.binance.com/market/stream';
const symbolOK=s=>/^[A-Z0-9]{1,25}USDT$/.test(s??'');
export async function readShadowJson(route,fetcher=globalThis.fetch){
  const url=new URL(route,YELLOW_READ_BASE);
  if(url.origin!==YELLOW_READ_BASE||url.username||url.password||url.hash||
    !['/api/events','/api/research/candles'].includes(url.pathname)||
    (url.pathname==='/api/events'?!/^\?afterMs=\d{1,16}$/.test(url.search):
      !symbolOK(url.searchParams.get('symbol'))||[...url.searchParams.keys()].length!==1))
    throw Error('FORWARD_READ_ROUTE_REJECTED');
  const response=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10_000),
    headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('FORWARD_HTTP_'+response.status);
  let size=0;const chunks=[];
  for await(const chunk of response.body){
    size+=chunk.byteLength;if(size>8*1024*1024)throw Error('FORWARD_RESPONSE_TOO_LARGE');chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function captureShadowWarmup(symbol,journal,{reader=readShadowJson,clock=()=>Date.now()}={}){
  let source;
  try{source=await reader('/api/research/candles?symbol='+symbol);}
  catch(e){
    // A genuine signal can leave the scanner's bounded universe before its
    // warmup is fetched. Retain that failed case and continue other symbols.
    if(e.message!=='FORWARD_HTTP_404')throw e;
    await journal.ingest({type:'GAP',symbol,reason:'WARMUP_SYMBOL_NOT_BUFFERED',receivedAtMs:clock()});
    return false;
  }
  if(source.symbol!==symbol||source.source!=='EXISTING_BINANCE_CANDLE_BOOK')throw Error('INVALID_WARMUP_SOURCE');
  await journal.ingest({type:'WARMUP',symbol,candles:source.candles,capturedAtMs:source.capturedAtMs,receivedAtMs:clock()});
  return true;
}
export function parseShadowMarket(raw,receivedAtMs,symbols){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>2*1024*1024)throw Error('INVALID_SHADOW_WS_SIZE');
  const payload=JSON.parse(raw),data=payload.data??payload;
  if(Array.isArray(data)){
    const tickers=data.filter(r=>symbols.has(r.s)&&r.e==='24hrTicker'&&(r.st===undefined||r.st===1))
      .map(r=>({symbol:r.s,ticker:{lastPrice:Number(r.c),priceChangePercent:Number(r.P),
        quoteVolume24h:Number(r.q),observedAtMs:receivedAtMs,exchangeAtMs:r.E},raw:r}));
    return tickers.length?[{type:'TICKER_BATCH',receivedAtMs,tickers}]:[];
  }
  if(data.e==='kline'&&data.k?.x===true&&symbols.has(data.s)&&
     (data.st===undefined||data.st===1))return [{type:'NATIVE_BAR',symbol:data.s,
    timeframe:data.k.i,receivedAtMs,exchangeAtMs:data.E,
    bar:{endMs:data.k.T+1,open:Number(data.k.o),high:Number(data.k.h),low:Number(data.k.l),
      close:Number(data.k.c),volume:Number(data.k.v)},raw:data}];
  if(payload.error||payload.code!==undefined)throw Error('SHADOW_WS_SERVER_ERROR');
  return [];
}

/** OFFLINE-only comparison of the owner-approved Binance USD-M screener
 * with an independently saved TradingView CEX export. No network, no LIVE.
 * A CEX symbol set is meaningful only when Binance, Perpetual, USDT, >1%,
 * price<10, and Vol in USD 24h>10M filters matched at a similar timestamp.
 */
import {normalizeBinanceTicker} from './binance-fixture-adapter.js';
import {eligibleUniverse} from './long-a.js';

const validTime=n=>Number.isSafeInteger(n)&&n>0;
function normalizedCexSymbol(item){
 const raw=typeof item==='string'?item:item?.symbol;
 const exchange=typeof item==='string'?undefined:item?.exchange;
 if(exchange!==undefined&&exchange!=='BINANCE')throw Error('CEX_EXCHANGE_NOT_BINANCE');
 if(typeof raw!=='string')throw Error('CEX_SYMBOL_REQUIRED');
 const match=/^(?:BINANCE:)?([A-Z0-9]{1,25}USDT)\.P$/.exec(raw);
 if(!match)throw Error('CEX_PERPETUAL_USDT_SYMBOL_REQUIRED');
 return match[1];
}
export function auditCexUniverse({exchangeInfo,tickers,observedAtMs,cexSymbols=null,cexObservedAtMs=null}={}){
 if(!Array.isArray(exchangeInfo?.symbols)||!Array.isArray(tickers)||
    !validTime(observedAtMs))throw Error('BINANCE_TIMESTAMPED_SNAPSHOTS_REQUIRED');
 const metadata=new Map(exchangeInfo.symbols.filter(item=>
   typeof item?.symbol==='string' && /^[A-Z0-9]{1,25}USDT$/.test(item.symbol) &&
   item.quoteAsset==='USDT'&&item.contractType==='PERPETUAL'&&item.status==='TRADING'
 ).map(item=>[item.symbol,item]));
 const snapshots=[],seen=new Set();let rejectedMalformed=0,ignoredOtherContracts=0;
 for(const ticker of tickers){
  if(!ticker||typeof ticker.symbol!=='string') {rejectedMalformed++;continue;}
  if(seen.has(ticker.symbol))throw Error('DUPLICATE_BINANCE_TICKER');
  seen.add(ticker.symbol);
  const info=metadata.get(ticker.symbol);
  if(!info){ignoredOtherContracts++;continue;}
  try{snapshots.push(normalizeBinanceTicker({symbol:ticker.symbol,ticker,
    exchangeSymbol:info,observedAtMs}));}
  catch{rejectedMalformed++;}
 }
 const eligible=eligibleUniverse(snapshots);
 const symbols=eligible.map(x=>x.symbol);
 const result={source:'OFFLINE_BINANCE_USDM_REST_SNAPSHOT',observedAtMs,
   filters:{exchange:'BINANCE',market:'USD-M PERPETUAL TRADING',quote:'USDT',
    change24hPct:'>1',priceUSDT:'0<price<10',quoteVolume24hUSDT:'>10000000'},
   eligibleCount:symbols.length,scannerCapacity:50,expectedCoveredWhenHealthy:Math.min(symbols.length,50),
   eligibleSymbols:symbols,rejectedMalformed,ignoredOtherContracts,
   realTimeMarketVerified:false,networkRequests:0};
 if(cexSymbols===null)return {...result,comparison:'CEX_EXPORT_NOT_PROVIDED'};
 if(!Array.isArray(cexSymbols)||!validTime(cexObservedAtMs))
  throw Error('TIMESTAMPED_CEX_EXPORT_REQUIRED');
 const gap=Math.abs(observedAtMs-cexObservedAtMs);
 if(gap>120_000)throw Error('SNAPSHOTS_MORE_THAN_2_MINUTES_APART');
 const cexSet=new Set();
 for(const value of cexSymbols){
  const symbol=normalizedCexSymbol(value);
  if(cexSet.has(symbol))throw Error('DUPLICATE_CEX_SYMBOL');
  cexSet.add(symbol);
 }
 const binanceSet=new Set(symbols);
 return {...result,comparison:'CEX_SYMBOL_MEMBERSHIP',cexObservedAtMs,
   observationGapMs:gap,cexCount:cexSet.size,
   onlyBinance:symbols.filter(s=>!cexSet.has(s)),
   onlyCex:[...cexSet].filter(s=>!binanceSet.has(s)).sort(),
   exactMembershipMatch:cexSet.size===binanceSet.size&&symbols.every(s=>cexSet.has(s)),
   caveat:'Comparability requires independently verified CEX screen filters; Binance quote USDT and CEX Vol in USD, vendor timing and calculations may differ.'};
}

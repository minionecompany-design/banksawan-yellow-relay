/**
 * Explicitly simulated UI data. No real signals, real-time Binance data or
 * signal notification delivery occurs in this demo. No write endpoints.
 */
import {addToHome,getActiveHome,eligibleUniverse} from './long-a.js';

export function makeDemoStore(clock=()=>Date.now()) {
  const now=clock();
  let home=[];
  home=addToHome(home,{id:'DEMO_WAL',symbol:'WALUSDT',signal:'LONG_A',timeframe:'15m',price:0.05123,
    binance24hChangePct:5.8,quoteVolume24h:20_000_000,priority:'HIGH',status:'DEMO_ONLY'},now-35*60_000);
  home=addToHome(home,{id:'DEMO_ARC',symbol:'ARCUSDT',signal:'LONG_A',timeframe:'1m',price:0.03741,
    binance24hChangePct:2.7,quoteVolume24h:20_000_000,priority:'STANDARD',status:'DEMO_ONLY'},now-97*60_000);
  const universe=eligibleUniverse([
    {symbol:'WALUSDT',contractType:'PERPETUAL',status:'TRADING',lastPrice:'0.05123',priceChangePercent:'5.8',quoteVolume24h:20_000_000},
    {symbol:'ARCUSDT',contractType:'PERPETUAL',status:'TRADING',lastPrice:'0.03741',priceChangePercent:'2.7',quoteVolume24h:20_000_000},
    {symbol:'NILUSDT',contractType:'PERPETUAL',status:'TRADING',lastPrice:'0.08511',priceChangePercent:'1.5',quoteVolume24h:20_000_000},
    {symbol:'SKDDUSDT',contractType:'PERPETUAL',status:'TRADING',lastPrice:'11.87',priceChangePercent:'25.0'}
  ]);
  return {getHome:()=>getActiveHome(home,clock()),getUniverse:()=>universe,
    meta:()=>({mode:'DEMO_OFFLINE',source:'SIMULATED_NOT_LIVE',
      lastCheckedAtMs:now,scannerRunning:false,simulation:true})};
}

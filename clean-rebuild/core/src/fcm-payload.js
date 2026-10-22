import {tradingViewUrl} from './api-view.js';
const FRAMES=new Set(['1m','5m','15m','1h']);
/** Pure data-only FCM contract for offline testing. No tokens or network.
 * UI will validate the same values on Android before rendering a LONG A. */
export function fcmLongAData(row){
 if(!row||typeof row!=='object'||!FRAMES.has(row.timeframe)||
   typeof row.symbol!=='string'||!/^[A-Z0-9]{2,25}USDT$/.test(row.symbol)||
   !Number.isSafeInteger(row.barClosedAtMs)||row.barClosedAtMs<=0||
   row.id!==row.symbol+':'+row.timeframe+':'+row.barClosedAtMs+':LONG_A'||
   row.chartUrl!==tradingViewUrl(row.symbol))throw Error('INVALID_FCM_EVENT');
 return Object.freeze({
  schemaVersion:'yellow-clean-v1',signal:'LONG_A',eventId:row.id,
  symbol:row.symbol,timeframe:row.timeframe,
  barClosedAtMs:String(row.barClosedAtMs),tradingViewUrl:row.chartUrl,
 });
}

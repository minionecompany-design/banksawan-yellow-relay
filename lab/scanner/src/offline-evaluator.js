/** Offline-only LONG_A and LONG_B research evaluator, no Binance client.
 * LAB fork from frozen reference evaluator: 1m >=0% and 1h >=+1% on
 * Binance USD-M rolling 24h ticker as-of. Price still strictly <10 USDT.
 * No reference files changed; no network, no trade and no notification.
 */
import {stepLongAOnTimeframe,newParallelState} from './lab-parallel-long-a.js';
export function evaluateClosedSnapshot({symbol,timeframe,snapshot,state,nowMs}){
  if(!['1m','1h'].includes(timeframe))throw Error('LAB_TF_ONLY_1M_1H');
  if(!snapshot||!Number.isSafeInteger(nowMs)||nowMs<=0)throw Error('INVALID_CLOSED_SNAPSHOT');
  const initial=state??newParallelState()[timeframe];
  // Original function fail-closes if context bars are incomplete, stale or future.
  return stepLongAOnTimeframe(symbol,timeframe,{...snapshot,nowMs,contextMode:'CAUSAL_REALTIME'},initial);
}

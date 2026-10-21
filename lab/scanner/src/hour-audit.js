/** Offline 1H discrepancy audit. A visual Pine marker is NOT live parity proof. */
export const ONE_HOUR = 3_600_000;
const SYMBOL=/^[A-Z0-9]{2,25}USDT$/;
const FINITE=n=>typeof n==='number'&&Number.isFinite(n);
const normalizedReason=x=>{
  if(typeof x!=='string'||!x)return 'UNKNOWN';
  if(x==='BINANCE_24H_FILTER')return 'UNIVERSE_24H_FILTER';
  if(x.startsWith('CONTEXT_'))return 'MTF_CONTEXT_NOT_READY';
  if(x==='STALE_BINANCE_TICKER'||x==='INVALID_BINANCE_USDM_24H_TICKER')return 'TICKER_NOT_TRUSTED';
  if(x.startsWith('TARGET_'))return 'CANDLE_OR_BOOTSTRAP_NOT_READY';
  if(x==='NO_CONFIRMED_SIGNAL')return 'INDICATOR_OR_STATE_REJECTED';
  return x.slice(0,90);
};

export class HourAudit {
  constructor(){this.rows=[];}
  observe({symbol,barClosedAtMs,source,emitted,diagnostics={},ticker24hPct=null}){
    if(!SYMBOL.test(symbol||'')||!Number.isSafeInteger(barClosedAtMs)||barClosedAtMs<=0||barClosedAtMs%ONE_HOUR!==0)
      return {status:'INVALID'};
    if(!['PINE_HISTORICAL_VISUAL','BACKEND_CAUSAL_REALTIME'].includes(source))return {status:'INVALID_SOURCE'};
    if(source==='PINE_HISTORICAL_VISUAL'){
      this.rows.push({symbol,barClosedAtMs,source,classification:'VISUAL_NOT_PROOF'});
      return {status:'VISUAL_NOT_PROOF'};
    }
    const row={symbol,barClosedAtMs,source,classification:emitted?'EVENT_CONFIRMED':'NO_EVENT',
      diagnostics:{...diagnostics},ticker24hPct};
    this.rows.push(row);return {status:row.classification};
  }
  /** Stronger typed case assessment: distinguishes unobserved from true rejection. */
  assessCase({symbol,visualAtMs=null,backend=null}={}){
    if(!SYMBOL.test(symbol||''))return {status:'INVALID_SYMBOL'};
    if(visualAtMs!==null && (!Number.isSafeInteger(visualAtMs)||visualAtMs<=0||visualAtMs%ONE_HOUR!==0))
      return {status:'INVALID_VISUAL_TIME'};
    const base={symbol,visualAtMs,source:'PINE_HISTORICAL_VISUAL',confirmedRealtimeMiss:false};
    if(visualAtMs===null)return {...base,status:'NEED_EXACT_1H_A_CANDLE'};
    if(!backend || backend.barClosedAtMs!==visualAtMs)return {...base,status:'NO_MATCHING_BACKEND_SNAPSHOT'};
    if(backend.covered!==true)return {...base,status:'COVERAGE_NOT_VERIFIED'};
    if(backend.candleReady!==true || backend.warmVerified!==true)
      return {...base,status:'COLD_OR_INCOMPLETE_1H'};
    if(backend.tickerTrusted!==true || !FINITE(backend.ticker24hPct))
      return {...base,status:'TICKER_NOT_VERIFIED'};
    if(backend.mtfReady!==true)return {...base,status:'MTF_NOT_VERIFIED'};
    if(backend.evaluatorVersionVerified!==true)return {...base,status:'EVALUATOR_VERSION_NOT_VERIFIED'};
    if(backend.emitted===true)return {...base,status:'BACKEND_1H_EVENT_CONFIRMED'};
    const cause=normalizedReason(backend.reason);
    // Even after a backend rejection is established, Pine historical vs live
    // must still be checked before labeling a bug or a missed valid entry.
    return {...base,status:'BACKEND_EVALUATED_NO_1H_EVENT',cause,
      diagnostics:backend.diagnostics??{},needsPineParityCheck:true};
  }
  summary(){return {events:this.rows.length,
    historicalVisualOnly:this.rows.filter(x=>x.source==='PINE_HISTORICAL_VISUAL').length,
    backendEvents:this.rows.filter(x=>x.classification==='EVENT_CONFIRMED').length,
    backendNoEvent:this.rows.filter(x=>x.classification==='NO_EVENT').length};}
}

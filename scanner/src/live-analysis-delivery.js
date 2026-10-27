/** Symbol-local delivery of closed 1m candles to the optional entry analysis.
 * A 1m close can precede the matching native 5m/15m/1h close on the socket.
 * Wait for real context, never synthesize it or replay an assessed candle.
 */
import {ANALYSIS_FRAMES,ANALYSIS_KEYS,closedHistory,validAnalysisBar} from './analysis-companion.js';
export const ANALYSIS_CONTEXT_WAIT_MS=90_000;
const MAX_PENDING=4;
export class LiveAnalysisDelivery {
  constructor(){
    this.pending=[];this.lastQueuedEndMs=0;
    this.metrics={queued:0,deferred:0,delivered:0,timedOut:0,overflow:0,rejected:0};
  }
  enqueue(bar){
    if(!validAnalysisBar(bar)||bar.endMs<=this.lastQueuedEndMs)return false;
    this.lastQueuedEndMs=bar.endMs;
    this.pending.push({...bar});this.metrics.queued++;
    // Queue overflow cannot become a valid confirmation. The resulting minute
    // gap is also detected by the watch/paper engine on the next delivery.
    if(this.pending.length>MAX_PENDING){this.pending.shift();this.metrics.overflow++;}
    return true;
  }
  flush(snapshot,now,deliver){
    while(this.pending.length){
      const bar=this.pending[0];
      if(bar.endMs>now)break;
      const ready=ANALYSIS_FRAMES.every(tf=>closedHistory(snapshot?.[ANALYSIS_KEYS[tf]],tf,bar.endMs));
      const timedOut=now-bar.endMs>ANALYSIS_CONTEXT_WAIT_MS;
      if(!ready&&!timedOut){
        if(!bar.deferred){bar.deferred=true;this.metrics.deferred++;}
        break;
      }
      this.pending.shift();
      const {deferred,...candle}=bar;
      // Even if late context has since arrived, the unchanged engine rejects
      // confirmation after 90s. Deliver once to advance paper/continuity state.
      if(timedOut)this.metrics.timedOut++;
      if(deliver(candle,snapshot)===false)this.metrics.rejected++;
      else this.metrics.delivered++;
    }
  }
  status(){return {...this.metrics,pending:this.pending.length};}
}

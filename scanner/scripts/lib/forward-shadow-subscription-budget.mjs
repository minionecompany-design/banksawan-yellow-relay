/** Binance USD-M research WebSocket outbound-control rate budget.
 * One routed /market/stream WS. Stream cap <= 1024. Subscribe control
 * messages are <=1 per second, leaving margin for ping/pong and failures.
 * The public collector may record a missing candle while subscriptions lag;
 * it must never backfill an entry with unseen market data.
 */
export const SHADOW_TIMEFRAMES=Object.freeze(['1m','5m','15m','1h']);
const symbolOK=s=>typeof s==='string'&&/^[A-Z0-9]{1,25}USDT$/.test(s);
export class ForwardSubscriptionBudget {
  constructor({maxSymbols=200,symbolsPerBatch=20,minGapMs=1000}={}){
    if(!Number.isSafeInteger(maxSymbols)||maxSymbols<1||maxSymbols>200||
      !Number.isSafeInteger(symbolsPerBatch)||symbolsPerBatch<1||symbolsPerBatch>25||
      !Number.isSafeInteger(minGapMs)||minGapMs<1000)
      throw Error('INVALID_SHADOW_SUBSCRIPTION_BUDGET');
    this.maxSymbols=maxSymbols;this.symbolsPerBatch=symbolsPerBatch;
    this.minGapMs=minGapMs;this.seen=new Set();this.pending=[];
    this.nextAllowedAtMs=0;this.messagesSent=0;
  }
  noteControlSent(atMs){
    if(!Number.isSafeInteger(atMs)||atMs<0)throw Error('INVALID_SUBSCRIBE_CLOCK');
    this.nextAllowedAtMs=Math.max(this.nextAllowedAtMs,atMs+this.minGapMs);
    this.messagesSent++;
  }
  enqueue(symbols){
    if(!Array.isArray(symbols))throw Error('INVALID_SHADOW_SYMBOLS');
    for(const s of symbols){
      if(!symbolOK(s))throw Error('INVALID_SHADOW_SYMBOL');
      if(this.seen.has(s))continue;
      if(this.seen.size>=this.maxSymbols)throw Error('SHADOW_SUBSCRIPTION_CAPACITY_STOP');
      this.seen.add(s);this.pending.push(s);
    }
    return this.pending.length;
  }
  take(atMs){
    if(!Number.isSafeInteger(atMs)||atMs<0)throw Error('INVALID_SUBSCRIBE_CLOCK');
    if(atMs<this.nextAllowedAtMs||!this.pending.length)return null;
    const symbols=this.pending.splice(0,this.symbolsPerBatch);
    const params=symbols.flatMap(s=>SHADOW_TIMEFRAMES.map(tf=>
      s.toLowerCase()+'@kline_'+tf));
    // Including exactly one !ticker@arr market stream, at most
    // 200 * 4 + 1 = 801 total subscriptions, under 1024 hard max.
    if(this.seen.size*4+1>1024)throw Error('BINANCE_WS_STREAM_LIMIT_STOP');
    this.noteControlSent(atMs);
    return {params,symbols,pending:this.pending.length,
      activeStreams:this.seen.size*4+1};
  }
  stats(){return {maxSymbols:this.maxSymbols,tracked:this.seen.size,
    pending:this.pending.length,estimatedStreams:1+4*this.seen.size,
    controlMessages:this.messagesSent,minControlGapMs:this.minGapMs};}
}

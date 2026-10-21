/**
 * BANKSAWAN YELLOW LAB v0.2 — event reducer + closed-candle outcome observer.
 * Entirely OFFLINE. This module cannot open a socket, publish a signal or trade.
 * Input events MUST come from a separately verified causal evaluator; an event
 * obtained from a TradingView screenshot is not sufficient.
 */
export const TWO_HOURS = 120 * 60_000;
const MIN = 60_000, FIVE_MIN = 5 * MIN;
const SYMBOL = /^[A-Z0-9]{2,25}USDT$/;
const FINITE = n => typeof n === 'number' && Number.isFinite(n);
const VALID_SIGNALS = ['LONG_A','LONG_B','PROTECT','OUT_FINAL'];
const pct = (price, base) => base > 0 ? Math.round((price / base - 1) * 10000) / 100 : null;
const validClosedBar = b => b && Number.isSafeInteger(b.endMs) && b.endMs > 0 && b.endMs % MIN === 0 &&
  [b.open,b.high,b.low,b.close].every(v=>FINITE(v)&&v>0) &&
  b.high >= Math.max(b.open,b.close,b.low) && b.low <= Math.min(b.open,b.close,b.high);

export function validEvent(e) {
  return !!e && SYMBOL.test(e.symbol||'') && e.timeframe==='1m' && VALID_SIGNALS.includes(e.signal) &&
    Number.isSafeInteger(e.barClosedAtMs) && e.barClosedAtMs > 0 && e.barClosedAtMs % MIN === 0 &&
    FINITE(e.price) && e.price > 0 && e.id===`${e.symbol}:1m:${e.barClosedAtMs}:${e.signal}`;
}

/** These are UNCALIBRATED research bins, never a trading permission. */
export function studyBQuality(e, episode, context, {maxChasePct=12}={}) {
  if(!context || !Number.isSafeInteger(context.endMs) || context.endMs > e.barClosedAtMs ||
     context.endMs <= 0 || context.endMs % FIVE_MIN !== 0 ||
     e.barClosedAtMs-context.endMs > FIVE_MIN ||
     ![context.close,context.ma7,context.ma25,context.rsi].every(FINITE))
    return {passed:false,reason:'MISSING_OR_STALE_5M_CONTEXT'};
  const rise = pct(e.price,episode.aPrice);
  if(!(rise>0))return {passed:false,reason:'B_NOT_ABOVE_A',risePct:rise};
  if(rise>maxChasePct)return {passed:false,reason:'B_PRICE_ALREADY_TOO_FAR',risePct:rise};
  if(!(context.close>context.ma7 && context.ma7>=context.ma25 && context.rsi>50))
    return {passed:false,reason:'FIVE_MIN_TREND_NOT_CONFIRMED',risePct:rise};
  return {passed:true,reason:'PROVISIONAL_RESEARCH_PASS',risePct:rise};
}
const isPending = r => r.status==='PENDING' || r.status==='SELECTED_RESEARCH_ONLY';

export class FirstABResearch {
  constructor({windowMs=TWO_HOURS,quality=studyBQuality,clock=()=>Date.now(),maxRows=240}={}) {
    if(!Number.isSafeInteger(windowMs)||windowMs<MIN||windowMs>24*60*MIN)throw Error('BAD_RESEARCH_WINDOW');
    if(typeof quality!=='function'||typeof clock!=='function'||!Number.isInteger(maxRows)||maxRows<10||maxRows>2000)
      throw Error('BAD_RESEARCH_OPTIONS');
    this.windowMs=windowMs;this.quality=quality;this.clock=clock;this.maxRows=maxRows;
    this.active=new Map();this.rows=[];this.seen=new Set();this.evicted=0;
  }
  #close(r,status){r.status=status;this.active.delete(r.symbol);}
  #cap(){while(this.rows.length>this.maxRows){const old=this.rows.shift();this.evicted++;
    if(this.active.get(old.symbol)===old)this.active.delete(old.symbol);
  }}
  /**
   * Must be called for EVERY closed 1m candle starting with first bar AFTER A.
   * Missed candles and lost coverage become INCOMPLETE, never 'bad signals'.
   * This is for measurement, and does not attempt to infer LONG A/B from candles.
   */
  observeClosedBar(symbol,bar){
    const r=this.active.get(symbol);
    if(!r)return {status:'NO_ACTIVE_EPISODE'};
    if(!validClosedBar(bar)){this.#close(r,'INCOMPLETE');r.incompleteReason='INVALID_CANDLE';return {status:'INCOMPLETE'};}
    if(bar.endMs<=r.aAt)return {status:'A_OR_OLDER_BAR_IGNORED'};
    if(bar.endMs<=r.lastObservedBarAt)return {status:'DUPLICATE_OR_OLD_BAR'};
    if(bar.endMs-r.lastObservedBarAt!==MIN || bar.endMs>r.deadlineMs){
      this.#close(r,'INCOMPLETE');r.incompleteReason='CANDLE_GAP_OR_WINDOW_OVERRUN';return {status:'INCOMPLETE'};
    }
    r.observedCandles++;
    r.lastObservedBarAt=bar.endMs;
    r.afterAHigh=Math.max(r.afterAHigh,bar.high);r.afterALow=Math.min(r.afterALow,bar.low);
    // Strictly AFTER the B candle. Never use B's own intrabar high/low.
    if(r.selected && bar.endMs>r.selected.at){
      r.afterBHigh=r.afterBHigh===null?bar.high:Math.max(r.afterBHigh,bar.high);
      r.afterBLow=r.afterBLow===null?bar.low:Math.min(r.afterBLow,bar.low);
      r.observedAfterB++;
    }
    if(bar.endMs===r.deadlineMs){this.#close(r,r.selected?'COMPLETE_SELECTED':'COMPLETE_NO_SELECTION');
      return {status:r.status};}
    return {status:'BAR_OBSERVED'};
  }
  /** Must be invoked on symbol rotation, unsafe restart, WS gap, or loss of data. */
  markCoverageLost(symbol,reason='COVERAGE_LOST'){
    const r=this.active.get(symbol);if(!r)return {status:'NO_ACTIVE_EPISODE'};
    this.#close(r,'INCOMPLETE');r.incompleteReason=String(reason).slice(0,80);
    return {status:'INCOMPLETE',reason:r.incompleteReason};
  }
  /** Timer for observations that never receive another bar; cannot turn them into success/failure. */
  expireUnobserved(asOfMs=this.clock()){
    if(!Number.isSafeInteger(asOfMs))throw Error('INVALID_WATERMARK');
    let n=0;for(const r of [...this.active.values()])if(asOfMs>r.deadlineMs+MIN){
      this.#close(r,'INCOMPLETE');r.incompleteReason='NO_COMPLETE_FOLLOWUP';n++;
    }return n;
  }
  ingest(e,ctx=null){
    if(!validEvent(e))return {status:'REJECT_INVALID_OR_UNCLOSED'};
    if(e.barClosedAtMs>this.clock())return {status:'REJECT_FUTURE'};
    if(this.seen.has(e.id))return {status:'DUPLICATE'};
    const previous=this.active.get(e.symbol);
    if(previous&&e.barClosedAtMs<previous.lastAt)return {status:'REJECT_OUT_OF_ORDER'};
    if(previous&&e.barClosedAtMs===previous.lastAt)return {status:'REJECT_SAME_CANDLE_STATE_EVENT'};
    if(previous&&e.barClosedAtMs>previous.deadlineMs){
      this.#close(previous,'INCOMPLETE');previous.incompleteReason='UNOBSERVED_WINDOW_EXPIRED';
    }
    const current=this.active.get(e.symbol);
    if(e.signal==='LONG_A'){
      if(current){this.#seen(e.id);return {status:'IGNORE_SUBSEQUENT_A',id:current.id};}
      if(ctx?.warmVerified!==true)return {status:'REJECT_COLD_OR_UNPROVEN_FIRST_A'};
      const item={id:e.id,symbol:e.symbol,tf:'1m',aAt:e.barClosedAtMs,aPrice:e.price,
        deadlineMs:e.barClosedAtMs+this.windowMs,lastAt:e.barClosedAtMs,
        bCount:0,bAttempts:[],protectedSinceLastB:false,status:'PENDING',selected:null,
        firstAConfirmedByHistory:true,observedCandles:0,lastObservedBarAt:e.barClosedAtMs,
        afterAHigh:e.price,afterALow:e.price,afterBHigh:null,afterBLow:null,observedAfterB:0,
        incompleteReason:null};
      this.#seen(e.id);this.active.set(e.symbol,item);this.rows.push(item);this.#cap();
      return {status:'A1_STORED_SILENTLY',id:item.id};
    }
    this.#seen(e.id);
    if(!current)return {status:'NO_ACTIVE_A'};
    current.lastAt=e.barClosedAtMs;
    if(e.signal==='OUT_FINAL'){
      this.#close(current,current.selected?'SELECTED_AND_CLOSED':'CLOSED_NO_SELECTION');
      return {status:'EPISODE_CLOSED'};
    }
    if(e.signal==='PROTECT'){current.protectedSinceLastB=true;return {status:'PROTECT_OBSERVED_SILENTLY'};}
    if(e.signal!=='LONG_B')return {status:'NO_ACTION'};
    if(!current.protectedSinceLastB)return {status:'REJECT_B_WITHOUT_NEW_PROTECT'};
    current.protectedSinceLastB=false;
    current.bCount++;
    if(current.bCount>2)return {status:'IGNORE_B3_PLUS'};
    if(current.selected)return {status:'SUPPRESS_ALREADY_SELECTED'};
    const evaluation=this.quality(e,current,ctx);
    const b={number:current.bCount,at:e.barClosedAtMs,price:e.price,
      passed:evaluation?.passed===true,reason:evaluation?.reason||'UNSPECIFIED',
      riseFromAPct:pct(e.price,current.aPrice)};
    current.bAttempts.push(b);
    if(!b.passed)return {status:`B${b.number}_REJECTED_RESEARCH`,reason:b.reason};
    current.selected={...b,signal:'LONG_B',timeframe:'1m',symbol:e.symbol,publicationAuthorized:false};
    current.status='SELECTED_RESEARCH_ONLY';
    return {status:`B${b.number}_SELECTED_RESEARCH_ONLY`,selection:current.selected};
  }
  #seen(id){this.seen.add(id);if(this.seen.size>15000)this.seen=new Set([...this.seen].slice(-7500));}
  /** Research outcomes only. Max favourable/adverse excursion are NOT actual PnL. */
  outcomes(){return this.rows.map(r=>({symbol:r.symbol,aAt:r.aAt,bOrdinal:r.selected?.number??null,
    status:r.status,observedCandles:r.observedCandles,
    // Only COMPLETE (120 contiguous candles) can enter a full-window performance cohort.
    afterAMfePct:r.status.startsWith('COMPLETE_')?pct(r.afterAHigh,r.aPrice):null,
    afterAMaePct:r.status.startsWith('COMPLETE_')?pct(r.afterALow,r.aPrice):null,
    afterBMfePct:r.status==='COMPLETE_SELECTED' && r.observedAfterB ? pct(r.afterBHigh,r.selected.price) : null,
    afterBMaePct:r.status==='COMPLETE_SELECTED' && r.observedAfterB ? pct(r.afterBLow,r.selected.price) : null,
    incompleteReason:r.incompleteReason}));}
  /** Snapshot is safe to persist to a LAB-specific file, never GOLD's volume. */
  snapshot(){return JSON.parse(JSON.stringify({version:2,mode:'OFFLINE_RESEARCH',windowMs:this.windowMs,
    maxRows:this.maxRows,rows:this.rows,seen:[...this.seen],evicted:this.evicted}));}
  restore(doc){
    if(!doc||doc.version!==2||doc.mode!=='OFFLINE_RESEARCH'||doc.windowMs!==this.windowMs||
      !Array.isArray(doc.rows)||doc.rows.length>this.maxRows||!Array.isArray(doc.seen)||doc.seen.length>15000)
      throw Error('INVALID_SNAPSHOT');
    if(this.rows.length||this.active.size)throw Error('RESTORE_REQUIRES_EMPTY');
    for(const r of doc.rows){
      if(!validEvent({symbol:r.symbol,timeframe:'1m',signal:'LONG_A',barClosedAtMs:r.aAt,
        price:r.aPrice,id:r.id}) || r.deadlineMs!==r.aAt+this.windowMs ||
        !Number.isSafeInteger(r.lastObservedBarAt) || !Number.isSafeInteger(r.observedCandles) ||
        !['PENDING','SELECTED_RESEARCH_ONLY','EXPIRED','COMPLETE_SELECTED','COMPLETE_NO_SELECTION',
          'INCOMPLETE','SELECTED_AND_CLOSED','CLOSED_NO_SELECTION'].includes(r.status))throw Error('INVALID_RECORD');
    }
    this.rows=doc.rows;this.seen=new Set(doc.seen);this.evicted=Number.isSafeInteger(doc.evicted)?doc.evicted:0;
    for(const r of this.rows){
      if(isPending(r)){
        // Across process restart, unobserved 1m interval is unknown. Do not
        // reconnect it to fresh bars and pretend complete historical coverage.
        r.status='INCOMPLETE';r.incompleteReason='RESTART_UNVERIFIED_CONTINUITY';
      }
    }
    return {restored:this.rows.length,pendingInvalidated:this.rows.filter(x=>x.incompleteReason==='RESTART_UNVERIFIED_CONTINUITY').length};
  }
  summary(){
    const counts={episodes:this.rows.length,pending:0,expired:0,selectedAtB1:0,selectedAtB2:0,
      rejectedBoth:0,closedNoSelection:0,complete:0,incomplete:0,selectedComplete:0,selectedIncomplete:0,evicted:this.evicted};
    for(const r of this.rows){
      if(isPending(r))counts.pending++;
      if(r.status==='EXPIRED')counts.expired++;
      if(r.status.startsWith('COMPLETE_'))counts.complete++;
      if(r.status==='INCOMPLETE')counts.incomplete++;
      if(r.status==='COMPLETE_SELECTED')counts.selectedComplete++;
      if(r.status==='INCOMPLETE'&&r.selected)counts.selectedIncomplete++;
      if(r.selected?.number===1)counts.selectedAtB1++;
      if(r.selected?.number===2)counts.selectedAtB2++;
      if(r.bAttempts.length===2&&!r.selected)counts.rejectedBoth++;
      if(['CLOSED_NO_SELECTION','COMPLETE_NO_SELECTION'].includes(r.status))counts.closedNoSelection++;
    }
    return {mode:'OFFLINE_RESEARCH',sendsFCM:false,entersHome:false,
      windowMinutes:this.windowMs/MIN,maxBConsidered:2,...counts};
  }
}

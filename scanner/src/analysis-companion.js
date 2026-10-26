/** Independent, causal analysis of an already accepted LONG_A.
 * Standard SMA, Wilder ATR and rolling-range formulas; no proprietary code.
 * No signal generation, network, orders, or changes to Pine / notification rules.
 */
export const ANALYSIS_METHOD = 'YELLOW_COMPANION_V1';
export const ANALYSIS_FRAMES = Object.freeze(['1m', '5m', '15m', '1h']);
export const ANALYSIS_PERIODS = Object.freeze({'1m':60_000, '5m':300_000, '15m':900_000, '1h':3_600_000});
export const ANALYSIS_KEYS = Object.freeze({'1m':'oneMinute', '5m':'fiveMinute', '15m':'fifteenMinute', '1h':'oneHour'});
export const ANALYSIS_HORIZON_MS = 120 * 60_000;
const MINUTE = 60_000;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const positive = x => finite(x) && x > 0;
const mean = xs => xs.reduce((a,b) => a+b, 0) / xs.length;
const high = bars => Math.max(...bars.map(b => b.high));
const low = bars => Math.min(...bars.map(b => b.low));

export function validAnalysisEventId(id) {
  if (typeof id !== 'string' || id.length > 100) return false;
  const m = /^([A-Z0-9]{2,25}USDT):(1m|5m|15m|1h):([1-9][0-9]{0,15}):LONG_A$/.exec(id);
  return !!m && Number.isSafeInteger(Number(m[3])) && Number(m[3]) % ANALYSIS_PERIODS[m[2]] === 0;
}

export function validAnalysisBar(b, period = MINUTE) {
  return !!b && Number.isSafeInteger(b.endMs) && b.endMs > 0 && b.endMs % period === 0 &&
    [b.open,b.high,b.low,b.close].every(positive) && finite(b.volume) && b.volume >= 0 &&
    b.high >= Math.max(b.open,b.close) && b.low <= Math.min(b.open,b.close) && b.high >= b.low;
}

// A context ending exactly at T is usable only if actually present at capture.
// Late/future bars never repair an immutable analysis after the fact.
function closedHistory(raw, timeframe, asOfMs) {
  const period = ANALYSIS_PERIODS[timeframe];
  if (!Array.isArray(raw)) return null;
  const bars = raw.filter(b => !Number.isSafeInteger(b?.endMs) || b.endMs <= asOfMs).slice(-190);
  if (bars.length < 100 || bars.at(-1).endMs !== Math.floor(asOfMs / period) * period ||
      !bars.every((b,i) => validAnalysisBar(b,period) && (!i || b.endMs-bars[i-1].endMs === period))) return null;
  return bars;
}

function atr14(bars) {
  const ranges = bars.slice(1).map((b,i) => Math.max(b.high-b.low,
    Math.abs(b.high-bars[i].close), Math.abs(b.low-bars[i].close)));
  let atr = mean(ranges.slice(0,14));
  for (const tr of ranges.slice(14)) atr = (atr*13+tr)/14;
  return atr;
}

function frameAnalysis(bars, timeframe) {
  if (!bars) return {timeframe, availability:'UNAVAILABLE', reason:'INCOMPLETE_CLOSED_HISTORY'};
  const last = bars.at(-1), closes = bars.map(b => b.close);
  const ma7 = mean(closes.slice(-7)), ma25 = mean(closes.slice(-25)), ma99 = mean(closes.slice(-99));
  const priorVolume = mean(bars.slice(-21,-1).map(b => b.volume));
  return {timeframe, availability:'READY', candleEndMs:last.endMs, close:last.close,
    ma7, ma25, ma99, trend:last.close>ma99 && ma7>ma25 ? 'UP' : last.close<ma99 && ma7<ma25 ? 'DOWN' : 'MIXED',
    relativeVolume:priorVolume>0 ? last.volume/priorVolume : null, atr14:atr14(bars)};
}

function levelsAndPlan(bars, frame, entry) {
  const last = bars.at(-1), prior = bars.slice(-21,-1), atr = frame.atr14;
  const rangeHigh = high(prior), rangeLow = low(prior);
  // Confirm pivots with two candles on each side; never backdate availability.
  const supports = [rangeLow], resistances = [rangeHigh];
  for (let i=2; i<bars.length-2; i++) {
    const neighbors = [bars[i-2],bars[i-1],bars[i+1],bars[i+2]];
    if (neighbors.every(b => bars[i].high>b.high)) resistances.push(bars[i].high);
    if (neighbors.every(b => bars[i].low<b.low)) supports.push(bars[i].low);
  }
  const below = supports.filter(x => x<entry), above = resistances.filter(x => x>entry);
  const support = below.length ? Math.max(...below) : null;
  const resistance = above.length ? Math.min(...above) : null;
  let interaction = last.close>rangeHigh ? 'BREAKOUT' : last.close<rangeLow ? 'BREAKDOWN' : 'INSIDE_RANGE';
  let breakoutLevel = interaction==='BREAKOUT' ? rangeHigh : null;
  // A retest must follow a prior closed breakout, not a future pivot label.
  const base = bars.slice(-26,-6), recent = bars.slice(-6,-1), level = high(base);
  const breakoutAt = recent.findIndex((b,i) => b.close>level && (i ? recent[i-1].close : base.at(-1).close)<=level);
  if (interaction==='INSIDE_RANGE' && positive(atr) && breakoutAt>=0 &&
      recent.slice(breakoutAt).every(b => b.close>=level-atr*.25) &&
      last.low<=level+atr*.25 && last.low>=level-atr*.5 && last.close>level) {
    interaction='RETEST';breakoutLevel=level;
  }
  const levels = {support,resistance,rangeHigh,rangeLow,interaction,breakoutLevel};
  if (!positive(atr) || Math.abs(last.close-entry)>Math.max(entry*1e-8,1e-12))
    return {levels,plan:null,reason:'INVALID_ATR_OR_SIGNAL_PRICE'};
  const stopLoss = low(bars.slice(-5))-atr*.25, risk = entry-stopLoss;
  if (!positive(stopLoss) || !positive(risk)) return {levels,plan:null,reason:'INVALID_STOP_DISTANCE'};
  return {levels,plan:{referenceEntry:entry,entryLow:Math.max(stopLoss+ risk*.01,entry-atr*.10),
    entryHigh:entry+atr*.25,stopLoss,tp1:entry+risk,tp2:entry+2*risk,tp3:entry+3*risk,
    riskPct:risk/entry*100,roomToResistanceR:resistance===null ? null : (resistance-entry)/risk},reason:null};
}

/** Snapshot uses information available at signal/capture time only. */
export function analyzeLongA(event, snapshot, capturedAtMs) {
  if (!event || !validAnalysisEventId(event.id) || event.signal!=='LONG_A' ||
      event.id!==`${event.symbol}:${event.timeframe}:${event.barClosedAtMs}:LONG_A` || !positive(event.price) ||
      !Number.isSafeInteger(capturedAtMs) || capturedAtMs<event.barClosedAtMs ||
      capturedAtMs-event.barClosedAtMs>5*MINUTE) throw Error('INVALID_ANALYSIS_EVENT');
  const histories = Object.fromEntries(ANALYSIS_FRAMES.map(tf => [tf,
    closedHistory(snapshot?.[ANALYSIS_KEYS[tf]],tf,event.barClosedAtMs)]));
  const frames = ANALYSIS_FRAMES.map(tf => frameAnalysis(histories[tf],tf));
  const warnings = frames.filter(f => f.availability!=='READY').map(f => `MISSING_${f.timeframe}`);
  const target = frames.find(f => f.timeframe===event.timeframe);
  const detail = histories[event.timeframe] ? levelsAndPlan(histories[event.timeframe],target,event.price) : null;
  if (frames.some(f => f.trend==='DOWN')) warnings.push('TREND_CONFLICT');
  if (target.relativeVolume===null) warnings.push('VOLUME_BASELINE_ZERO');
  if (detail?.reason) warnings.push(detail.reason);
  const plan = warnings.some(w => w.startsWith('MISSING_')) ? null : detail?.plan ?? null;
  if (plan?.roomToResistanceR!==null && plan?.roomToResistanceR<1) warnings.push('RESISTANCE_WITHIN_1R');
  return {schemaVersion:1,method:ANALYSIS_METHOD,mode:'RESEARCH_ONLY',
    eventId:event.id,symbol:event.symbol,timeframe:event.timeframe,
    signalAtMs:event.barClosedAtMs,capturedAtMs,expiresAtMs:event.barClosedAtMs+15*MINUTE,
    availability:frames.every(f => f.availability==='READY') ? 'READY' : 'PARTIAL',
    frames,levels:detail?.levels ?? null,plan,warnings};
}

/** Frozen scenario, simulated on the first FULL 1m candle after detection.
 * 14bps is a declared combined cost assumption, not an exchange fee quote.
 * This measures TP1 vs SL only; TP2/TP3 are displayed reference levels.
 */
export function newPaperOutcome(analysis, costBps=14) {
  if (!finite(costBps) || costBps<0 || costBps>1000) throw Error('INVALID_PAPER_COST');
  const entryAtMs = Math.ceil(analysis.capturedAtMs/MINUTE)*MINUTE;
  return {status:analysis.plan ? 'WAITING_ENTRY' : 'NO_PLAN',entryAtMs,
    deadlineMs:entryAtMs+ANALYSIS_HORIZON_MS,lastBarEndMs:entryAtMs,
    entryPrice:null,exitPrice:null,endedAtMs:null,mfePct:0,maePct:0,
    grossReturnPct:null,netReturnPct:null,costBps};
}

export function advancePaperOutcome(analysis, previous, bar) {
  if (!['WAITING_ENTRY','OPEN'].includes(previous.status)) return previous;
  if (!validAnalysisBar(bar) || bar.endMs<=previous.lastBarEndMs) return previous;
  const state = {...previous};
  if (bar.endMs!==state.lastBarEndMs+MINUTE) return {...state,status:'INCOMPLETE_DATA',endedAtMs:bar.endMs};
  const plan = analysis.plan;
  if (state.status==='WAITING_ENTRY') {
    if (bar.open<plan.entryLow || bar.open>plan.entryHigh || bar.open<=plan.stopLoss || bar.open>=plan.tp1)
      return {...state,status:'NOT_ENTERED',endedAtMs:bar.endMs,lastBarEndMs:bar.endMs};
    state.entryPrice=bar.open;state.status='OPEN';
  }
  state.lastBarEndMs=bar.endMs;
  state.mfePct=Math.max(state.mfePct,(bar.high/state.entryPrice-1)*100);
  state.maePct=Math.min(state.maePct,(bar.low/state.entryPrice-1)*100);
  const hitStop = bar.low<=plan.stopLoss, hitTarget = bar.high>=plan.tp1;
  if (bar.open<=plan.stopLoss) {state.status='SL_BEFORE_TP1';state.exitPrice=bar.open;}
  else if (bar.open>=plan.tp1) {state.status='TP1_BEFORE_SL';state.exitPrice=plan.tp1;}
  else if (hitStop && hitTarget) {state.status='AMBIGUOUS';}
  else if (hitStop) {state.status='SL_BEFORE_TP1';state.exitPrice=plan.stopLoss;}
  else if (hitTarget) {state.status='TP1_BEFORE_SL';state.exitPrice=plan.tp1;}
  else if (bar.endMs>=state.deadlineMs) {state.status='TIMEOUT';state.exitPrice=bar.close;}
  if (state.status!=='OPEN') {
    state.endedAtMs=bar.endMs;
    if (state.exitPrice!==null) {
      state.grossReturnPct=(state.exitPrice/state.entryPrice-1)*100;
      state.netReturnPct=state.grossReturnPct-state.costBps/100;
    }
  }
  return state;
}

export function summarizeAnalysis(records) {
  const counts = {};
  for (const record of records) counts[record.paper.status]=(counts[record.paper.status]||0)+1;
  const wins=counts.TP1_BEFORE_SL||0, losses=counts.SL_BEFORE_TP1||0;
  const completed=records.filter(r => ['TP1_BEFORE_SL','SL_BEFORE_TP1','TIMEOUT'].includes(r.paper.status));
  return {sampleSize:records.length,counts,tp1BeforeSlRate:wins+losses ? wins/(wins+losses) : null,
    decisiveSampleSize:wins+losses,pricedExitSampleSize:completed.length,
    meanNetReturnPct:completed.length ? mean(completed.map(r => r.paper.netReturnPct)) : null,
    ambiguousExcluded:counts.AMBIGUOUS||0,simulation:true,
    interpretation:'TP1_VS_SL_PAPER_ONLY_NOT_LIVE_WIN_RATE'};
}

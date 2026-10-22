/** Offline deployment acceptance. No fetch, secrets, signal generation or writes.
 * Thresholds are the owner's release contract, independent of runtime filters.
 */
const frames=new Set(['1m','5m','15m','1h']);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const positiveTime=n=>Number.isSafeInteger(n)&&n>0;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const eligible=row=>finite(row?.price)&&row.price>0&&row.price<10&&
  finite(row?.binance24hChangePct)&&row.binance24hChangePct>1&&
  finite(row?.quoteVolume24h)&&row.quoteVolume24h>10_000_000;
const symbol=s=>typeof s==='string'&&/^[A-Z0-9]{2,25}USDT$/.test(s);

export function auditV2ApiContract(snapshot){
  const failures=[];
  const check=(ok,code)=>{if(!ok)failures.push(code);};
  const {capturedAtMs,status,universe,home,events}=snapshot||{};
  check(positiveTime(capturedAtMs),'CAPTURE_TIMESTAMP_REQUIRED');
  check(status?.ok===true&&status.mode==='LIVE_SHADOW'&&
    status.exchange==='BINANCE_USDM_PERPETUAL'&&status.tickerConnected===true&&
    status.klineConnected===true&&status.wsRecovering===false&&
    status.requestGuard?.circuitOpen===false,'BACKEND_NOT_HEALTHY');
  if(status?.alertTimeframes!==undefined){
    const lanes=status.alertTimeframes;
    check(Array.isArray(lanes)&&lanes.length===4&&new Set(lanes).size===4&&lanes.every(tf=>frames.has(tf)),
      'DECLARED_ALERT_TIMEFRAMES_NOT_FOUR');
  }
  for(const [name,body,field] of [['universe',universe,'universe'],['home',home,'home'],['events',events,'events']]){
    check(body?.simulation===false&&body.mode==='LIVE_SHADOW',name.toUpperCase()+'_NOT_LIVE_REPLY');
    check(Array.isArray(body?.[field]),name.toUpperCase()+'_ARRAY_REQUIRED');
  }
  const rows=Array.isArray(universe?.universe)?universe.universe:[];
  const at=universe?.generatedAtMs;
  check(positiveTime(at)&&positiveTime(capturedAtMs)&&Math.abs(at-capturedAtMs)<=120_000,
    'SNAPSHOT_TIME_NOT_COMPARABLE');
  const fresh=(value,maxAge)=>positiveTime(at)&&positiveTime(value)&&at-value<maxAge&&value-at<=120_000;
  check(fresh(universe?.lastTickerDataAtMs,30_000)&&fresh(status?.lastTickerDataAtMs,30_000),
    'TICKER_FEED_NOT_FRESH');
  // An empty, connected universe has no kline subscriptions and no data yet.
  check(status?.allocatedScanSlots===0||fresh(status?.lastKlineDataAtMs,30_000),'KLINE_FEED_NOT_FRESH');
  const seen=new Set();
  for(const row of rows){
    check(symbol(row?.symbol),'UNIVERSE_SYMBOL_INVALID');
    check(!seen.has(row?.symbol),'UNIVERSE_DUPLICATE_SYMBOL');seen.add(row?.symbol);
    check(eligible(row),'UNIVERSE_STRICT_FILTER_OR_VOLUME_FAILED');
    check(fresh(row?.tickerObservedAtMs,120_000),'UNIVERSE_ROW_TICKER_NOT_FRESH');
    check(['SCANNING','BOOTSTRAPPING','QUEUED'].includes(row?.coverage),'UNIVERSE_COVERAGE_STATE_INVALID');
  }
  const coverage=universe?.coverage||{};
  const scanning=rows.filter(row=>row?.coverage==='SCANNING').length;
  check(coverage.maxTracked===50&&status?.maxTracked===50,'SCANNER_CAPACITY_NOT_50');
  check(integer(coverage.covered)&&integer(coverage.eligible)&&integer(coverage.allocatedScanSlots)&&
    coverage.covered===scanning&&coverage.eligible===rows.length&&
    coverage.covered<=coverage.allocatedScanSlots&&coverage.allocatedScanSlots<=50,
    'UNIVERSE_COVERAGE_COUNTS_INVALID');
  check(integer(status?.covered)&&integer(status?.eligible)&&integer(status?.allocatedScanSlots)&&
    status.covered<=status.eligible&&status.covered<=status.allocatedScanSlots&&status.allocatedScanSlots<=50,
    'STATUS_COVERAGE_COUNTS_INVALID');
  check(status?.covered===coverage.covered&&status?.eligible===coverage.eligible&&
    status?.allocatedScanSlots===coverage.allocatedScanSlots,'SNAPSHOT_COUNTS_CHANGED_RECAPTURE');
  const ratio=rows.length?scanning/rows.length:0;
  check(finite(status?.coverageRatio)&&Math.abs(status.coverageRatio-ratio)<1e-9,'COVERAGE_RATIO_INVALID');
  check(status?.uncoveredEligible===rows.length-scanning&&
    status?.coverageComplete===(scanning===rows.length),'COVERAGE_COMPLETENESS_INVALID');
  const target=Math.min(rows.length,50);
  check(scanning===target&&status?.bootstrapInProgress===0,'STEADY_COVERAGE_NOT_REACHED');

  for(const [name,records] of [['HOME',home?.home],['EVENTS',events?.events]]){
    if(!Array.isArray(records))continue;
    const ids=new Set();
    for(const event of records){
      check(event?.signal==='LONG_A'&&symbol(event?.symbol)&&frames.has(event?.timeframe)&&
        positiveTime(event?.barClosedAtMs)&&
        event?.id===`${event?.symbol}:${event?.timeframe}:${event?.barClosedAtMs}:LONG_A`,name+'_EVENT_IDENTITY_INVALID');
      check(!ids.has(event?.id),name+'_DUPLICATE_EVENT_ID');ids.add(event?.id);
      check(eligible(event),name+'_STRICT_FILTER_OR_VOLUME_FAILED');
      check(positiveTime(event?.barClosedAtMs)&&event.barClosedAtMs<=at,name+'_FUTURE_OR_INVALID_BAR');
      if(name==='EVENTS')check(event?.barClosedAtMs>=at-300_000&&
        positiveTime(event?.expiresAtMs)&&event.expiresAtMs>at,'EVENTS_NOT_DELIVERABLE');
      else check(positiveTime(event?.firstSeenMs)&&event.firstSeenMs>=event.barClosedAtMs&&
        event.firstSeenMs<=at&&positiveTime(event?.homeExpiresMs)&&event.homeExpiresMs>at,
        'HOME_EXPIRY_INVALID');
    }
  }
  return {scope:'OFFLINE_V2_API_CONTRACT_ONLY',passed:failures.length===0,capturedAtMs,
    covered:scanning,eligible:rows.length,expectedCoveredWhenSteady:target,
    failures:[...new Set(failures)],
    notVerified:['DEPLOYED_COMMIT_IDENTITY','CEX_MEMBERSHIP_PARITY','FOUR_TF_PUBLICATION_BEHAVIOR','FOUR_TF_DEVICE_FCM_RECEIPT',
      'TRADINGVIEW_APP_BEHAVIOR','APK_SIGNER_AND_UPDATE_IN_PLACE','CREDENTIAL_SECURITY']};
}

/** Binance USD-M LIVE data plane. Exactly one WS ticker stream, one WS kline
 * connection, and one strictly budgeted REST gateway. No proxy or IP evasion.
 * Deliberate coverage cap is visible in /api/status (never claim full-universe).
 */
import {RequestGuard,klineWeight,CircuitOpen,RestPaused} from './live-request-guard.js';
import {CandleBook,CandleGap,KEYS} from './live-candle-book.js';
import {LiveHomeLedger} from './live-home-ledger.js';
import {stepLongAOnTimeframe,PERIODS} from './parallel-long-a.js';
import {normalizeBinanceTicker} from './binance-fixture-adapter.js';
import {eligibleUniverse} from './long-a.js';
import path from 'node:path';
import {LaneCheckpoint} from './live-state-checkpoint.js';

const API='https://fapi.binance.com';
const WS_RAW='wss://fstream.binance.com/market/ws';
const WS_SUBSCRIBE='wss://fstream.binance.com/market/stream';
const frames=['1m','5m','15m','1h'];
const validSymbol=s=>/^[A-Z0-9]{2,25}USDT$/.test(s||'');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export class YellowLiveMarket {
  constructor({dataDir,clock=()=>Date.now(),guard=null,wsClass=globalThis.WebSocket,
    maxTracked=200,fetchIntervalMs=600_000,sendEvent=async()=>{},passiveEvidence=null,random=Math.random,
    log=(...args)=>console.log(...args)}={}){
    if(!dataDir)throw new Error('YELLOW_DATA_DIR_REQUIRED');
    if(!wsClass)throw new Error('WEBSOCKET_NOT_AVAILABLE');
    this.random=random;this.feedGeneration=0;this.wsRecovering=false;this.wsRecoveryAttempts=0;
    this.wsReconnectAtMs=0;this.wsReconnectDeadlineMs=0;this.wsHealthySinceMs=0;this.wsRecoveryDataAtMs=0;
    this.clock=clock;this.dataDir=dataDir;this.wsClass=wsClass;this.log=log;
    if(!Number.isSafeInteger(maxTracked)||maxTracked<1||maxTracked>200)throw Error('INVALID_MAX_TRACKED');
    this.maxTracked=maxTracked;this.fetchIntervalMs=Math.max(300_000,fetchIntervalMs);
    this.checkpoints=new LaneCheckpoint(path.join(dataDir,'lane-checkpoints'));
    this.guard=guard||new RequestGuard({filename:path.join(dataDir,'binance-circuit.json'),clock});
    this.ledger=new LiveHomeLedger({filename:path.join(dataDir,'home-ledger.json'),clock});
    this.sendEvent=sendEvent;this.passiveEvidence=passiveEvidence;this.exchangeSymbols=new Map();this.tickers=new Map();this.tickerHistory=new Map();
    this.covered=new Map();this.inProgress=new Set();this.retryAfter=new Map();this.ignored=0;this.eventsEmitted=0;
    this.isRunning=false;this.tickerConnected=false;this.klineConnected=false;
    this.isHalted=false;this.haltReason='';this.nextRefresh=0;this.nextExchangeRefresh=0;
    this.recentFaults=[];this.lastClosedCandleMs=0;this.loopPromise=null;
    this.klineWs=null;this.tickerWs=null;this.nextSubscriptionId=1;this.lastTickerDataAtMs=0;
    this.lastKlineDataAtMs=0;this.firstTrackedAtMs=0;
  }
  async start(){
    if(this.isRunning)throw new Error('ALREADY_RUNNING');
    await this.guard.restore();await this.ledger.restore();
    if(this.guard.closedReason){this.halt('PERSISTENT_'+this.guard.closedReason);return;}
    this.isRunning=true;
    try{
      try{await this.refreshUniverse();}
      catch(e){
        if(!(e instanceof RestPaused))throw e;
        // On cold start, an IP-weight pause after exchangeInfo is temporary.
        // Open the existing WS data plane; retry REST only after the pause.
        this.recordFault('STARTUP_REST_DEFERRED');
      }
      this.connectWebsockets();this.loopPromise=this.workLoop();
    }catch(e){this.halt('STARTUP_'+e.message);throw e;}
  }
  halt(reason){this.isHalted=true;this.haltReason=reason;this.isRunning=false;
    this.wsRecovering=false;this.wsReconnectAtMs=0;this.wsReconnectDeadlineMs=0;this.feedGeneration++;
    try{this.klineWs?.close();}catch{}try{this.tickerWs?.close();}catch{}
    this.log('YELLOW_HALT',reason);
  }
  stop(){this.halt('OPERATOR_STOP');}
  async rest(pathname,{weight=1}={}){
    try{return await this.guard.getJson(API+pathname,{weight});}
    catch(e){
      // High IP weight is a soft REST-only pause; existing kline WS continues.
      if(e instanceof RestPaused)throw e;
      if(e instanceof CircuitOpen || this.guard.closedReason)this.halt(this.guard.closedReason||e.message);
      throw e;
    }
  }
  async refreshUniverse(){
    const generation=this.feedGeneration;
    if(this.isHalted)throw new Error('HALTED');
    // Only on initial startup, market symbol metadata. No needless hourly loops.
    if(!this.exchangeSymbols.size || this.clock()>=this.nextExchangeRefresh){
      const info=await this.rest('/fapi/v1/exchangeInfo');
      if(!Array.isArray(info?.symbols))throw new Error('INVALID_EXCHANGE_INFO');
      this.exchangeSymbols=new Map(info.symbols.filter(s=>validSymbol(s.symbol)&&
        s.quoteAsset==='USDT'&&s.contractType==='PERPETUAL'&&s.status==='TRADING')
        .map(s=>[s.symbol,s]));
      this.nextExchangeRefresh=this.clock()+6*60*60_000;
      for(const symbol of this.covered.keys())if(!this.exchangeSymbols.has(symbol)){
        this.covered.delete(symbol);this.unsubscribe(symbol);
      }
    }
    const result=await this.rest('/fapi/v1/ticker/24hr',{weight:40});
    if(!Array.isArray(result))throw new Error('INVALID_TICKER_24HR');
    if(this.isHalted||generation!==this.feedGeneration)return;
    const at=this.clock();
    for(const ticker of result){
      const exchangeSymbol=this.exchangeSymbols.get(ticker.symbol);if(!exchangeSymbol)continue;
      try{this.recordTicker(normalizeBinanceTicker({symbol:ticker.symbol,ticker,exchangeSymbol,observedAtMs:at}));}
      catch{}
    }
    this.nextRefresh=at+this.fetchIntervalMs;
  }
  recordTicker(ticker){
    if(!this.exchangeSymbols.has(ticker.symbol))return false;
    if(!Number.isFinite(ticker.priceChangePercent)||!Number.isFinite(ticker.lastPrice)||ticker.lastPrice<=0)return false;
    const history=this.tickerHistory.get(ticker.symbol)||[];
    const last=history.at(-1);
    if(last && ticker.observedAtMs<last.observedAtMs)return false;
    this.tickers.set(ticker.symbol,ticker);
    if(last?.observedAtMs===ticker.observedAtMs)history[history.length-1]=ticker;
    else history.push(ticker);
    while(history.length>180)history.shift();
    this.tickerHistory.set(ticker.symbol,history);
    return true;
  }
  getTickerAsOf(symbol,endMs){
    const hist=this.tickerHistory.get(symbol)||[];
    for(let i=hist.length-1;i>=0;i--)if(hist[i].observedAtMs<=endMs)return hist[i];
    return null;
  }
  universe(){
    return eligibleUniverse([...this.tickers.values()].filter(t=>this.clock()-t.observedAtMs<120_000))
      .map(row=>({...row,tickerObservedAtMs:this.tickers.get(row.symbol)?.observedAtMs,
        stale:this.clock()-this.tickers.get(row.symbol).observedAtMs>=30000,coverage:this.covered.has(row.symbol)?'SCANNING':
        this.inProgress.has(row.symbol)?'BOOTSTRAPPING':'QUEUED'}));
  }
  connectWebsockets(){
    if(this.isHalted||this.guard.closedReason)return;
    if(this.tickerWs||this.klineWs)return;
    const ticker=new this.wsClass(WS_RAW+'/!ticker@arr');this.tickerWs=ticker;
    ticker.addEventListener('open',()=>{if(this.isHalted||this.tickerWs!==ticker)return;this.tickerConnected=true;this.lastTickerDataAtMs=this.clock();this.log('TICKER_WS_CONNECTED');});
    ticker.addEventListener('message',e=>{if(this.isHalted||this.tickerWs!==ticker)return;try{
      const payload=JSON.parse(typeof e.data==='string'?e.data:String(e.data));
      if(!Array.isArray(payload))return;
      for(const row of payload){
        // Post-2026 UM/CM stream merge: process USD-M only (st=1).
        if(row.st!==1)continue;
        const symbol=row.s, exchangeSymbol=this.exchangeSymbols.get(symbol);if(!exchangeSymbol)continue;
        const at=Number(row.E);
        if(!Number.isSafeInteger(at)||Math.abs(this.clock()-at)>120_000)continue;
        try{if(this.recordTicker(normalizeBinanceTicker({symbol,
          ticker:{symbol,lastPrice:row.c,priceChangePercent:row.P},exchangeSymbol,observedAtMs:at})))
            {this.lastTickerDataAtMs=this.clock();this.wsRecoveryDataAtMs=this.clock();}}catch{}
      }
    }catch{this.ignored++;}});
    ticker.addEventListener('close',e=>this.onSocketClose('ticker',e,ticker));
    ticker.addEventListener('error',e=>this.onSocketClose('ticker',e,ticker));
    // Binance documents SUBSCRIBE requests at /market/stream, which yields
    // {stream, data} frames; /market/ws/{name} is for a named raw stream.
    const kline=new this.wsClass(WS_SUBSCRIBE);this.klineWs=kline;
    kline.addEventListener('open',()=>{if(this.isHalted||this.klineWs!==kline)return;this.klineConnected=true;this.subscribeAll();this.log('KLINE_WS_CONNECTED');});
    kline.addEventListener('message',e=>{if(this.isHalted||this.klineWs!==kline)return;try{
      const frame=JSON.parse(typeof e.data==='string'?e.data:String(e.data));
      if(frame?.code!==undefined || frame?.error){
        this.halt('BINANCE_KLINE_SUBSCRIPTION_REJECTED');return;
      }
      const data=frame?.data??frame; // Accept both combined and raw shapes.
      if(data?.e==='kline'&&(data.st===undefined||data.st===1)){
        this.lastKlineDataAtMs=this.clock();
        void this.onKline(data).catch(err=>this.recordFault(err.message));
      }
    }catch{this.ignored++;}});
    kline.addEventListener('close',e=>this.onSocketClose('kline',e,kline));
    kline.addEventListener('error',e=>this.onSocketClose('kline',e,kline));
  }
  onSocketClose(which,event={},source=null){
    if(source && source!==(which==='ticker'?this.tickerWs:this.klineWs))return;
    if(this.isHalted)return;
    if(this.guard.closedReason){this.halt('PERSISTENT_'+this.guard.closedReason);return;}
    const code=Number.isSafeInteger(event?.code)?event.code:'UNKNOWN';
    const reason=String(event?.reason||'').slice(0,128).replace(/[\r\n]/g,' ');
    this.log('YELLOW_WS_CLOSE',{which,code,reason,generation:this.feedGeneration});
    if(!this.isRunning){this.halt('WEBSOCKET_DISCONNECTED_'+which+'_REQUIRES_REVIEW');return;}
    if(this.wsReconnectAtMs)return;
    if(this.wsRecoveryAttempts>=3){this.halt('WEBSOCKET_RECOVERY_EXHAUSTED_'+which);return;}
    this.wsRecovering=true;this.wsHealthySinceMs=0;this.feedGeneration++;
    const ticker=this.tickerWs,kline=this.klineWs;
    this.tickerWs=null;this.klineWs=null;
    this.tickerConnected=false;this.klineConnected=false;
    this.lastTickerDataAtMs=0;this.lastKlineDataAtMs=0;this.wsRecoveryDataAtMs=0;
    this.firstTrackedAtMs=0;this.lastClosedCandleMs=0;
    this.covered.clear();this.tickers.clear();this.tickerHistory.clear();
    try{ticker?.close();}catch{}try{kline?.close();}catch{}
    const delay=[5000,20000,60000][this.wsRecoveryAttempts++]+Math.floor(Math.max(0,Math.min(1,this.random()))*1000);
    this.wsReconnectAtMs=this.clock()+delay;this.wsReconnectDeadlineMs=0;
    this.log('YELLOW_WS_RECOVERY_SCHEDULED',{attempt:this.wsRecoveryAttempts,delayMs:delay,generation:this.feedGeneration});
  }
  progressSocketRecovery(){
    if(this.isHalted)return;
    if(this.guard.closedReason){this.halt('PERSISTENT_'+this.guard.closedReason);return;}
    if(!this.wsRecovering)return;
    const now=this.clock();
    if(this.wsReconnectAtMs && now>=this.wsReconnectAtMs){
      this.wsReconnectAtMs=0;this.wsReconnectDeadlineMs=now+90000;
      try{this.connectWebsockets();}catch(e){this.onSocketClose('kline',{reason:'OPEN_FAILED'});return;}
    }
    if(this.wsReconnectDeadlineMs && now>=this.wsReconnectDeadlineMs &&
      !(this.tickerConnected&&this.klineConnected&&this.wsRecoveryDataAtMs)){
      this.onSocketClose('kline',{reason:'RECOVERY_TIMEOUT'});return;
    }
    if(this.tickerConnected&&this.klineConnected&&this.wsRecoveryDataAtMs){
      this.wsRecovering=false;this.wsReconnectDeadlineMs=0;this.wsHealthySinceMs=now;
      this.recordFault('WS_RECOVERED_WAITING_FOR_GUARDED_CANDLE_BOOTSTRAP');
    }
  }
  // Binance requires an unsigned integer request id; symbol/time strings are invalid.
  subscriptionId(){
    const id=this.nextSubscriptionId;
    this.nextSubscriptionId=id>=2_000_000_000?1:id+1;
    return id;
  }
  subscribeAll(){
    if(!this.klineWs||this.klineWs.readyState!==1)return;
    const params=[...this.covered.keys()].flatMap(symbol=>frames.map(tf=>`${symbol.toLowerCase()}@kline_${tf}`));
    if(params.length)this.klineWs.send(JSON.stringify({method:'SUBSCRIBE',params,id:this.subscriptionId()}));
  }
  subscribe(symbol){if(!this.klineWs||this.klineWs.readyState!==1)return;
    this.klineWs.send(JSON.stringify({method:'SUBSCRIBE',params:frames.map(tf=>
      `${symbol.toLowerCase()}@kline_${tf}`),id:this.subscriptionId()}));}
  unsubscribe(symbol){if(!this.klineWs||this.klineWs.readyState!==1)return;
    this.klineWs.send(JSON.stringify({method:'UNSUBSCRIBE',params:frames.map(tf=>
      `${symbol.toLowerCase()}@kline_${tf}`),id:this.subscriptionId()}));}
  recordFault(reason){this.recentFaults.push({at:this.clock(),reason});if(this.recentFaults.length>40)this.recentFaults.shift();
    this.log('YELLOW_FAULT',reason);}

  // A delayed 5m/15m/1h close must not permanently lock the 1m lane.
  // Never invent a candle or ticker. Hold the exact target bar until all
  // CONFIRMED contexts are available; on bounded timeout recycle this symbol.
  retireSymbol(symbol,reason){
    if(!this.covered.has(symbol))return;
    this.covered.delete(symbol);
    this.retryAfter.set(symbol,this.clock()+10*60_000);
    this.unsubscribe(symbol);
    this.recordFault('SAFE_REBOOTSTRAP_'+symbol+'_'+reason);
  }
  async flushTracked(symbol,tracked){
    if(this.isHalted||this.covered.get(symbol)!==tracked)return;
    const snapshot=tracked.book.snapshot();
    for(const tf of frames){
      const key=KEYS[tf],bars=snapshot[key];
      if(!bars?.length)continue;
      // Each timeframe has an independent Pine state and catch-up cursor.
      for(let iteration=0;iteration<190;iteration++){
        if(this.isHalted||this.covered.get(symbol)!==tracked)return;
        const state=tracked.states[tf];
        const nextEnd=state.lastProcessedEndMs+PERIODS[tf];
        const latest=bars.at(-1).endMs;
        if(nextEnd>latest)break;
        if(!bars.some(bar=>bar.endMs===nextEnd)){
          this.retireSymbol(symbol,'TARGET_SEQUENCE_GAP_'+tf);return;
        }
        // No optimistic decisions if a completed MTF candle is slow to arrive.
        // 120s is a maximum lag budget, not a forward-looking candle shortcut.
        if(this.clock()-nextEnd>120_000){
          this.retireSymbol(symbol,'PENDING_CANDLE_TIMEOUT_'+tf);return;
        }
        const target=bars.filter(bar=>bar.endMs<=nextEnd);
        const result=stepLongAOnTimeframe(symbol,tf,{
          ...snapshot,[key]:target,nowMs:this.clock(),
          ticker24h:this.getTickerAsOf(symbol,nextEnd),
          contextMode:'CAUSAL_REALTIME'
        },state);
        if(result.reason?.startsWith('CONTEXT_STALE_OR_INCOMPLETE_')||
           result.reason?.startsWith('CONTEXT_MISSING_')){
          // Next WebSocket context close triggers this drain again.
          break;
        }
        if(result.reason==='STALE_BINANCE_TICKER'||
           result.reason==='INVALID_BINANCE_USDM_24H_TICKER'||
           result.reason==='TARGET_DATA_GAP_REBOOTSTRAP_REQUIRED'||
           result.reason==='TARGET_CANDLES_GAPPED_OR_INSUFFICIENT'||
           result.reason==='ALREADY_PROCESSED'){
          this.retireSymbol(symbol,'UNTRUSTWORTHY_EVALUATION_'+tf+'_'+result.reason);
          return;
        }
        tracked.states[tf]=result.state;
        if(result.event?.signal==='LONG_A'){
          const accepted=await this.ledger.accept(result.event);
          if(accepted.accepted){
             this.eventsEmitted++;
             // Research-only hook. No DB/REST/FCM dependency; every exception
             // must fail open so the original notification path is unchanged.
             try{
               const saved=this.passiveEvidence?.onAcceptedLongA(result.event,target);
               if(saved?.accepted){
                 // MTF context can delay evaluation: catch up ONLY closed bars
                 // already present in the same trusted in-memory candle book.
                 for(const b of bars)if(b.endMs>nextEnd&&b.endMs<=this.clock())
                   this.passiveEvidence.onClosedBar(symbol,tf,b);
               }
             }catch(e){this.log('YELLOW_GOLD_RESEARCH_FAULT','EVENT_HOOK_'+String(e?.message).slice(0,80));}
             await this.sendEvent(accepted.event);
           }
        }
        if(result.reason&&result.reason!=='NO_CONFIRMED_SIGNAL'&&
           result.reason!=='BINANCE_24H_FILTER')
          this.recordFault('EVAL_'+symbol+'_'+tf+'_'+result.reason);
      }
    }
    if(!this.isHalted&&this.covered.get(symbol)===tracked){
      try{await this.checkpoints.save(symbol,tracked.states,this.clock());}
      catch(e){this.halt('CHECKPOINT_WRITE_FAILED');throw e;}
    }
  }
  async bootstrap(symbol){
    if(this.isHalted||this.covered.has(symbol)||this.inProgress.has(symbol)||
      (this.retryAfter.get(symbol)||0)>this.clock())return;
    this.inProgress.add(symbol);
    const generation=this.feedGeneration;
    try{
      const book=new CandleBook(symbol);
      // Binance gives the most recent 170 bars, including the currently open one.
      // Only closed, contiguous candles are used; cold-start signals NEVER fire.
      // Fetch 1M LAST to avoid a budget-window wait creating a 1m stream gap.
      for(const tf of ['1h','15m','5m','1m']){
        if(this.isHalted||generation!==this.feedGeneration||this.wsRecovering)return;
        const data=await this.rest(`/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=170`,{weight:klineWeight(170)});
        const closed=Array.isArray(data)?data.filter(b=>Number(b[6])+1<=this.clock()):[];
        book.bootstrap(tf,closed,this.clock());
      }
      const {states,resumed,cold}=await this.checkpoints.restore(symbol,book,this.clock());
      if(!this.isHalted&&!this.wsRecovering&&generation===this.feedGeneration){
        await this.checkpoints.save(symbol,states,this.clock());
        if(this.isHalted||this.wsRecovering||generation!==this.feedGeneration)return;
        this.covered.set(symbol,{book,states,startedAtMs:this.clock(),resumedLanes:resumed,coldLanes:cold,readyAfterFreshPullback:cold.length>0});
        if(!this.firstTrackedAtMs)this.firstTrackedAtMs=this.clock();
        this.subscribe(symbol);}
    }catch(e){
      if(e instanceof RestPaused){
        // Incomplete 4TF bootstrap is discarded; never promote it into coverage.
        this.retryAfter.set(symbol,Math.max(this.clock(),e.untilMs));
        this.recordFault('BOOTSTRAP_REST_DEFERRED_'+symbol);
      }else{
        this.retryAfter.set(symbol,this.clock()+10*60_000);
        this.recordFault('BOOTSTRAP_'+symbol+'_'+e.message);
        if(this.guard.closedReason)this.halt('BINANCE_CIRCUIT_OPEN');
      }
    }finally{this.inProgress.delete(symbol);}
  }
  async workLoop(){
    while(this.isRunning&&!this.isHalted){
      try{
        this.progressSocketRecovery();
        if(this.wsRecovering){await wait(1200);continue;}
        if(this.wsRecoveryAttempts && this.wsHealthySinceMs && this.tickerConnected&&this.klineConnected &&
          this.lastTickerDataAtMs && this.clock()-this.lastTickerDataAtMs<30000 &&
          this.lastKlineDataAtMs && this.clock()-this.lastKlineDataAtMs<30000 &&
          this.clock()-this.wsHealthySinceMs>=300000){
          this.wsRecoveryAttempts=0;this.wsHealthySinceMs=0;
        }
        // Remote IP-weight headroom affects REST only: preserve WS and tracked TFs.
        // Never probe during the pause; one guarded REST after expiry is sufficient.
        if(this.clock()>=this.nextRefresh && !this.guard.isRemotePaused?.())
          await this.refreshUniverse();
        // Never report healthy scanning if market data silently stopped arriving.
        if(this.tickerConnected && this.lastTickerDataAtMs &&
          this.clock()-this.lastTickerDataAtMs>180_000){
          this.onSocketClose('ticker',{reason:'DATA_STALE'});continue;
        }
        if(this.covered.size && this.klineConnected &&
          this.clock()-(this.lastKlineDataAtMs||this.firstTrackedAtMs)>300_000){
          this.onSocketClose('kline',{reason:'DATA_STALE'});continue;
        }
        if(this.tickerConnected&&this.klineConnected){
          const universe=this.universe();
          const currentEligible=new Set(universe.map(x=>x.symbol));
          for(const [symbol,tracked] of this.covered){
            if(currentEligible.has(symbol)){tracked.ineligibleSinceMs=0;continue;}
            if(!tracked.ineligibleSinceMs)tracked.ineligibleSinceMs=this.clock();
            if(this.clock()-tracked.ineligibleSinceMs>15*60_000){
              this.covered.delete(symbol);this.unsubscribe(symbol);
            }
          }
          await this.bootstrapNextEligible(universe);
        }
      }catch(e){
        if(e instanceof RestPaused)this.recordFault('LOOP_REST_DEFERRED');
        else this.recordFault('LOOP_'+e.message);
        if(this.guard.closedReason)this.halt('CIRCUIT_OPEN');
      }
      if(this.isRunning&&!this.isHalted)await wait(1200);
    }
  }
  async bootstrapNextEligible(universe){
    // One symbol at a time through the unchanged guarded REST gateway.
    for(const item of universe){
      if(this.covered.size>=this.maxTracked||this.isHalted||this.guard.isRemotePaused?.())break;
      if(this.covered.has(item.symbol)||this.inProgress.has(item.symbol)||
        (this.retryAfter.get(item.symbol)||0)>this.clock())continue;
      await this.bootstrap(item.symbol);break;
    }
  }
  async onKline(message,generation=this.feedGeneration){
    if(generation!==this.feedGeneration||this.wsRecovering)return;
    if(message?.k?.st!==undefined&&message.k.st!==1)return;
    // Binance closed-bar events can arrive just before the server wall clock
    // advances to the candle boundary. Postpone briefly; never use future data.
    const candleEnd=Number(message?.k?.T)+1;
    const ahead=candleEnd-this.clock();
    if(message?.k?.x===true && ahead>0 && ahead<=5000){
      setTimeout(()=>{if(!this.isHalted)void this.onKline(message,generation).catch(e=>this.recordFault(e.message));},ahead+100);
      return;
    }
    if(message?.k?.x===true && ahead>5000){this.recordFault('EXCHANGE_CLOCK_AHEAD_TOO_FAR');return;}
    const symbol=message.k?.s,tracked=this.covered.get(symbol);
    if(!tracked||this.isHalted||!this.klineConnected||!this.tickerConnected)return;
    let applied;
    try{applied=tracked.book.ingestKline(message,this.clock());}
    catch(e){this.covered.delete(symbol);this.unsubscribe(symbol);this.retryAfter.set(symbol,this.clock()+10*60_000);
      this.recordFault('CANDLE_GAP_'+symbol+'_'+e.message);return;}
    if(applied.status!=='APPENDED')return;
    this.lastClosedCandleMs=Math.max(this.lastClosedCandleMs,applied.endMs);
    // Already-closed WS bar; no extra subscription or request.
    try{this.passiveEvidence?.onClosedBar(symbol,applied.timeframe,tracked.book.latest(applied.timeframe));}
    catch(e){this.log('YELLOW_GOLD_RESEARCH_FAULT','BAR_HOOK_'+String(e?.message).slice(0,80));}
    // Serial symbol-local evaluation: a late 5m bar may unblock queued 1m
    // candles, and overlapping WebSocket callbacks must never duplicate them.
    const job=(tracked.drain||Promise.resolve()).then(()=>this.flushTracked(symbol,tracked));
    tracked.drain=job.catch(err=>this.recordFault('DRAIN_'+symbol+'_'+err.message));
    await job;
  }
  home(){return this.ledger.home();}
  events(afterMs){return this.ledger.eventsSince(afterMs);}
  status(){const eligible=this.universe();return {
    ok:this.isRunning&&!this.isHalted,mode:this.isHalted?'STOPPED':this.isRunning?'LIVE_SHADOW':'STARTING',
    exchange:'BINANCE_USDM_PERPETUAL',tickerConnected:this.tickerConnected,
    klineConnected:this.klineConnected,eligible:eligible.length,covered:this.covered.size,
    bootstrapInProgress:this.inProgress.size,coverageRatio:eligible.length?this.covered.size/eligible.length:0,
    feedGeneration:this.feedGeneration,wsRecovering:this.wsRecovering,wsRecoveryAttempts:this.wsRecoveryAttempts,
    maxTracked:this.maxTracked,cooldownSymbols:[...this.retryAfter.values()].filter(t=>t>this.clock()).length,eventsEmitted:this.eventsEmitted,lastClosedCandleMs:this.lastClosedCandleMs,
    coverageComplete:eligible.every(x=>this.covered.has(x.symbol)),
    uncoveredEligible:eligible.filter(x=>!this.covered.has(x.symbol)).length,
    laneRecovery:[...this.covered].map(([symbol,t])=>({symbol,resumed:t.resumedLanes||[],cold:t.coldLanes||[]})),
    requestGuard:this.guard.metrics(),fcm:this.fcm?.metrics()||{enabled:false},
    researchEvidence:this.passiveEvidence?.status?.()??{enabled:false},haltReason:this.haltReason,
    lastTickerDataAtMs:this.lastTickerDataAtMs,lastKlineDataAtMs:this.lastKlineDataAtMs,
    lastFaults:this.recentFaults.slice(-10)};}
}

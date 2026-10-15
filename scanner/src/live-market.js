/** Binance USD-M LIVE data plane. Exactly one WS ticker stream, one WS kline
 * connection, and one strictly budgeted REST gateway. No proxy or IP evasion.
 * Deliberate coverage cap is visible in /api/status (never claim full-universe).
 */
import {RequestGuard,klineWeight,CircuitOpen} from './live-request-guard.js';
import {CandleBook,CandleGap,KEYS} from './live-candle-book.js';
import {LiveHomeLedger} from './live-home-ledger.js';
import {newParallelState,stepLongAOnTimeframe,PERIODS} from './parallel-long-a.js';
import {normalizeBinanceTicker} from './binance-fixture-adapter.js';
import {eligibleUniverse} from './long-a.js';
import path from 'node:path';

const API='https://fapi.binance.com';
const WS='wss://fstream.binance.com/market/ws';
const frames=['1m','5m','15m','1h'];
const validSymbol=s=>/^[A-Z0-9]{2,25}USDT$/.test(s||'');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export class YellowLiveMarket {
  constructor({dataDir,clock=()=>Date.now(),guard=null,wsClass=globalThis.WebSocket,
    maxTracked=24,fetchIntervalMs=600_000,sendEvent=async()=>{},
    log=(...args)=>console.log(...args)}={}){
    if(!dataDir)throw new Error('YELLOW_DATA_DIR_REQUIRED');
    if(!wsClass)throw new Error('WEBSOCKET_NOT_AVAILABLE');
    this.clock=clock;this.dataDir=dataDir;this.wsClass=wsClass;this.log=log;
    this.maxTracked=Math.min(200,Math.max(1,maxTracked));this.fetchIntervalMs=Math.max(300_000,fetchIntervalMs);
    this.guard=guard||new RequestGuard({filename:path.join(dataDir,'binance-circuit.json'),clock});
    this.ledger=new LiveHomeLedger({filename:path.join(dataDir,'home-ledger.json'),clock});
    this.sendEvent=sendEvent;this.exchangeSymbols=new Map();this.tickers=new Map();this.tickerHistory=new Map();
    this.covered=new Map();this.inProgress=new Set();this.retryAfter=new Map();this.ignored=0;this.eventsEmitted=0;
    this.isRunning=false;this.tickerConnected=false;this.klineConnected=false;
    this.isHalted=false;this.haltReason='';this.nextRefresh=0;this.nextExchangeRefresh=0;
    this.recentFaults=[];this.lastClosedCandleMs=0;this.loopPromise=null;
    this.klineWs=null;this.tickerWs=null;this.heartbeatAt=0;
  }
  async start(){
    if(this.isRunning)throw new Error('ALREADY_RUNNING');
    await this.guard.restore();await this.ledger.restore();
    if(this.guard.closedReason){this.halt('PERSISTENT_'+this.guard.closedReason);return;}
    this.isRunning=true;
    try{await this.refreshUniverse();this.connectWebsockets();
      this.loopPromise=this.workLoop();
    }catch(e){this.halt('STARTUP_'+e.message);throw e;}
  }
  halt(reason){this.isHalted=true;this.haltReason=reason;this.isRunning=false;
    try{this.klineWs?.close();}catch{}try{this.tickerWs?.close();}catch{}
    this.log('YELLOW_HALT',reason);
  }
  stop(){this.halt('OPERATOR_STOP');}
  async rest(pathname,{weight=1}={}){
    try{return await this.guard.getJson(API+pathname,{weight});}
    catch(e){if(e instanceof CircuitOpen || this.guard.closedReason)this.halt(this.guard.closedReason||e.message);
      throw e;}
  }
  async refreshUniverse(){
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
      .map(row=>({...row,coverage:this.covered.has(row.symbol)?'SCANNING':
        this.inProgress.has(row.symbol)?'BOOTSTRAPPING':'QUEUED'}));
  }
  connectWebsockets(){
    if(this.isHalted)return;
    const ticker=new this.wsClass(WS+'/!ticker@arr');this.tickerWs=ticker;
    ticker.addEventListener('open',()=>{this.tickerConnected=true;this.log('TICKER_WS_CONNECTED');});
    ticker.addEventListener('message',e=>{try{
      const payload=JSON.parse(typeof e.data==='string'?e.data:String(e.data));
      if(!Array.isArray(payload))return;
      for(const row of payload){
        // Post-2026 UM/CM stream merge: process USD-M only (st=1).
        if(row.st!==1)continue;
        const symbol=row.s, exchangeSymbol=this.exchangeSymbols.get(symbol);if(!exchangeSymbol)continue;
        const at=Number(row.E);
        if(!Number.isSafeInteger(at)||Math.abs(this.clock()-at)>120_000)continue;
        try{this.recordTicker(normalizeBinanceTicker({symbol,
          ticker:{symbol,lastPrice:row.c,priceChangePercent:row.P},exchangeSymbol,observedAtMs:at}));}catch{}
      }
    }catch{this.ignored++;}});
    ticker.addEventListener('close',()=>this.onSocketClose('ticker'));
    ticker.addEventListener('error',()=>this.onSocketClose('ticker'));
    const kline=new this.wsClass(WS);this.klineWs=kline;
    kline.addEventListener('open',()=>{this.klineConnected=true;this.subscribeAll();this.log('KLINE_WS_CONNECTED');});
    kline.addEventListener('message',e=>{try{
      const data=JSON.parse(typeof e.data==='string'?e.data:String(e.data));
      if(data?.e==='kline'&&(data.st===undefined||data.st===1))void this.onKline(data).catch(err=>this.recordFault(err.message));
    }catch{this.ignored++;}});
    kline.addEventListener('close',()=>this.onSocketClose('kline'));
    kline.addEventListener('error',()=>this.onSocketClose('kline'));
  }
  onSocketClose(which){
    if(which==='ticker')this.tickerConnected=false;else this.klineConnected=false;
    if(this.isHalted)return;
    // Fail closed. No REST flood or silent socket reconnect after a disconnect.
    this.halt('WEBSOCKET_DISCONNECTED_'+which+'_REQUIRES_REVIEW');
  }
  subscribeAll(){for(const symbol of this.covered.keys())this.subscribe(symbol);}
  subscribe(symbol){if(!this.klineWs||this.klineWs.readyState!==1)return;
    this.klineWs.send(JSON.stringify({method:'SUBSCRIBE',params:frames.map(tf=>
      `${symbol.toLowerCase()}@kline_${tf}`),id:String(this.clock())+symbol}));}
  unsubscribe(symbol){if(!this.klineWs||this.klineWs.readyState!==1)return;
    this.klineWs.send(JSON.stringify({method:'UNSUBSCRIBE',params:frames.map(tf=>
      `${symbol.toLowerCase()}@kline_${tf}`),id:String(this.clock())+'unsub'+symbol}));}
  recordFault(reason){this.recentFaults.push({at:this.clock(),reason});if(this.recentFaults.length>40)this.recentFaults.shift();
    this.log('YELLOW_FAULT',reason);}
  async bootstrap(symbol){
    if(this.isHalted||this.covered.has(symbol)||this.inProgress.has(symbol)||
      (this.retryAfter.get(symbol)||0)>this.clock())return;
    this.inProgress.add(symbol);
    try{
      const book=new CandleBook(symbol);
      // Binance gives the most recent 170 bars, including the currently open one.
      // Only closed, contiguous candles are used; cold-start signals NEVER fire.
      // Fetch 1M LAST to avoid a budget-window wait creating a 1m stream gap.
      for(const tf of ['1h','15m','5m','1m']){
        const data=await this.rest(`/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=170`,{weight:klineWeight(170)});
        const closed=Array.isArray(data)?data.filter(b=>Number(b[6])+1<=this.clock()):[];
        book.bootstrap(tf,closed,this.clock());
      }
      const states=newParallelState();
      for(const tf of frames){states[tf].lastProcessedEndMs=book.latest(tf).endMs;}
      if(!this.isHalted){this.covered.set(symbol,{book,states,startedAtMs:this.clock(),readyAfterFreshPullback:true});
        this.subscribe(symbol);}
    }catch(e){this.retryAfter.set(symbol,this.clock()+10*60_000);
      this.recordFault('BOOTSTRAP_'+symbol+'_'+e.message);
      if(this.guard.closedReason)this.halt('BINANCE_CIRCUIT_OPEN');
    }finally{this.inProgress.delete(symbol);}
  }
  async workLoop(){
    while(this.isRunning&&!this.isHalted){
      try{
        if(this.clock()>=this.nextRefresh)await this.refreshUniverse();
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
          // Priority +5% first, then all +1% as slots become available.
          for(const item of universe){
            if(this.covered.size>=this.maxTracked||this.isHalted)break;
            if(this.covered.has(item.symbol)||this.inProgress.has(item.symbol)||
              (this.retryAfter.get(item.symbol)||0)>this.clock())continue;
            await this.bootstrap(item.symbol);
            break; // one bootstrap each scheduler pass
          }
        }
      }catch(e){this.recordFault('LOOP_'+e.message);if(this.guard.closedReason)this.halt('CIRCUIT_OPEN');}
      if(this.isRunning&&!this.isHalted)await wait(1200);
    }
  }
  async onKline(message){
    if(message?.k?.st!==undefined&&message.k.st!==1)return;
    // Binance closed-bar events can arrive just before the server wall clock
    // advances to the candle boundary. Postpone briefly; never use future data.
    const candleEnd=Number(message?.k?.T)+1;
    const ahead=candleEnd-this.clock();
    if(message?.k?.x===true && ahead>0 && ahead<=5000){
      setTimeout(()=>{if(!this.isHalted)void this.onKline(message).catch(e=>this.recordFault(e.message));},ahead+100);
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
    const tf=applied.timeframe,endMs=applied.endMs;
    this.lastClosedCandleMs=Math.max(this.lastClosedCandleMs,endMs);
    const data=tracked.book.snapshot();
    const result=stepLongAOnTimeframe(symbol,tf,{
      ...data,nowMs:this.clock(),ticker24h:this.getTickerAsOf(symbol,endMs),
      contextMode:'CAUSAL_REALTIME'
    },tracked.states[tf]);
    tracked.states[tf]=result.state;
    if(result.event?.signal==='LONG_A'){
      const accepted=await this.ledger.accept(result.event);
      if(accepted.accepted){this.eventsEmitted++;await this.sendEvent(accepted.event);}
    }
    if(result.reason&&result.reason!=='NO_CONFIRMED_SIGNAL'&&result.reason!=='BINANCE_24H_FILTER')
      this.recordFault(`EVAL_${symbol}_${tf}_${result.reason}`);
  }
  home(){return this.ledger.home();}
  events(afterMs){return this.ledger.eventsSince(afterMs);}
  status(){const eligible=this.universe();return {
    ok:this.isRunning&&!this.isHalted,mode:this.isHalted?'STOPPED':this.isRunning?'LIVE_SHADOW':'STARTING',
    exchange:'BINANCE_USDM_PERPETUAL',tickerConnected:this.tickerConnected,
    klineConnected:this.klineConnected,eligible:eligible.length,covered:this.covered.size,
    bootstrapInProgress:this.inProgress.size,coverageRatio:eligible.length?this.covered.size/eligible.length:0,
    maxTracked:this.maxTracked,cooldownSymbols:[...this.retryAfter.values()].filter(t=>t>this.clock()).length,eventsEmitted:this.eventsEmitted,lastClosedCandleMs:this.lastClosedCandleMs,
    requestGuard:this.guard.metrics(),fcm:this.fcm?.metrics()||{enabled:false},haltReason:this.haltReason,
    lastFaults:this.recentFaults.slice(-10)};}
}

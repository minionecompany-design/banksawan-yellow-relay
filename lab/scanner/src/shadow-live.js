/** BANKSAWAN YELLOW LAB independent natural-market pilot, NEVER trades or sends FCM.
 * Explicit opt-in LAB_LIVE_SHADOW_ENABLED; very small tracked universe (<=12).
 * Existing YELLOW GOLD project/services/endpoints are NEVER called.
 */
import {FirstABResearch} from './cohorts.js';
import {HourAudit} from './hour-audit.js';
import {LabRestGuard} from './rest-guard.js';
import {ShadowStore} from './shadow-persistence.js';
import {LAB_FRAMES,LAB_PERIOD,parseClosedKline,parseStreamKline,selectNaturalPilot,addContiguousBar} from './market-coverage.js';
import {stepLongAOnTimeframe,newParallelState} from './lab-parallel-long-a.js';
import {createHomeCard,chooseHomeCards} from './home-policy.js';
import {wilderRsiSeries} from './reference/long-a.js';
const EXCHANGE='https://fapi.binance.com';
const SOCKET='wss://fstream.binance.com/stream?streams=!ticker@arr';
const KEYS={'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function qualityContext(series,endMs){
  const expected=Math.floor((endMs-1)/LAB_PERIOD['5m'])*LAB_PERIOD['5m'];
  const bars=series.filter(b=>b.endMs<=expected),last=bars.at(-1);
  if(!last||last.endMs!==expected||bars.length<100)return null;
  const closes=bars.map(b=>b.close),g=n=>closes.slice(-n).reduce((a,b)=>a+b,0)/n;
  const rsiSeries=wilderRsiSeries(closes);
  return {endMs:expected,close:last.close,ma7:g(7),ma25:g(25),rsi:rsiSeries.at(-1)};
}
export class LabLiveShadow {
  constructor({env=process.env,clock=()=>Date.now(),rest=null,wsFactory=url=>new WebSocket(url),
    persist=null,log=(...x)=>console.log(...x)}={}){
    this.env=env;this.clock=clock;this.log=log;this.wsFactory=wsFactory;
    this.maxSymbols=Number(env.LAB_MAX_TRACKED||'8');
    if(!Number.isInteger(this.maxSymbols)||this.maxSymbols<1||this.maxSymbols>12)throw Error('LAB_MAX_TRACKED_MUST_BE_1_TO_12');
    this.enabled=env.LAB_LIVE_SHADOW_ENABLED==='true';
    this.publication=env.LAB_PUBLICATION_ENABLED==='true';
    if(this.publication&&!this.enabled)throw Error('PUBLICATION_REQUIRES_LIVE_SHADOW');
    this.guard=rest||new LabRestGuard({filename:(env.LAB_DATA_DIR||'/data')+'/rest-circuit.json'});
    this.store=persist||new ShadowStore({filename:(env.LAB_DATA_DIR||'/data')+'/research.json',clock});
    this.research=new FirstABResearch({clock});this.hourAudit=new HourAudit();
    this.exchangeSymbols=new Set();this.tickers=new Map();this.tickerHistory=new Map();
    this.covered=new Map();this.trackedSymbols=[];this.selections=[];
    this.ws=null;this.started=false;this.halted=false;this.lastTickerAt=0;this.lastKlineAt=0;
    this.lastError=null;this.events=[];this.positiveCount=0;this.hourSignals=0;
    this.stats={closedBars:0,eval1m:0,eval1h:0,firstA:0,bCandidates:0,selected:0,
      invalidBars:0,gaps:0,missedContext:0,wsClose:0,bootstrapFailed:0};
    this.tickTimer=null;this.persisting=false;
  }
  async start(){
    if(!this.enabled)return;
    if(this.started)throw Error('LAB_ALREADY_STARTED');
    this.started=true;await this.guard.init();
    if(this.guard.blocked){this.halt('BINANCE_REST_CIRCUIT_PERSISTED');return;}
    try{const doc=await this.store.load();if(doc){
      this.research.restore(doc.cohorts);
      // Restart loses candle continuity: pending studies must not be scored as successes.
      for(const symbol of [...this.research.active.keys()])this.research.markCoverageLost(symbol,'RESTART_COVERAGE_UNKNOWN');
      this.events=Array.isArray(doc.events)?doc.events.slice(-240):[];
    }}catch(e){this.halt('RESTORE_FAILED:'+e.message);return;}
    try{
      const info=await this.guard.getJson(EXCHANGE+'/fapi/v1/exchangeInfo',1);
      for(const x of info.symbols||[])if(x.contractType==='PERPETUAL'&&x.status==='TRADING'&&
         /USDT$/.test(x.symbol))this.exchangeSymbols.add(x.symbol);
      if(!this.exchangeSymbols.size)throw Error('NO_EXCHANGE_SYMBOLS');
    }catch(e){this.halt('EXCHANGE_BOOTSTRAP_FAILED:'+e.message);return;}
    this.#connect();this.tickTimer=setInterval(()=>this.#housekeeping(),15000);this.tickTimer.unref?.();
  }
  #connect(){if(this.halted)return;
    try{const ws=this.wsFactory(SOCKET);this.ws=ws;
      ws.addEventListener('message',e=>this.#message(e));
      ws.addEventListener('error',()=>{this.lastError='WS_ERROR';});
      ws.addEventListener('close',()=>{if(this.halted)return;
        this.stats.wsClose++;this.halt('WS_DISCONNECTED_FAIL_CLOSED_NO_REST_STORM');});
    }catch(e){this.halt('WS_CONNECT_FAILED:'+e.message);}
  }
  #message(e){if(this.halted)return;let msg;
    try{msg=JSON.parse(e.data);}catch{return;}
    if(msg.stream==='!ticker@arr'){
      const data=Array.isArray(msg.data)?msg.data:[];
      for(const item of data){const symbol=item.s;
        if(!this.exchangeSymbols.has(symbol))continue;
        const timestamp=Number(item.E),price=Number(item.c),pct=Number(item.P),q=Number(item.q);
        if(!Number.isSafeInteger(timestamp)||timestamp>this.clock()+5000||timestamp<this.clock()-30000||
           ![price,pct,q].every(finite)||price<=0||q<0)continue;
        const ticker={symbol,source:'BINANCE_USDM_FUTURES',contractType:'PERPETUAL',status:'TRADING',
          lastPrice:price,priceChangePercent:pct,quoteVolume:q,observedAtMs:timestamp};
        this.tickers.set(symbol,ticker);let h=this.tickerHistory.get(symbol);
        if(!h){h=[];this.tickerHistory.set(symbol,h);}h.push(ticker);
        while(h.length>50)h.shift();
      }
      this.lastTickerAt=this.clock();
      if(!this.trackedSymbols.length && this.tickers.size>100 && !this.pilotLoading)
        void this.#pickAndBootstrap();
      return;
    }
    if(msg.data?.e==='kline'){
      const endMs=Number(msg.data.k?.T)+1, ahead=endMs-this.clock();
      if(msg.data.k?.x===true&&ahead>0&&ahead<=3000){
        setTimeout(()=>{if(!this.halted)this.#message({data:e.data});},ahead+25).unref?.();return;
      }
      const parsed=parseStreamKline(msg.data,this.clock());
      if(!parsed)return;
      const tracked=this.covered.get(parsed.symbol);if(!tracked)return;
      const bars=tracked.bars[parsed.timeframe],r=addContiguousBar(bars,parsed.bar,LAB_PERIOD[parsed.timeframe]);
      if(!r.ok){if(r.reason==='GAP')this.#dropSymbol(parsed.symbol,'BAR_GAP_'+parsed.timeframe);
        return;}
      this.stats.closedBars++;this.lastKlineAt=this.clock();
      if(parsed.timeframe==='1m')this.research.observeClosedBar(parsed.symbol,parsed.bar);
      try{this.#drain(parsed.symbol,tracked);}catch(err){this.#dropSymbol(parsed.symbol,'EVALUATOR_FAILURE');
        this.lastError=String(err.message).slice(0,120);}
    }
  }
  async #pickAndBootstrap(){
    this.pilotLoading=true;
    try{
      // Wait for live tickers to fill; then FIX selection for this process lifetime.
      const fresh=new Map([...this.tickers].filter(([,t])=>this.clock()-t.observedAtMs<15000));
      const symbols=selectNaturalPilot(fresh,this.exchangeSymbols,{maxSymbols:this.maxSymbols});
      if(!symbols.length){this.lastError='NO_ELIGIBLE_PILOT_SYMBOLS';return;}
      this.trackedSymbols=symbols;
      this.log('LAB_PILOT_SELECTED',JSON.stringify({count:symbols.length,criteria:'>=0% 24h, <10USDT, quoteVol>=5M'}));
      for(const symbol of symbols){if(this.halted)break;
        try{await this.#bootstrapSymbol(symbol);}catch(e){this.stats.bootstrapFailed++;
          this.lastError='BOOTSTRAP_'+symbol+'_'+String(e.message).slice(0,60);
          if(this.guard.blocked){this.halt('REST_GUARD_BLOCKED');break;}}
      }
    }finally{this.pilotLoading=false;}
  }
  async #bootstrapSymbol(symbol){
    const bars={},periods={'1h':3600000,'15m':900000,'5m':300000,'1m':60000};
    for(const tf of ['1h','15m','5m','1m']){
      const out=await this.guard.getJson(EXCHANGE+`/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=170`,2);
      if(!Array.isArray(out))throw Error('INVALID_KLINES');
      const seen=out.map(b=>parseClosedKline(b,tf)).filter(b=>b&&b.endMs<=this.clock());
      if(seen.length<120||seen.some((b,i)=>i>0&&b.endMs-seen[i-1].endMs!==periods[tf]))
        throw Error('NONCONTIGUOUS_HISTORY_'+tf);
      bars[tf]=seen.slice(-170);
    }
    const states=newParallelState();for(const tf of LAB_FRAMES){states[tf].lastProcessedEndMs=bars[tf].at(-1).endMs;
      states[tf].index=bars[tf].length-1;}
    const tracked={bars,states,oneMinuteWarm:0,oneHourWarm:0};
    this.covered.set(symbol,tracked);
    const params=LAB_FRAMES.map(tf=>symbol.toLowerCase()+'@kline_'+tf);
    this.ws.send(JSON.stringify({method:'SUBSCRIBE',params,id:Date.now()%1000000000}));
  }
  #asOf(symbol,endMs){const rows=this.tickerHistory.get(symbol)||[];
    return [...rows].reverse().find(x=>x.observedAtMs<=endMs&&endMs-x.observedAtMs<=30000)||null;}
  #drain(symbol,tr){
    for(const tf of ['1m','1h']){
      let state=tr.states[tf];const all=tr.bars[tf],period=LAB_PERIOD[tf];
      const targets=all.filter(b=>b.endMs>state.lastProcessedEndMs);
      for(const bar of targets){
        if(bar.endMs-state.lastProcessedEndMs!==period){this.#dropSymbol(symbol,'STATE_CANDLE_GAP_'+tf);return;}
        const ticker=this.#asOf(symbol,bar.endMs);
        if(!ticker){this.stats.missedContext++;continue;}
        const input={oneMinute:tr.bars['1m'].filter(b=>b.endMs<=bar.endMs),
          fiveMinute:tr.bars['5m'].filter(b=>b.endMs<=bar.endMs),
          fifteenMinute:tr.bars['15m'].filter(b=>b.endMs<=bar.endMs),
          oneHour:tr.bars['1h'].filter(b=>b.endMs<=bar.endMs),
          ticker24h:ticker,contextMode:'CAUSAL_REALTIME',nowMs:this.clock()};
        const result=stepLongAOnTimeframe(symbol,tf,input,state);
        if(result.reason?.startsWith('CONTEXT_')){this.stats.missedContext++;continue;}
        if(result.reason==='STALE_BINANCE_TICKER'||result.reason?.includes('GAPPED')||
          result.reason==='TARGET_DATA_GAP_REBOOTSTRAP_REQUIRED'){
          this.#dropSymbol(symbol,'UNTRUSTWORTHY_'+tf);return;
        }
        tr.states[tf]=result.state;state=result.state;
        if(tf==='1m'){tr.oneMinuteWarm++;this.stats.eval1m++;}else{
          tr.oneHourWarm++;this.stats.eval1h++;
          this.hourAudit.observe({symbol,barClosedAtMs:bar.endMs,source:'BACKEND_CAUSAL_REALTIME',
            emitted:result.event?.signal==='LONG_A',diagnostics:{reason:result.reason||'EVENT',
              ...(result.diagnostics||{})},ticker24hPct:ticker.priceChangePercent});
          if(this.hourAudit.rows.length>1000)this.hourAudit.rows.shift();
        }
        if(!result.event)continue;
        if(tf==='1m'){
          const context=qualityContext(tr.bars['5m'],bar.endMs);
          // First A is only trusted after a continuous startup warm-up; no artificial historical alerts.
          const outcome=this.research.ingest(result.event,{...context,warmVerified:tr.oneMinuteWarm>=45});
          if(outcome.status==='A1_STORED_SILENTLY')this.stats.firstA++;
          if(result.event.signal==='LONG_B')this.stats.bCandidates++;
          if(outcome.status?.endsWith('_SELECTED_RESEARCH_ONLY')){
            this.stats.selected++;if(this.publication){
              const ev={...result.event,bOrdinal:outcome.selection.number,
                episodeAtMs:this.research.active.get(symbol)?.aAt,fromFirstA:true,protectVerified:true,
                qualityPassed:true,eligibleAsOf:true,confirmedClosedBar:true,causalVerified:true};
              this.#recordEvent(ev);
            }
          }
        }else if(result.event.signal==='LONG_A'){
          this.hourSignals++;
          if(this.publication&&tr.oneHourWarm>=12)this.#recordEvent({...result.event,
            eligibleAsOf:true,confirmedClosedBar:true,causalVerified:true});
        }
      }
    }
  }
  #recordEvent(e){
    if(!this.publication||!createHomeCard(e,this.clock()))return;
    if(!this.events.some(old=>old.id===e.id)){this.events.push(e);this.events=this.events.slice(-240);}
  }
  #dropSymbol(symbol,reason){
    this.research.markCoverageLost(symbol,reason);this.covered.delete(symbol);this.stats.gaps++;
    this.lastError='COVERAGE_LOST_'+symbol+'_'+reason;
    // Deliberately no automatic REST rebootstrap or retry storm during pilot.
  }
  async #housekeeping(){
    if(this.halted)return;
    this.research.expireUnobserved(this.clock());
    if(this.lastTickerAt&&this.clock()-this.lastTickerAt>60000){this.halt('TICKER_STREAM_STALE');return;}
    if(this.covered.size&&this.lastKlineAt&&this.clock()-this.lastKlineAt>180000){this.halt('KLINE_STREAM_STALE');return;}
    try{await this.store.save({version:1,mode:'LAB_RESEARCH_ONLY',cohorts:this.research.snapshot(),events:this.events});}
    catch(e){this.halt('RESEARCH_STORE_FAILED:'+e.message);}
  }
  halt(reason){if(this.halted)return;this.halted=true;this.lastError=reason;
    if(this.tickTimer)clearInterval(this.tickTimer);
    if(this.ws)try{this.ws.close();}catch{}
    for(const s of [...this.research.active.keys()])this.research.markCoverageLost(s,'HALTED_'+reason);
    this.log('LAB_FAIL_CLOSED',reason);
  }
  home(){return this.publication&&!this.halted&&this.ready?chooseHomeCards(this.events,this.clock()):[];}
  get ready(){return this.started&&!this.halted&&this.covered.size>0&&
    this.clock()-this.lastTickerAt<30000&&this.clock()-this.lastKlineAt<180000;}
  status(){return {ok:this.ready,simulation:!this.enabled,mode:this.enabled?'LAB_LIVE':'LAB_OFFLINE_RESEARCH',
    dataFresh:this.ready,publicationEnabled:this.publication,notificationsEnabled:false,
    phase:this.publication?'HOME_OBSERVATION':'SILENT_NATURAL_COHORT',
    maxTracked:this.maxSymbols,covered:this.covered.size,selectedUniverseCount:this.trackedSymbols.length,
    lastTickerAtMs:this.lastTickerAt,lastKlineAtMs:this.lastKlineAt,halted:this.halted,lastFault:this.lastError,
    stats:{...this.stats},oneMinute:this.research.summary(),oneHourAEvents:this.hourSignals,oneHourAudit:this.hourAudit.summary(),
    requestGuard:this.guard.metrics(),persistence:this.store.status()};}
}

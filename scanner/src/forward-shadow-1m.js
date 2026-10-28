/** Passive research reducer. All clocks and native receipts are explicit inputs.
 * No network, filesystem, FCM, production market or Android imports.
 */
import {ANALYSIS_FRAMES,ANALYSIS_KEYS,ANALYSIS_PERIODS,validAnalysisBar,
  validAnalysisEventId,newPaperOutcome,advancePaperOutcome} from './analysis-companion.js';
import {newEntryWatch,advanceEntryWatch,observeWatchQuote,watchLight} from './entry-watch.js';
import {newReadinessWatch,advanceReadinessWatch,observeReadinessQuote,readinessColor} from './entry-readiness-v3.js';
import {newContinuationWatchV4,advanceContinuationWatchV4,observeContinuationQuoteV4,continuationColorV4} from './entry-continuation-v4.js';
import {decideSecondSignal1m} from './second-signal-compositor-1m.js';
import {LiveAnalysisDelivery} from './live-analysis-delivery.js';

export const FORWARD_METHOD='YELLOW_FORWARD_SHADOW_1M_V1';
const M=60_000,ACTIVE=new Set(['WAITING_ENTRY','OPEN']);
const copy=x=>structuredClone(x),validTime=Number.isSafeInteger;
const symbolOK=s=>/^[A-Z0-9]{1,25}USDT$/.test(s??'');
const methods=['v15','v3','v4','unified'];
const emptyBook=()=>Object.fromEntries(Object.values(ANALYSIS_KEYS).map(k=>[k,[]]));
const quoteOK=(q,now)=>q&&q.observedAtMs<=now&&now-q.observedAtMs<30_000&&
  validTime(q.exchangeAtMs)&&q.exchangeAtMs<=now&&now-q.exchangeAtMs<30_000;

export class ForwardShadow1m {
  constructor({startedAtMs,sourceCommit,provenance='SYNTHETIC_QA',maxEvents=1000}={}){
    if(!validTime(startedAtMs)||startedAtMs<=0||!/^[a-f0-9]{40}$/.test(sourceCommit??'')||
       !['SYNTHETIC_QA','FORWARD_PUBLIC_WS'].includes(provenance)||
       !Number.isInteger(maxEvents)||maxEvents<1||maxEvents>1000)throw Error('INVALID_FORWARD_CONFIG');
    this.config={startedAtMs,sourceCommit,provenance,maxEvents};
    this.lastReceivedAtMs=startedAtMs;this.records=new Map();this.books=new Map();
    this.generation=0;
    this.deliveries=new Map();this.quotes=new Map();this.coverageIssues=[];
    this.warmed=new Set();
    this.seenEvents=new Set();this.outputs=[];
  }
  emit(type,value){this.outputs.push({type,...copy(value)});}
  issue(reason,now,symbol=null){
    this.coverageIssues.push({reason,atMs:now,symbol});
    this.emit('COVERAGE_ISSUE',{reason,atMs:now,symbol});
  }
  censor(reason,now,symbol=null){
    this.issue(reason,now,symbol);
    for(const r of this.records.values())if(!symbol||r.event.symbol===symbol){
      if(now>=r.event.barClosedAtMs+360*M&&
         ![...Object.values(r.candlePaper),...Object.values(r.quotePaper)].some(p=>p&&ACTIVE.has(p.status)))continue;
      r.issues.push({reason,atMs:now});r.continuity=false;
      for(const k of ['v15','v3','v4']){r[k].state='DATA_GAP';r[k].reason=reason;}
      for(const p of Object.values(r.candlePaper))if(p&&ACTIVE.has(p.status)){
        p.status='INCOMPLETE_DATA';p.endedAtMs=now;
      }
      for(const p of Object.values(r.quotePaper))if(p?.status==='OPEN'){
        p.status='INCOMPLETE_DATA';p.endedAtMs=now;
      }
      this.decide(r,now,false);
    }
    if(symbol)this.quotes.delete(symbol);else this.quotes.clear();
  }
  apply(input){
    const now=input?.receivedAtMs;
    if(!validTime(now)||now<this.lastReceivedAtMs)throw Error('FORWARD_CLOCK_REVERSED');
    this.outputs=[];this.lastReceivedAtMs=now;
    switch(input.type){
      case 'LONG_A':this.event(input.event,now);break;
      case 'WARMUP':this.warmup(input,now);break;
      case 'NATIVE_BAR':this.nativeBar(input,now);break;
      case 'TICKER':this.ticker(input,now);break;
      case 'TICKER_BATCH':
        if(!Array.isArray(input.tickers)||input.tickers.length>1000)throw Error('INVALID_TICKER_BATCH');
        for(const item of input.tickers)this.ticker(item,now);break;
      case 'HEARTBEAT':
        for(const r of this.records.values())if(r.continuity&&now<r.event.barClosedAtMs+360*M&&
          now-r.observedThroughMs>150_000)this.censor('NATIVE_MINUTE_SILENCE',now,r.event.symbol);
        this.flush(now);break;
      case 'GAP':
        this.censor(input.reason??'EXPLICIT_GAP',now,input.symbol??null);
        if(input.reason==='PROCESS_RESTART_CONTINUITY_UNPROVEN'){
          // Old watches remain terminal. A NEW event can seed its own context
          // in this generation, without retroactively repairing old cases.
          this.generation++;this.books.clear();this.deliveries.clear();this.warmed.clear();
        }
        break;
      default:throw Error('UNKNOWN_FORWARD_INPUT');
    }
    return copy(this.outputs);
  }
  event(e,now){
    if(!validAnalysisEventId(e?.id)||e.signal!=='LONG_A'||
       e.id!==`${e.symbol}:${e.timeframe}:${e.barClosedAtMs}:LONG_A`||
       !Number.isFinite(e.price)||e.price<=0||!validTime(e.detectedAtMs)||
       e.detectedAtMs<e.barClosedAtMs||e.detectedAtMs>now)throw Error('INVALID_FORWARD_EVENT');
    if(this.seenEvents.has(e.id)){this.emit('DUPLICATE_EVENT',{eventId:e.id});return;}
    if(this.seenEvents.size>=this.config.maxEvents)throw Error('FORWARD_COHORT_CAPACITY_STOP');
    this.seenEvents.add(e.id);
    if(e.timeframe!=='1m'||e.barClosedAtMs<this.config.startedAtMs){
      this.emit('EXCLUDED_EVENT',{event: e,reason:e.timeframe!=='1m'?'NON_1M':'PRE_COHORT'});return;
    }
    const late=now-e.barClosedAtMs>=M;
    if(!this.books.has(e.symbol)&&this.books.size>=200)throw Error('FORWARD_SYMBOL_CAPACITY_STOP');
    // Late cases remain in the denominator, but cannot masquerade as complete.
    const at=Math.min(now,e.barClosedAtMs+5*M);
    const r={event:copy(e),generation:this.generation,firstObservedAtMs:now,continuity:!late,issues:late?[{reason:'LATE_DISCOVERY',atMs:now}]:[],
      v15:newEntryWatch(e,at),v3:newReadinessWatch(e,at),v4:newContinuationWatchV4(e,at),
      candlePaper:{v15:null,v3:null,v4:null,unified:null},
      quotePaper:{v15:null,v3:null,v4:null,unified:null},
      quotePlans:{},lastKeys:{},lastDecision:null,closedMinutes:0,observedThroughMs:e.barClosedAtMs,
      mfePct:0,maePct:0};
    if(now-e.barClosedAtMs>5*M){
      for(const k of ['v15','v3','v4']){r[k].state='DATA_GAP';r[k].reason='LATE_DISCOVERY';}
    }
    this.records.set(e.id,r);
    if(!this.books.has(e.symbol)){this.books.set(e.symbol,emptyBook());this.deliveries.set(e.symbol,new LiveAnalysisDelivery());}
    this.emit('ACCEPTED_LONG_A',{event:e,firstObservedAtMs:now,completeFromStart:!late});
    this.decide(r,now,true);
  }
  warmup({symbol,candles,capturedAtMs},now){
    if(!this.books.has(symbol)||!validTime(capturedAtMs)||capturedAtMs>now)throw Error('INVALID_WARMUP');
    const book=this.books.get(symbol);
    if(this.warmed.has(symbol)){
      this.emit('WARMUP_IGNORED',{symbol,reason:'NEVER_REPAIR_POST_START_HISTORY'});return;
    }
    const cut=Math.min(...[...this.records.values()].filter(r=>r.event.symbol===symbol&&r.generation===this.generation).map(r=>r.event.barClosedAtMs));
    for(const tf of ANALYSIS_FRAMES){
      const key=ANALYSIS_KEYS[tf],raw=candles?.[key];
      if(!Array.isArray(raw)||raw.length>1000||!raw.every((b,i)=>validAnalysisBar(b,ANALYSIS_PERIODS[tf])&&
         (!i||b.endMs>raw[i-1].endMs)))throw Error('INVALID_WARMUP_CANDLES');
      const seed=raw.filter(b=>b.endMs<=cut).map(b=>({...copy(b),firstReceivedAtMs:now,provenance:'WARMUP_NOT_FORWARD'}));
      // Initial HTTP response can finish after the first native WS message.
      // Preserve that message and its original receipt; never fill a post-A gap.
      book[key]=[...seed,...book[key].filter(b=>b.endMs>cut)].slice(tf==='1m'?-1000:-190);
    }
    this.warmed.add(symbol);
    this.emit('WARMUP_RECEIPT',{symbol,capturedAtMs,receivedAtMs:now,cutAtMs:cut,
      counts:Object.fromEntries(Object.entries(book).map(([k,v])=>[k,v.length]))});
    this.flush(now);
  }
  nativeBar({symbol,timeframe,bar,exchangeAtMs},now){
    const period=ANALYSIS_PERIODS[timeframe];
    if(!symbolOK(symbol)||!period||!validAnalysisBar(bar,period)||bar.endMs>now||
       !validTime(exchangeAtMs)||exchangeAtMs>now||exchangeAtMs<bar.endMs-1000)throw Error('INVALID_NATIVE_RECEIPT');
    const book=this.books.get(symbol);if(!book)return;
    const arr=book[ANALYSIS_KEYS[timeframe]],old=arr.find(b=>b.endMs===bar.endMs);
    if(old){
      if(['open','high','low','close','volume'].some(k=>old[k]!==bar[k]))this.censor('CONFLICTING_NATIVE_CANDLE',now,symbol);
      return;
    }
    if(arr.length&&bar.endMs<arr.at(-1).endMs){this.censor('OUT_OF_ORDER_NATIVE_CANDLE',now,symbol);return;}
    const minuteGap=timeframe==='1m'&&arr.length&&bar.endMs!==arr.at(-1).endMs+M;
    arr.push({...copy(bar),exchangeAtMs,firstReceivedAtMs:now,provenance:'NATIVE_WS'});
    if(arr.length>(timeframe==='1m'?1000:190))arr.shift();
    if(timeframe==='1m'){
      let missing=!!minuteGap;
      for(const r of this.records.values())if(r.generation===this.generation&&r.event.symbol===symbol&&bar.endMs>r.event.barClosedAtMs&&bar.endMs<=r.event.barClosedAtMs+360*M){
        if(bar.endMs!==r.observedThroughMs+M){missing=true;r.continuity=false;r.issues.push({reason:'NATIVE_MINUTE_GAP',atMs:now});}
        r.observedThroughMs=bar.endMs;r.closedMinutes++;
        r.mfePct=Math.max(r.mfePct,(bar.high/r.event.price-1)*100);
        r.maePct=Math.min(r.maePct,(bar.low/r.event.price-1)*100);
      }
      if(missing)this.censor('NATIVE_MINUTE_GAP',now,symbol);
      const d=this.deliveries.get(symbol),before=d.metrics.overflow;d.enqueue(bar);
      if(d.metrics.overflow>before)this.censor('NATIVE_PENDING_OVERFLOW',now,symbol);
    }
    this.flush(now);
  }
  flush(now){
    for(const [symbol,d] of this.deliveries){
      const book=this.books.get(symbol);
      d.flush(book,now,(bar,snapshot)=>{
        for(const r of this.records.values())if(r.generation===this.generation&&r.event.symbol===symbol&&bar.endMs>r.event.barClosedAtMs){
          r.v15=advanceEntryWatch(r.v15,bar,snapshot,now);
          r.v3=advanceReadinessWatch(r.v3,bar,snapshot,now);
          r.v4=advanceContinuationWatchV4(r.v4,bar,snapshot,now);
          r.candlePaper.v15=copy(r.v15.paper);
          for(const k of ['v3','v4','unified']){
            const watch=r[k],p=r.candlePaper[k],plan=k==='unified'?r.lastDecision?.selectedPlan:watch?.plan;
            if(p&&ACTIVE.has(p.status)){
              const gapped=r.v3.state==='DATA_GAP'||r.v4.state==='DATA_GAP';
              r.candlePaper[k]=gapped?{...p,status:'INCOMPLETE_DATA',endedAtMs:now}:
                advancePaperOutcome({plan:r.candlePlans[k]},p,bar);
              if(r.candlePaper[k].status==='WAITING_ENTRY'&&k!=='unified'&&
                 ['INVALIDATED','ENDED'].includes(watch.state))
                r.candlePaper[k]={...r.candlePaper[k],status:'NOT_ENTERED',endedAtMs:now};
            }
            if(k!=='unified'&&plan&&!r.candlePaper[k]){
              r.candlePlans??={};r.candlePlans[k]=copy(plan);
              r.candlePaper[k]=newPaperOutcome({plan,capturedAtMs:watch.confirmedAtMs});
            }
          }
          this.decide(r,now,true);
        }
        return true;
      });
    }
    for(const r of this.records.values())this.decide(r,now,false);
  }
  ticker({symbol,ticker},now){
    if(!this.books.has(symbol))return;
    if(!ticker||ticker.observedAtMs!==now||!Number.isFinite(ticker.lastPrice)||ticker.lastPrice<=0||
       !Number.isFinite(ticker.priceChangePercent)||!Number.isFinite(ticker.quoteVolume24h)||
       !validTime(ticker.exchangeAtMs)||ticker.exchangeAtMs>now)throw Error('INVALID_TICKER_RECEIPT');
    if(this.quotes.get(symbol)?.exchangeAtMs>ticker.exchangeAtMs){
      this.emit('TICKER_REJECTED',{symbol,reason:'EXCHANGE_TIME_REVERSED'});return;
    }
    this.quotes.set(symbol,copy(ticker));
    for(const r of this.records.values())if(r.generation===this.generation&&r.event.symbol===symbol){
      this.advanceQuotePaper(r,ticker,now);
      if(quoteOK(ticker,now)){
        observeWatchQuote(r.v15,ticker,now);
        r.v3=observeReadinessQuote(r.v3,ticker,now);
        r.v4=observeContinuationQuoteV4(r.v4,ticker,now);
      }
      this.decide(r,now,false);
    }
  }
  advanceQuotePaper(r,q,now){
    if(!quoteOK(q,now))return;
    for(const k of methods){
      const p=r.quotePaper[k],plan=r.quotePlans[k];
      if(!p||now<=p.entryAtMs||q.exchangeAtMs<=p.entryExchangeAtMs)continue;
      if(p.status==='OPEN'&&now-p.lastQuoteAtMs>=30_000){
        p.status='INCOMPLETE_DATA';p.endedAtMs=now;p.issue='TICKER_SAMPLE_GAP';continue;
      }
      if(now>p.deadlineMs&&p.status!=='OPEN')continue;
      p.lastQuoteAtMs=now;
      p.targetTouches??=[];
      for(const target of ['tp1','tp2','tp3'])if(q.lastPrice>=plan[target]&&!p.targetTouches.includes(target))p.targetTouches.push(target);
      if(p.status!=='OPEN')continue;
      let status=null,exit=null;
      if(now>=p.deadlineMs){status='OBSERVED_TIMEOUT';exit=q.lastPrice;}
      else if(q.lastPrice<=plan.stopLoss){status='OBSERVED_SL_FIRST';exit=q.lastPrice;}
      else if(q.lastPrice>=plan.tp1){status='OBSERVED_TP1_FIRST';exit=plan.tp1;}
      if(status)Object.assign(p,{status,exitPrice:exit,endedAtMs:now,
        netReturnPct:(exit/p.entryPrice-1)*100-p.costBps/100});
    }
  }
  decide(r,now,full){
    const raw=this.quotes.get(r.event.symbol),ticker=quoteOK(raw,now)?raw:null,snapshot=this.books.get(r.event.symbol);
    // Millisecond ties cannot prove the ticker arrived after confirmation.
    const after=watch=>ticker&&ticker.observedAtMs>(watch.confirmedAtMs??0)?ticker:null;
    const unified=decideSecondSignal1m({event:r.event,v3:r.v3,v4:r.v4,snapshot,
      ticker:after({confirmedAtMs:Math.max(r.v3.confirmedAtMs??0,r.v4.confirmedAtMs??0)}),nowMs:now});
    const decisions={v15:watchLight(r.v15,after(r.v15),now),v3:readinessColor(r.v3,after(r.v3),now),
      v4:continuationColorV4(r.v4,after(r.v4),now),unified};
    for(const k of methods){
      const decision=decisions[k],watch=r[k],plan=k==='unified'?unified.selectedPlan:watch?.plan;
      if(decision.status==='GREEN'&&plan&&ticker&&!r.quotePaper[k]){
        r.quotePlans[k]=copy(plan);
        r.quotePaper[k]={status:'OPEN',entryPrice:ticker.lastPrice,entryAtMs:now,
          entryExchangeAtMs:ticker.exchangeAtMs,deadlineMs:now+120*M,costBps:14,
          lastQuoteAtMs:now,
          exitPrice:null,endedAtMs:null,netReturnPct:null,targetTouches:[],
          assumption:'GREEN_LTP_HYPOTHETICAL_NOT_EXECUTABLE_ASK',
          pathLimitation:'TICKER_SAMPLES_ONLY_UNOBSERVED_INTRASAMPLE_PATH_UNKNOWN'};
        if(k==='unified'){
          r.candlePlans??={};r.candlePlans.unified=copy(plan);
          r.candlePaper.unified=newPaperOutcome({plan,capturedAtMs:now});
        }
      }
      const p=r.quotePaper[k];
      if(p?.status==='OPEN'&&now>p.deadlineMs+30_000){p.status='INCOMPLETE_DATA';p.endedAtMs=now;}
      if(k==='unified'&&r.candlePaper[k]?.status==='WAITING_ENTRY'&&['OFF','RED'].includes(decision.status))
        Object.assign(r.candlePaper[k],{status:'NOT_ENTERED',endedAtMs:now});
      r.lastPaperKeys??={};
      const paperKey=JSON.stringify([r.candlePaper[k]?.status??null,p?.status??null]);
      if(paperKey!==r.lastPaperKeys[k]){
        this.emit('PAPER_TRANSITION',{eventId:r.event.id,lane:k,atMs:now,
          candlePaper:r.candlePaper[k],quotePaper:p});r.lastPaperKeys[k]=paperKey;
      }
      const key=JSON.stringify([decision.status,decision.reason,decision.priority??false,decision.decisionSource??null]);
      if(key!==r.lastKeys[k]){
        this.emit('LAMP_TRANSITION',{eventId:r.event.id,lane:k,atMs:now,decision});r.lastKeys[k]=key;
      }
    }
    r.lastDecision=copy(unified);
    if(full)this.emit('MINUTE_DECISION',{eventId:r.event.id,atMs:now,
      candleEndMs:r.v4.lastBarEndMs,decisions,
      evidence:{v15:r.v15.frames,v3:r.v3.evidence,v4:r.v4.evidence},
      plans:{v15:r.v15.plan,v3:r.v3.plan,v4:r.v4.plan},
      candlePaper:r.candlePaper,quotePaper:r.quotePaper});
  }
  report(){
    const records=[...this.records.values()].map(r=>({event:r.event,generation:r.generation,firstObservedAtMs:r.firstObservedAtMs,
      completeSixHourWindow:r.continuity&&r.closedMinutes===360&&r.observedThroughMs>=r.event.barClosedAtMs+360*M,
      issues:r.issues,mfePct:r.mfePct,maePct:r.maePct,lastDecision:r.lastDecision,
      candlePaper:r.candlePaper,quotePaper:r.quotePaper}));
    // Connected overlapping intervals, not a count of repeated alarms.
    const clusters=[];
    for(const r of records.slice().sort((a,b)=>a.event.barClosedAtMs-b.event.barClosedAtMs)){
      const start=r.event.barClosedAtMs,end=start+360*M;
      const found=clusters.find(c=>c.symbol===r.event.symbol&&c.end>=start);
      if(found){found.end=Math.max(found.end,end);found.eventIds.push(r.event.id);}
      else clusters.push({symbol:r.event.symbol,start,end,eventIds:[r.event.id]});
    }
    const counts={};for(const k of methods){
      const histogram=field=>records.reduce((a,r)=>{const s=r[field][k]?.status??'NO_PLAN';a[s]=(a[s]??0)+1;return a;},{});
      counts[k]={candlePaper:histogram('candlePaper'),quotePaper:histogram('quotePaper')};
    }
    return {method:FORWARD_METHOD,mode:'RESEARCH_ONLY',deploymentAuthorized:false,
      config:this.config,observedThroughMs:this.lastReceivedAtMs,cohortEvents:records.length,
      independentEpisodes:clusters.length,completeSixHourEvents:records.filter(r=>r.completeSixHourWindow).length,
      coverageIssues:copy(this.coverageIssues),counts,episodes:clusters,records,
      audits:{nativeReceiptLocation:'OBSERVER_NOT_PRODUCTION_SCANNER',
        prospective:this.config.provenance==='FORWARD_PUBLIC_WS',
        spreadSlippageVerified:false,productionIntegrationVerified:false},
      releaseDecision:'NO_GO_LIVE'};
  }
}

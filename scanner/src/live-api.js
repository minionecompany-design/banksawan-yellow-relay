import http from 'node:http';
import {validAnalysisEventId} from './analysis-companion.js';
const response=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value));};
export function createLiveApi(market){return http.createServer((req,res)=>{
  let url;try{url=new URL(req.url,'http://localhost');}catch{return response(res,400,{error:'INVALID_URL'});}
  if(req.method!=='GET')return response(res,405,{error:'READ_ONLY'});
  if(url.pathname==='/health/live')return response(res,200,{processAlive:true,marketRunning:market.isRunning,marketHalted:market.isHalted});
  if(url.pathname==='/health')return response(res,market.isHalted||!market.isRunning||market.wsRecovering||!market.tickerConnected||!market.klineConnected?503:200,{ok:market.isRunning&&!market.isHalted&&!market.wsRecovering&&market.tickerConnected&&market.klineConnected,mode:market.isHalted?'STOPPED':market.isRunning?'LIVE_SHADOW':'STARTING',
    circuitOpen:market.guard.metrics().circuitOpen});
  if(url.pathname==='/api/status')return response(res,200,market.status());
  if(market.isHalted||!market.isRunning||market.wsRecovering||!market.tickerConnected||!market.klineConnected||
    (market.lastTickerDataAtMs && market.clock()-market.lastTickerDataAtMs>=30000))
    return response(res,503,{error:'MARKET_NOT_READY_FAIL_CLOSED'});
  if(url.pathname==='/api/home'){
    const home=market.home();let analysisAvailable=market.analysisCompanion?.enabled===true;
    try {
      if(analysisAvailable)for(const event of home){
        // Read an existing frozen result only: never calculate or delay LONG A/FCM here.
        const analysis=market.analysisCompanion.get(event.id);
        event.analysisCaptured=!!analysis;
        if(analysis?.availability==='READY'&&analysis.plan&&analysis.eventId===event.id&&
           analysis.symbol===event.symbol&&analysis.timeframe===event.timeframe&&
           analysis.signalAtMs===event.barClosedAtMs&&
           Math.abs(analysis.plan.referenceEntry-event.price)<=Math.max(event.price*1e-8,1e-12)){
          const p=analysis.plan;
          event.analysisPreview={
            schemaVersion:1,method:analysis.method,mode:analysis.mode,eventId:analysis.eventId,
            signalAtMs:analysis.signalAtMs,capturedAtMs:analysis.capturedAtMs,
            expiresAtMs:analysis.expiresAtMs,referenceEntry:p.referenceEntry,
            entryLow:p.entryLow,entryHigh:p.entryHigh,stopLoss:p.stopLoss,
            tp1:p.tp1,tp2:p.tp2,tp3:p.tp3,
            trendConflict:analysis.warnings.includes('TREND_CONFLICT'),
            resistanceBeforeTp1:analysis.warnings.includes('RESISTANCE_WITHIN_1R')
          };
        }
      }
    }catch{
      analysisAvailable=false;
      for(const event of home){delete event.analysisCaptured;delete event.analysisPreview;}
    }
    return response(res,200,{home,simulation:false,mode:'LIVE_SHADOW',analysisAvailable});
  }
  if(url.pathname==='/api/analysis'||url.pathname==='/api/analysis/summary'){
    const companion=market.analysisCompanion;
    if(!companion?.enabled)return response(res,503,{error:'ANALYSIS_DISABLED'});
    try{
      if(url.pathname==='/api/analysis/summary')return response(res,200,{summary:companion.summary(),simulation:false,mode:'LIVE_SHADOW'});
      const id=url.searchParams.get('eventId');
      if(!validAnalysisEventId(id))return response(res,400,{error:'INVALID_EVENT_ID'});
      // Only expose analyses attached to actual, still-retained HOME records.
      if(!market.home().some(e=>e.id===id))return response(res,404,{error:'EVENT_NOT_IN_HOME'});
      const analysis=companion.get(id);
      if(!analysis)return response(res,404,{error:'ANALYSIS_NOT_CAPTURED'});
      return response(res,200,{analysis,simulation:false,mode:'LIVE_SHADOW'});
    }catch{return response(res,503,{error:'ANALYSIS_UNAVAILABLE'});}
  }
  if(url.pathname==='/api/universe'){
    const universe=market.universe();
    const covered=universe.filter(item=>item.coverage==='SCANNING').length;
    return response(res,200,{universe,simulation:false,mode:'LIVE_SHADOW',
      generatedAtMs:market.clock(),lastTickerDataAtMs:market.lastTickerDataAtMs,
      coverage:{covered,eligible:universe.length,maxTracked:market.maxTracked,
        allocatedScanSlots:market.covered.size}});
  }
  if(url.pathname==='/api/events'){
    const afterMs=Number(url.searchParams.get('afterMs')||0);
    if(!Number.isSafeInteger(afterMs)||afterMs<0)return response(res,400,{error:'BAD_CURSOR'});
    return response(res,200,{events:market.events(afterMs),simulation:false,mode:'LIVE_SHADOW'});
  }
  return response(res,404,{error:'NOT_FOUND'});
});}

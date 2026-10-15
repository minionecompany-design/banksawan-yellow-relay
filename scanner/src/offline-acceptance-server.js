/**
 * OFFLINE ACCEPTANCE SERVER — NOT PRODUCTION / NOT NETWORK CONNECTED.
 * No Binance/TradingView/FCM traffic; listen on 127.0.0.1 only in CLI.
 * POST /internal/replay is disabled unless a local test token is provided.
 * An accepted event is a *simulated* already-evaluated LONG A assertion.
 * It is not a live market signal and cannot prove Pine parity.
 */
import http from 'node:http';
import {createOfflineHomeJournal} from './offline-home-journal.js';
import {eligibleUniverse} from './long-a.js';
import {PERIODS} from './parallel-long-a.js';
const MAX_BODY=32*1024;
const ORIGINAL_SOURCE='BINANCE_USDM_24H+LOCAL_PARALLEL_MTF_EVALUATOR';
const allowedTf=new Set(['1m','5m','15m','1h']);
const validSymbol=s=>typeof s==='string'&&/^[A-Z0-9]{2,25}USDT$/.test(s);
function reply(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
function checkEvent(e){
  if(!e||typeof e!=='object'||Array.isArray(e))return false;
  if(e.signal!=='LONG_A'||!validSymbol(e.symbol)||!allowedTf.has(e.timeframe)||
    !Number.isSafeInteger(e.barClosedAtMs)||e.barClosedAtMs<=0||
    e.barClosedAtMs%PERIODS[e.timeframe]!==0||
    e.id!==`${e.symbol}:${e.timeframe}:${e.barClosedAtMs}:LONG_A`||
    e.source!==ORIGINAL_SOURCE||e.status!=='RESEARCH_ONLY'||
    typeof e.price!=='number'||!Number.isFinite(e.price)||e.price<=0||e.price>=10||
    typeof e.binance24hChangePct!=='number'||!Number.isFinite(e.binance24hChangePct)||
    e.binance24hChangePct<1)return false;
  return true;
}
function takeBody(req){return new Promise((resolve,reject)=>{
  let size=0,chunks=[],failed=false;
  req.on('data',chunk=>{if(failed)return;size+=chunk.length;
    if(size>MAX_BODY){failed=true;reject(new Error('PAYLOAD_TOO_LARGE'));req.destroy();return;}
    chunks.push(chunk);});
  req.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks).toString('utf8'));});
  req.on('error',reject);
});}
export function createOfflineAcceptanceServer({journalFilename,clock=()=>Date.now(),
  offlineReplayToken=null,universeTickers=[]}={}){
  const journal=createOfflineHomeJournal({filename:journalFilename,clock});
  const token=typeof offlineReplayToken==='string'&&offlineReplayToken.length>=24?offlineReplayToken:null;
  return http.createServer(async(req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Yellow-Offline-Demo','true');
    let path;
    try{path=new URL(req.url,'http://localhost').pathname;}catch{reply(res,400,{error:'INVALID_PATH'});return;}
    if(req.method==='GET'){
      if(path==='/health'){reply(res,200,{ok:true,mode:'OFFLINE_ACCEPTANCE',binanceRequests:0,
        realTradingSignals:false,fcmsSent:0,simulation:true});return;}
      if(path==='/api/status'){reply(res,200,{simulation:true,source:'OFFLINE_REPLAY',binanceRequests:0});return;}
      if(path==='/api/home'){try{reply(res,200,{home:await journal.snapshot(),simulation:true,source:'OFFLINE_REPLAY'});}catch{
        reply(res,503,{error:'JOURNAL_UNAVAILABLE_FAIL_CLOSED',simulation:true});}return;}
      if(path==='/api/universe'){reply(res,200,{universe:eligibleUniverse(universeTickers),simulation:true,source:'OFFLINE_REPLAY'});return;}
      reply(res,404,{error:'NOT_FOUND'});return;
    }
    if(req.method==='POST'&&path==='/internal/replay'){
      if(!token||req.headers['x-yellow-offline-key']!==token){reply(res,403,{error:'REPLAY_DISABLED_OR_UNAUTHORIZED'});return;}
      try{
        const body=JSON.parse(await takeBody(req));
        if(!Array.isArray(body.events)||body.events.length>32||body.events.some(e=>!checkEvent(e))){
          reply(res,422,{error:'INVALID_LONG_A_REPLAY_EVENTS'});return;}
        const result=await journal.ingest(body.events);
        reply(res,200,{accepted:result.offlineIntents.length,homeCount:result.home.length,
          rejected:result.rejected,simulation:true,fcmsSent:0});
      }catch(e){reply(res,e.message==='PAYLOAD_TOO_LARGE'?413:400,{error:'INVALID_REPLAY_BODY'});}return;
    }
    reply(res,405,{error:'METHOD_NOT_ALLOWED'});
  });
}

import http from 'node:http';
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
  if(url.pathname==='/api/home')return response(res,200,{home:market.home(),simulation:false,mode:'LIVE_SHADOW'});
  if(url.pathname==='/api/universe')return response(res,200,{universe:market.universe(),simulation:false,mode:'LIVE_SHADOW',
    generatedAtMs:market.clock(),lastTickerDataAtMs:market.lastTickerDataAtMs,
    coverage:{covered:market.covered.size,eligible:market.universe().length,maxTracked:market.maxTracked}});
  if(url.pathname==='/api/events'){
    const afterMs=Number(url.searchParams.get('afterMs')||0);
    if(!Number.isSafeInteger(afterMs)||afterMs<0)return response(res,400,{error:'BAD_CURSOR'});
    return response(res,200,{events:market.events(afterMs),simulation:false,mode:'LIVE_SHADOW'});
  }
  return response(res,404,{error:'NOT_FOUND'});
});}

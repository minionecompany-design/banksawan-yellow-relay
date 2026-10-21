/** LAB-only read-only API. OFFLINE by default; opt-in SHADOW LIVE, publication separately off. */
import http from 'node:http';
import {FirstABResearch} from './cohorts.js';
import {HourAudit} from './hour-audit.js';
import {LabLiveShadow} from './shadow-live.js';
import {chooseHomeCards} from './home-policy.js';
export function makeServer({live=null}={}){
  const research=new FirstABResearch(),hour=new HourAudit();
  return http.createServer((req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
      res.end(JSON.stringify(data));};
    if(req.method!=='GET')return send(405,{error:'READ_ONLY'});
    let route;try{route=new URL(req.url,'http://localhost').pathname;}catch{return send(400,{error:'INVALID_URL'});}
    if(!live){
      if(route==='/health/live')return send(200,{processAlive:true,marketRunning:false,mode:'LAB_OFFLINE_RESEARCH'});
      if(route==='/health')return send(200,{ok:true,live:false,mode:'LAB_OFFLINE_RESEARCH'});
      if(route==='/api/status')return send(200,{ok:false,simulation:true,mode:'LAB_OFFLINE_RESEARCH',
        alertsEnabled:false,covered:0,eligible:0,oneMinute:research.summary(),oneHour:hour.summary()});
      if(route==='/api/home')return send(200,{simulation:true,mode:'LAB_OFFLINE_RESEARCH',home:[]});
      if(route==='/api/events')return send(200,{simulation:true,mode:'LAB_OFFLINE_RESEARCH',events:[]});
    }else{
      if(route==='/health/live')return send(200,{processAlive:true,marketRunning:live.started,halted:live.halted});
      if(route==='/health')return send(live.ready?200:503,{ok:live.ready,mode:'LAB_LIVE',halted:live.halted});
      if(route==='/api/status')return send(200,live.status());
      if(route==='/api/home')return send(live.ready?200:503,
        live.ready?{simulation:false,mode:'LAB_LIVE',publicationEnabled:live.publication,
          home:live.home()}: {error:'LAB_NOT_READY_FAIL_CLOSED'});
      if(route==='/api/events')return send(404,{error:'NO_EVENTS_ENDPOINT_IN_RESEARCH_MODE'});
    }
    return send(404,{error:'NOT_FOUND'});
  });
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const port=Number(process.env.PORT||9876);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
  const live=process.env.LAB_LIVE_SHADOW_ENABLED==='true'?new LabLiveShadow():null;
  const server=makeServer({live});server.listen(port,'0.0.0.0',()=>
    console.log('LAB_API_SERVER',JSON.stringify({port,mode:live?'LAB_LIVE_SHADOW':'LAB_OFFLINE'})));
  if(live)live.start().catch(e=>live.halt('START_FAILED:'+e.message));
}

import http from 'node:http';
import {homeSnapshot} from './src/api-view.js';
import {unavailableSnapshot} from './src/contracts.js';
/** Stage 6: explicit offline/unavailable backend only. No source credentials,
 * outbound requests, FCM, signals, exchange API, order entry, or background jobs.
 * Binds loopback by default; only in a separately approved Railway deployment
 * should BIND_HOST be changed to 0.0.0.0. */
export function handler(req,res,now=Date.now){
 const pathname=new URL(req.url??'/', 'http://localhost').pathname;
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
 function send(code,payload){res.writeHead(code,headers);res.end(JSON.stringify(payload));}
 if(req.method!=='GET')return send(405,{error:'METHOD_NOT_ALLOWED'});
 if(pathname==='/health')return send(200,{state:'OFFLINE_QA',ready:false,live:false,source:'NONE'});
 if(pathname==='/v1/home')return send(200,homeSnapshot([],now(),{dataState:'UNAVAILABLE',reason:'NO_FEED'}));
 if(pathname==='/v1/universe')return send(200,unavailableSnapshot('NO_FEED',now()));
 return send(404,{error:'NOT_FOUND'});
}
export function createOfflineServer(){return http.createServer((req,res)=>handler(req,res));}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 if(process.env.YELLOW_LIVE_ENABLED==='true')throw Error('LIVE_BLOCKED_ON_STAGE6');
 const port=Number(process.env.PORT||8080);
 const host=process.env.BIND_HOST||'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
 createOfflineServer().listen(port,host,()=>console.log('YELLOW_CLEAN_OFFLINE_QA_LISTEN',host,port));
}

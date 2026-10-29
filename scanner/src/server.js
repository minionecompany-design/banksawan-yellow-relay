/** Offline-only preview server. Does not contact Binance / TradingView / Railway. */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {makeDemoStore} from './demo-store.js';

const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const files=new Map([
  ['/',['index.html','text/html; charset=utf-8']],
  ['/app.js',['app.js','text/javascript; charset=utf-8']],
  ['/styles.css',['styles.css','text/css; charset=utf-8']],
  ['/assets/yellow-icon.png',['assets/yellow-icon.png','image/png']]
]);
export function createDemoServer({clock=()=>Date.now()}={}) {
  const store=makeDemoStore(clock);
  return http.createServer(async(req,res)=>{
    const pathname=new URL(req.url||'/', 'http://localhost').pathname;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
    if(req.method!=='GET'){res.writeHead(405);res.end('Read-only demo');return;}
    const api={
      '/api/home':()=>({home:store.getHome(),...store.meta()}),
      '/api/universe':()=>({universe:store.getUniverse(),...store.meta()}),
      '/api/status':()=>store.meta(),
      '/health':()=>({ok:true,mode:'DEMO_OFFLINE',binanceRequests:0})
    };
    if(api[pathname]){
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(api[pathname]()));return;
    }
    const entry=files.get(pathname);
    if(!entry){res.writeHead(404);res.end('Not found');return;}
    try {
      const body=await readFile(path.join(publicRoot,entry[0]));
      res.writeHead(200,{'Content-Type':entry[1]});res.end(body);
    } catch {
      res.writeHead(500);res.end('Static asset missing');
    }
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const host='127.0.0.1',port=Number(process.env.PORT||4173);
  createDemoServer().listen(port,host,()=>{
    console.log(`YELLOW OFFLINE DEMO at http://${host}:${port} — Binance requests: 0`);
  });
}

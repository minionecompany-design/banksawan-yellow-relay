import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createDemoServer} from '../src/server.js';

async function withServer(cb){
  const server=createDemoServer({clock:()=>Date.UTC(2026,9,15,10,37)});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {return await cb(`http://127.0.0.1:${server.address().port}`)}
  finally {await new Promise(resolve=>server.close(resolve))}
}
test('demo /api/home and /api/universe are explicitly SIMULATED and nonlive',async()=>{
 await withServer(async base=>{
  const home=await (await fetch(base+'/api/home')).json();
  const univ=await (await fetch(base+'/api/universe')).json();
  assert.equal(home.mode,'DEMO_OFFLINE');
  assert.equal(home.simulation,true);
  assert.equal(home.home.length,2);
  assert.ok(home.home.every(x=>x.homeExpiresMs-x.firstSeenMs===86_400_000));
  assert.deepEqual(univ.universe.map(x=>x.symbol),['WALUSDT','ARCUSDT','NILUSDT']);
  assert.equal((await (await fetch(base+'/health')).json()).binanceRequests,0);
 });
});
test('demo has no mutation endpoint, no trading API, and serves provided 1K icon',async()=>{
 await withServer(async base=>{
  const post=await fetch(base+'/api/home',{method:'POST'});
  assert.equal(post.status,405);
  const no=await fetch(base+'/api/orders');assert.equal(no.status,404);
  const img=await fetch(base+'/assets/yellow-icon.png');
  assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');
 });
});

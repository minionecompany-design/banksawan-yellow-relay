import test from 'node:test';import assert from 'node:assert/strict';
import {createOfflineServer} from '../offline-http.js';
test('Stage6 only serves truthful unavailable HOME and UNIVERSE',async()=>{
 const server=createOfflineServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {port}=server.address(),base='http://127.0.0.1:'+port;
 try{
  const health=await(await fetch(base+'/health')).json();
  assert.equal(health.live,false);assert.equal(health.ready,false);
  const home=await(await fetch(base+'/v1/home')).json();
  assert.equal(home.dataState,'UNAVAILABLE');assert.equal(home.count,null);
  assert.deepEqual(home.events,[]);assert.equal(home.reason,'NO_FEED');
  const universe=await(await fetch(base+'/v1/universe')).json();
  assert.equal(universe.dataState,'UNAVAILABLE');assert.equal(universe.coverage.eligible,null);
  assert.deepEqual(universe.universe,[]);
  assert.equal((await fetch(base+'/v1/home',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/not-real')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

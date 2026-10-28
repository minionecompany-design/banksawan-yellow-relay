import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveApi} from '../src/live-api.js';
import {event,T} from './fixtures/forward-shadow.mjs';
const five={...event,id:`${event.symbol}:5m:${T}:LONG_A`,timeframe:'5m'};
const mock=(enabled=true)=>({
 isRunning:true,isHalted:false,wsRecovering:false,
 tickerConnected:true,klineConnected:true,lastTickerDataAtMs:T+20_000,
 clock:()=>T+25_000,
 home:()=>[structuredClone(event),structuredClone(five)],
 getTickerAsOf:()=>({lastPrice:1.01,observedAtMs:T+20_000}),
 analysisCompanion:null,
 monitor1m:enabled?{enabled:true,view:(id)=>({
   method:'YELLOW_V16_WATCH_ONLY_1M',eventId:id,
   mode:'WATCH_ONLY',status:'WAIT',entryAllowed:false
 })}:null
});
async function query(market){
 const server=createLiveApi(market);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
   const response=await fetch(`http://127.0.0.1:${server.address().port}/api/home`);
   assert.equal(response.status,200);
   return response.json();
 }finally{await new Promise(resolve=>server.close(resolve));}
}
test('HOME attaches watch-only 1M to exact original LONG A and never touches 5M',async()=>{
 const m=mock(true);
 const result=await query(m);
 assert.equal(result.mode,'LIVE_SHADOW');
 assert.equal(result.monitor1mAvailable,true);
 assert.equal(result.home.length,2);
 assert.equal(result.home[0].id,event.id);
 assert.equal(result.home[0].monitor1m.eventId,event.id);
 assert.equal(result.home[0].monitor1m.entryAllowed,false);
 assert.equal(result.home[1].id,five.id);
 assert.equal(Object.hasOwn(result.home[1],'monitor1m'),false);
 assert.equal(Object.hasOwn(m.home()[0],'monitor1m'),false);
});
test('feature flag OFF leaves old HOME response backward-compatible',async()=>{
 const result=await query(mock(false));
 assert.equal(result.monitor1mAvailable,false);
 assert.ok(result.home.every(x=>!Object.hasOwn(x,'monitor1m')));
});

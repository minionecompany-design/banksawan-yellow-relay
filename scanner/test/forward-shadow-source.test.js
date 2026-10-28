import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readShadowJson,parseShadowMarket,SHADOW_WS} from '../scripts/lib/forward-shadow-source.mjs';
import {T,M,event} from './fixtures/forward-shadow.mjs';
test('only two non-publishing GET routes are allowed; no account/FCM/order/redirect or credential path',async()=>{
 const calls=[],fetcher=async(url,options)=>{calls.push({url:String(url),options});return new Response('{"events":[]}');};
 await readShadowJson('/api/events?afterMs=123',fetcher);
 await readShadowJson('/api/research/candles?symbol=AINUSDT',fetcher);
 assert.ok(calls.every(c=>c.options.method==='GET'&&c.options.redirect==='error'));
 for(const route of ['/api/home','/api/analysis','/api/events?afterMs=3&extra=1',
  'https://fapi.binance.com/fapi/v1/order','https://user:pass@evil.test/api/events?afterMs=3',
  '/api/research/candles?symbol=../secret'])await assert.rejects(()=>readShadowJson(route,fetcher),/REJECTED/);
 assert.equal(calls.length,2);
 await assert.rejects(()=>readShadowJson('/api/events?afterMs=1',async()=>new Response('{}',{status:503})),/503/);
});
test('native adapter records closed candles only and retains exchange time, local receipt, volume and raw message',()=>{
 const symbols=new Set([event.symbol]),at=T+M+1000;
 const raw={e:'kline',s:event.symbol,E:T+M+10,k:{i:'1m',T:T+M-1,x:true,o:'1',h:'1.1',l:'.9',c:'1.01',v:'77'}};
 const [input]=parseShadowMarket(JSON.stringify({data:raw}),at,symbols);
 assert.equal(input.bar.endMs,T+M);assert.equal(input.receivedAtMs,at);assert.equal(input.bar.volume,77);
 assert.deepEqual(input.raw,raw);
 assert.deepEqual(parseShadowMarket(JSON.stringify({...raw,k:{...raw.k,x:false}}),at,symbols),[]);
 const ticks=parseShadowMarket(JSON.stringify([{e:'24hrTicker',s:event.symbol,E:at-50,c:'1.01',P:'2',q:'20000000'},
  {e:'24hrTicker',s:event.symbol,st:2,E:at,c:'9',P:'2',q:'20000000'}]),at,symbols);
 assert.equal(ticks[0].tickers.length,1);assert.equal(ticks[0].tickers[0].ticker.exchangeAtMs,at-50);
 assert.equal(SHADOW_WS,'wss://fstream.binance.com/market/stream');
 assert.throws(()=>parseShadowMarket('{"code":-1}',at,symbols),/SERVER_ERROR/);
});
test('research observer is absent from LIVE/Android/FCM import paths; runner requires explicit opt-in and clean exact source',async()=>{
 for(const file of ['live-main.js','live-market.js','live-api.js','live-fcm.js','analysis-companion-bridge.js']){
  const s=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(s,/forward-shadow|entry-continuation-v4|second-signal-compositor/);
 }
 const cli=await readFile(new URL('../scripts/collect-forward-shadow-1m.mjs',import.meta.url),'utf8');
 assert.match(cli,/PLAN_ONLY_NO_NETWORK/);assert.match(cli,/EXACT_CLEAN_RESEARCH_SOURCE_REQUIRED/);
 assert.doesNotMatch(cli,/railway|sendFcm|sendEvent|apiKey|API_KEY|Authorization/);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {homeSnapshot,cleanApiSnapshot,tradingViewUrl} from '../src/api-view.js';
const now=1_798_000_000_000;
const mk=(symbol,timeframe,end)=>({symbol,timeframe,barClosedAtMs:end,signal:'LONG_A',id:symbol+':'+timeframe+':'+end+':LONG_A'});
test('HOME binds each event TV chart to its own symbol, not previous HOME selection',()=>{
 const h=homeSnapshot([mk('PLAYUSDT','1m',60000),mk('FOGOUSDT','15m',900000),mk('PLAYUSDT','1m',60000)],now);
 assert.equal(h.count,2);assert.equal(h.events[0].symbol,'FOGOUSDT');
 assert.equal(h.events[0].tradingViewUrl,'https://www.tradingview.com/chart/?symbol=BINANCE%3AFOGOUSDT.P');
 assert.equal(h.events[1].tradingViewUrl,tradingViewUrl('PLAYUSDT'));
 assert.equal(h.events[0].signal,'LONG_A');
});
test('HOME rejects LONG B, invalid event ID and alternate timeframe',()=>{
 const h=homeSnapshot([{...mk('PLAYUSDT','1m',60000),signal:'LONG_B'},mk('PLAYUSDT','2m',60000),
 {...mk('PLAYUSDT','1m',60000),id:'FOGOUSDT:1m:60000:LONG_A'}],now);
 assert.equal(h.count,0);assert.deepEqual(h.events,[]);
});
test('unavailable feed NEVER misrepresents as zero eligible and empty HOME',()=>{
 const x=cleanApiSnapshot({now,sourceStatus:'SOURCE_UNAUTHORIZED'});
 assert.equal(x.universe.coverage.eligible,null);
 assert.equal(x.universe.dataState,'UNAVAILABLE');
 assert.equal(x.home.count,null);
 assert.equal(x.home.reason,'SOURCE_UNAUTHORIZED');
 const y=cleanApiSnapshot({now,rows:[],trackedSymbols:[],events:[]});
 assert.equal(y.universe.coverage.eligible,0);assert.equal(y.home.count,0);
});

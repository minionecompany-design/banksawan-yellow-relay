import test from 'node:test';
import assert from 'node:assert/strict';
import {eligible,screenedUniverse,chooseTracked,alertIsAllowed,POLICY} from '../src/product-policy.js';
const market=(v={})=>({symbol:'PLAYUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',price:9.99,change24hPct:1,quoteVolume24h:10_000_001,quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H',...v});
test('strict product gate and source provenance',()=>{
 assert.equal(eligible(market()),true);
 for(const v of [{price:10},{price:0},{change24hPct:0.999},{quoteVolume24h:10_000_000},{quoteVolumeSource:'BASE_VOLUME'},{quoteVolume24h:'20000000'},{contractType:'CURRENT_QUARTER'},{quoteAsset:'USDC'},{status:'BREAK'}])assert.equal(eligible(market(v)),false,JSON.stringify(v));
});
test('universe lists all eligible but tracking is capped 50',()=>{
 const rows=Array.from({length:75},(_,i)=>market({symbol:'C'+String(i).padStart(3,'0')+'USDT',change24hPct:i+1}));
 assert.equal(screenedUniverse(rows).length,75);
 assert.equal(chooseTracked(rows).length,50);
 assert.equal(chooseTracked(rows)[0].change24hPct,75);
 assert.throws(()=>chooseTracked(rows,51),/INVALID_TRACKING_LIMIT/);
});
test('four independent LONG A, reject LONG B even 1m',()=>{
 assert.deepEqual(POLICY.notificationTimeframes,['1m','5m','15m','1h']);
 const ends={'1m':60000,'5m':300000,'15m':900000,'1h':3600000};
 for(const timeframe of POLICY.notificationTimeframes)assert.equal(alertIsAllowed({signal:'LONG_A',timeframe,barClosedAtMs:ends[timeframe],market:market()}),true,timeframe);
 assert.equal(alertIsAllowed({signal:'LONG_B',timeframe:'1m',barClosedAtMs:60000,market:market()}),false);
 assert.equal(alertIsAllowed({signal:'LONG_A',timeframe:'1m',barClosedAtMs:59000,market:market()}),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productEligible} from '../src/product-policy.js';
import {YellowLiveMarket} from '../src/live-market.js';
const src=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');

test('v0.15 restores four independent LONG A notifications and disables LONG B',async()=>{
 const main=await src('scanner/src/live-main.js');
 const fcm=await src('scanner/src/live-fcm.js');
 const android=await src('android/app/src/main/java/id/banksawan/yellow/YellowNotifier.java');
 assert.match(main,/const alertTimeframes=\['1m','5m','15m','1h'\]/);
 assert.match(main,/oneMinuteLongBEnabled:false/);
 assert.match(main,/maxTracked:Math\.min\(50,/);
 assert.match(fcm,/\['1m','5m','15m','1h'\]\.includes\(record\.timeframe\)/);
 assert.match(android,/"1m"\.equals\(timeframe\)/);
 assert.match(android,/boolean oneB=false/);
 assert.equal(productEligible(9.999,1,10_000_001),true);
 assert.equal(productEligible(10,1,10_000_001),false);
 assert.equal(productEligible(9.999,.99,10_000_001),false);
 assert.equal(productEligible(9.999,1,10_000_000),false);
});
test('v0.15 keeps package and TradingView shortcut, and upgrades version code',async()=>{
 const build=await src('android/app/build.gradle');
 const main=await src('android/app/src/main/java/id/banksawan/yellow/MainActivity.java');
 assert.match(build,/applicationId 'id\.banksawan\.yellow'/);
 assert.match(build,/versionCode 11/);
 assert.match(main,/BUKA TRADINGVIEW/);
 assert.match(main,/Uri\.encode\("BINANCE:"\+symbol\+"\.P"\)/);
 assert.match(main,/tradingView\(symbol,box\)/);
});

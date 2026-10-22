import test from 'node:test';import assert from 'node:assert/strict';
import {universeSnapshot,unavailableSnapshot,SCHEMA} from '../src/contracts.js';
import {TrackedSlots} from '../src/tracked-slots.js';
const row=(symbol,change24hPct=2)=>({symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',price:2,change24hPct,quoteVolume24h:20_000_000,quoteVolumeSource:'OFFICIAL_USDM_QUOTE_24H'});
test('50 tracked slots, all 75 eligible visible, stable existing slots',()=>{
 const rows=Array.from({length:75},(_,i)=>row('COIN'+i+'USDT',i+1));
 const slots=new TrackedSlots();
 let first=slots.update(rows);
 assert.equal(first.tracked.length,50);assert.equal(first.uncovered,25);
 let second=slots.update([...rows].reverse());assert.deepEqual(second.tracked,first.tracked);
 const snap=universeSnapshot(rows,second.tracked,1792612800000);
 assert.equal(snap.schemaVersion,SCHEMA);assert.equal(snap.coverage.eligible,75);
 assert.equal(snap.coverage.covered,50);assert.equal(snap.coverage.trackedEligible,50);
 assert.equal(snap.universe.length,75);
});
test('unavailable is explicitly different from genuinely zero eligible',()=>{
 const empty=universeSnapshot([],[],1792612800000),missing=unavailableSnapshot('NO_FEED',1792612800000);
 assert.equal(empty.coverage.eligible,0);assert.equal(empty.dataState,'OK');
 assert.equal(missing.coverage.eligible,null);assert.equal(missing.dataState,'UNAVAILABLE');
});
test('incumbents removed when they fail filter; no more than fifty slots',()=>{
 const slots=new TrackedSlots(2);slots.update([row('AUSDT'),row('BUSDT')]);
 let result=slots.update([row('AUSDT',.5),row('BUSDT'),row('CUSDT')]);
 assert.deepEqual(result.tracked,['BUSDT','CUSDT']);
});

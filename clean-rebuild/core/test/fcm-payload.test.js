import test from 'node:test';import assert from 'node:assert/strict';
import {fcmLongAData} from '../src/fcm-payload.js';
import {tradingViewUrl} from '../src/api-view.js';
const row=(s='PLAYUSDT',tf='1m',t=60000)=>({
 id:s+':'+tf+':'+t+':LONG_A',symbol:s,timeframe:tf,
 barClosedAtMs:t,chartUrl:tradingViewUrl(s)});
test('FCM data contract preserves exact per-signal chart across different symbols',()=>{
 const play=fcmLongAData(row()),fogo=fcmLongAData(row('FOGOUSDT','5m',300000));
 assert.equal(play.signal,'LONG_A');assert.equal(fogo.signal,'LONG_A');
 assert.notEqual(play.eventId,fogo.eventId);
 assert.equal(play.tradingViewUrl,tradingViewUrl('PLAYUSDT'));
 assert.equal(fogo.tradingViewUrl,tradingViewUrl('FOGOUSDT'));
 assert.equal(play.barClosedAtMs,'60000');
 assert.equal(Object.values(play).every(x=>typeof x==='string'),true);
 assert.equal(Object.isFrozen(play),true);
});
test('stale or corrupted FCM destinations cannot be formed',()=>{
 assert.throws(()=>fcmLongAData({...row(),chartUrl:tradingViewUrl('FOGOUSDT')}),/INVALID_FCM_EVENT/);
 assert.throws(()=>fcmLongAData({...row(),id:'FOGOUSDT:1m:60000:LONG_A'}),/INVALID_FCM_EVENT/);
 assert.throws(()=>fcmLongAData({...row(),timeframe:'1s'}),/INVALID_FCM_EVENT/);
});

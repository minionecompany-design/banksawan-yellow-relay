import test from 'node:test';import assert from 'node:assert/strict';
import {longAFromConfirmed,PullbackWindow} from '../src/long-a-v13-gate.js';
const all=()=>({one:{close:5,ma7:4.95,ma25:4.8,ma99:4.5,rsi:60,rsiAvg:55,volRatio:.8},
five:{close:5,ma7:4.9,ma25:4.8,rsi:58,rsiAvg:55},
fifteen:{close:5,ma7:4.9,ma25:4.8,ma99:4.5,rsi:52},
hour:{close:5,ma7:4.9,ma25:4.8,ma99:4.5,rsi:49},pullbackWindowActive:true});
test('Pine v1.3 confirmed-metrics LONG A positive and all gates independent',()=>{
 const d=all();assert.equal(longAFromConfirmed(d).longA,true);
 for(const k of ['hour','fifteen','five','one']){
  const bad=structuredClone(d);bad[k].rsi=30;
  assert.equal(longAFromConfirmed(bad).longA,false,k);
 }
 assert.equal(longAFromConfirmed({...d,pullbackWindowActive:false}).longA,false);
});
test('reject unwarmed indicators, price drift, volume ratio and RSI 75 ceiling',()=>{
 for(const change of [{one:{...all().one,ma99:NaN}},{one:{...all().one,volRatio:.74}},
 {one:{...all().one,rsi:75}},{one:{...all().one,close:10}}]){
  const d={...all(),...change};assert.equal(longAFromConfirmed(d).longA,false);
 }
 assert.equal(longAFromConfirmed({}).ready,false);
});
test('Pine countDown uses close vs close[4] with first entry 9, expires 30 bars later',()=>{
 const p=new PullbackWindow();for(let i=0;i<12;i++)p.update(100-i);
 assert.equal(p.countDown,8);
 assert.equal(p.update(87),true);
 let active=true;for(let i=0;i<31;i++)active=p.update(100);
 assert.equal(active,false);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {longAFromConfirmed,PullbackWindow} from '../src/long-a-v13-gate.js';
import {metrics} from '../src/indicators.js';
const bars=(prices)=>prices.map((close,i)=>({closed:true,closedAtMs:(i+1)*60000,close,volume:100+(i>prices.length-5?70:0)}));
test('chronological raw-close replay produces a positive 1m LONG A gate after pullback and recovery',()=>{
 // Warm rising structure, 13 consecutive lower closes -> countDown pullback,
 // followed by renewed momentum while the 30-bar pullback window remains active.
 const closes=[];
 for(let i=0;i<160;i++)closes.push(4+i*.007);
 for(let i=0;i<14;i++)closes.push(closes.at(-1)-.004);
 for(let i=0;i<12;i++)closes.push(closes.at(-1)+.017);
 const pull=new PullbackWindow();let active=false;
 for(const c of closes)active=pull.update(c);
 const one=metrics(bars(closes));
 assert.ok(one,'warm MA/RSI from raw bars');
 assert.equal(active,true);
 const aligned={close:one.close,ma7:one.ma7,ma25:one.ma25,ma99:one.ma99,rsi:one.rsi,rsiAvg:one.rsiAvg};
 const r=longAFromConfirmed({one,five:aligned,fifteen:aligned,hour:aligned,pullbackWindowActive:active});
 assert.equal(r.ready,true);
 assert.equal(r.longA,true,JSON.stringify({one,diagnostics:r.diagnostics}));
});

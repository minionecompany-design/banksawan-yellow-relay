import {newEntryWatch,advanceEntryWatch,watchLight,observeWatchQuote,publishGreen,validEntryWatch} from '../../src/entry-watch.js';
import {trafficLight} from '../../src/entry-traffic-light.js';
import {fixture,T,M} from './analysis-companion.mjs';
import {newPaperOutcome,advancePaperOutcome} from '../../src/analysis-companion.js';
export const event={id:`QUSDT:1m:${T}:LONG_A`,symbol:'QUSDT',timeframe:'1m',barClosedAtMs:T,price:1,detectedAtMs:T+4000};
export function context(end,tail=[]){
 const {snapshot}=fixture();
 for(const [key,period] of [['oneMinute',M],['fiveMinute',5*M],['fifteenMinute',15*M],['oneHour',60*M]]){
  const latest=Math.floor(end/period)*period;
  snapshot[key]=Array.from({length:170},(_,i)=>({endMs:latest-(169-i)*period,open:1,close:1,high:1.04,low:.96,volume:100}));
  // Past confirmed overhead pivot supplies known room; no future top is invented.
  snapshot[key][140].high=1.08;
  for(const b of snapshot[key]){b.open=.99;b.close=.99;b.low=.985;b.high=1.00;}
  snapshot[key][140].high=1.08;
  if(key!=='oneMinute')for(let j=145;j<170;j++){
   snapshot[key][j].open=1;snapshot[key][j].close=1.001+(j-145)*.00002;snapshot[key][j].high=1.08;snapshot[key][j].low=.99;
  }
 }
 for(const b of tail){const i=snapshot.oneMinute.findIndex(x=>x.endMs===b.endMs);if(i>=0)snapshot.oneMinute[i]=b;}
 return snapshot;
}
export const bar=(end,low,close,high=close+.0001,volume=100)=>({endMs:end,open:close-.0001,high,low,close,volume});
export function confirmation(){
 let w=newEntryWatch(event,T+4000);
 const bars=[bar(T+M,.97,.98,.985),bar(T+2*M,.975,.981,.985),bar(T+3*M,.978,.983,.986),bar(T+4*M,.98,1.002,1.003,250)];
 for(const b of bars)w=advanceEntryWatch(w,b,context(b.endMs,bars.filter(x=>x.endMs<=b.endMs)),b.endMs+1000);
 return w;
}

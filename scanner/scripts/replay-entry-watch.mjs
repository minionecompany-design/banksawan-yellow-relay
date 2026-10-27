#!/usr/bin/env node
/** Saved local candles and recorded LONG A only. No fetch, live signals or orders. */
import {readFile} from 'node:fs/promises';
import {newEntryWatch,advanceEntryWatch,WATCH_METHOD} from '../src/entry-watch.js';
import {validAnalysisEventId} from '../src/analysis-companion.js';
const [file,eventFile]=process.argv.slice(2);
if(!file||!eventFile)throw Error('Usage: replay-entry-watch.mjs saved-candles.json recorded-event.json');
const source=JSON.parse(await readFile(file,'utf8')),event=JSON.parse(await readFile(eventFile,'utf8'));
if(!validAnalysisEventId(event.id)||source.symbol!==event.symbol)throw Error('REPLAY_IDENTITY_MISMATCH');
const data=source.candles;
if(!data||!Object.values(data).every(Array.isArray))throw Error('SAVED_CANDLES_REQUIRED');
let w=newEntryWatch(event,event.detectedAtMs),trace=[],prior=null;
for(const b of data.oneMinute.filter(b=>b.endMs>w.lastBarEndMs&&b.endMs<=w.watchUntilMs)){
 const asOf=Object.fromEntries(Object.entries(data).map(([k,bars])=>[k,bars.filter(x=>x.endMs<=b.endMs)]));
 w=advanceEntryWatch(w,b,asOf,b.endMs+1000);
 const key=w.state+':'+w.reason;
 if(key!==prior){trace.push({atMs:b.endMs,state:w.state,reason:w.reason,close:b.close,low:w.low,plan:w.plan});prior=key;}
}
console.log(JSON.stringify({mode:'HISTORICAL_REPLAY_NOT_LIVE_OBSERVATION',method:WATCH_METHOD,
 caveat:'Higher-TF candles are assumed delivered at close in replay. Actual feed ordering/latency and 24h eligibility at later entry were not reconstructed. No proof of device entry or future accuracy.',
 event,trace,final:w},null,2));

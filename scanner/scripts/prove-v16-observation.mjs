/** Synthetic storage proof only. Does not connect to production or Binance. */
import fs from 'node:fs';import path from 'node:path';
import {V16ObservationEngine} from '../src/v16-observation-engine.js';
import {V16ObservationStore} from '../src/v16-observation-store.js';
import {event,T,M,candle} from '../test/fixtures/forward-shadow.mjs';
import {context} from '../test/fixtures/entry-watch.mjs';
const directory=path.resolve(process.argv[2]??'');if(!process.argv[2])throw Error('OUTPUT_DIRECTORY_REQUIRED');
let now=T;const store=new V16ObservationStore({directory,clock:()=>now});
const engine=new V16ObservationEngine({store,startedAtMs:T,provenance:'SYNTHETIC_QA'});
const apply=x=>{now=x.at;engine.apply(x);};
apply({type:'START',event,snapshot:context(T),at:T+5000});
for(let i=1;i<=120;i++){
 for(let j=1;j<=4;j++){const at=T+(i-1)*M+j*15000;apply({type:'TICKER',symbol:event.symbol,ticker:{lastPrice:1,observedAtMs:at,exchangeAtMs:at-1},at});}
 const bar=candle(i,1,1.02,.99,1,100+i),at=bar.endMs+1000;
 apply({type:'BAR',symbol:event.symbol,bar,at});apply({type:'DECISION_BAR',symbol:event.symbol,bar,snapshot:context(bar.endMs,[bar]),at});
}
engine.close();
fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify({provenance:'SYNTHETIC_QA',day:store.day,finalHash:store.previous,rows:store.sequence,bytes:store.bytes,prospectiveEvents:0},null,2));
console.log(JSON.stringify({provenance:'SYNTHETIC_QA',prospectiveEvents:0,bytes:store.bytes}));

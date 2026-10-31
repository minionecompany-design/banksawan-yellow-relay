/** Read-only verified journal export; never fetch market data. */
import fs from 'node:fs';
import path from 'node:path';
import {verifyObservation} from '../src/v16-observation-store.js';
const directory=process.argv[2];
if(!directory)throw Error('DIRECTORY_REQUIRED');
const events=new Map(),segments=[];
for(const name of fs.readdirSync(directory).filter(n=>/^\d{4}-\d{2}-\d{2}\.ndjson$/.test(n)).sort()){
 const {rows,previous}=verifyObservation(fs.readFileSync(path.join(directory,name),'utf8'));
 segments.push({name,finalHash:previous,rows:rows.length});
 for(const r of rows){
  if(r.type==='START')events.set(r.eventId,{...r,transitions:[],clues:[],gaps:[],outcome:'UNFINALIZED_NO_COMPLETENESS_CLAIM',observedBars:0,observedTickers:0});
  const e=events.get(r.eventId);if(!e)continue;
  if(r.type==='STATE')e.transitions.push(r);
  if(r.type==='BAR'){e.observedBars++;e.mfePct=r.mfePct;e.maePct=r.maePct;}
  if(r.type==='TICKER_BUCKET'){e.observedTickers+=r.count;e.lastTicker=r.last;e.mfePct=r.mfePct;e.maePct=r.maePct;}
  if(r.type==='CLUE')e.clues.push(r);
  if(r.type==='GAP')e.gaps.push(r);
  if(r.type==='FINISH')Object.assign(e,{outcome:r.outcome,finish:r});
 }
}
console.log(JSON.stringify({integrityVerified:true,segments,authentication:'UNKEYED_SHA256_CHAIN_NOT_EXTERNAL_AUTHENTICATION',
 releaseDecision:'NO_GO_ENTRY',extremaScope:'OBSERVED_NOT_GUARANTEED_MARKET_EXTREMES',candidates:[...events.values()]},null,2));

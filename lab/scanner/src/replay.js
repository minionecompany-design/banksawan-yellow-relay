/**
 * Strict offline replay reader, intentionally NOT a Binance/backfill importer.
 * Input must be a local JSON fixture with genuine causally verified closed-bar
 * data. Incomplete screenshot-only evidence is NOT replayable as success.
 */
import {readFile} from 'node:fs/promises';
import {FirstABResearch} from './cohorts.js';
const MIN=60000;
export function runReplay(doc){
  if(!doc || doc.format!=='YELLOW_LAB_OFFLINE_REPLAY_V1'||!Array.isArray(doc.rows)||doc.rows.length>60000)
    throw Error('BAD_OFFLINE_REPLAY_FORMAT');
  if(doc.sourceKind!=='SYNTHETIC_TEST'&&doc.sourceKind!=='VERIFIED_ASOF_CAPTURE')
    throw Error('REPLAY_SOURCE_MUST_BE_EXPLICIT');
  if(!Number.isSafeInteger(doc.watermarkMs)||doc.watermarkMs<=0)throw Error('INVALID_REPLAY_WATERMARK');
  const engine=new FirstABResearch({clock:()=>doc.watermarkMs});
  const items=doc.rows.map((item,i)=>{
    if(!item || !['event','bar','coverageLost'].includes(item.kind))throw Error('BAD_REPLAY_ROW_'+i);
    const t=item.kind==='event'?item.event?.barClosedAtMs:item.kind==='bar'?item.bar?.endMs:item.atMs;
    if(!Number.isSafeInteger(t)||t<=0||t%MIN!==0||t>doc.watermarkMs)
      throw Error('BAD_REPLAY_TIME_'+i);
    return {...item,atMs:t,i};
  }).sort((a,b)=>a.atMs-b.atMs || ((a.kind==='bar'?0:1)-(b.kind==='bar'?0:1)) || a.i-b.i);
  const audit=[];
  for(const r of items){
    let result;
    if(r.kind==='bar')result=engine.observeClosedBar(r.symbol,r.bar);
    if(r.kind==='coverageLost')result=engine.markCoverageLost(r.symbol,r.reason);
    if(r.kind==='event')result=engine.ingest(r.event,r.context??null);
    audit.push({kind:r.kind,symbol:r.symbol??r.event?.symbol,atMs:r.atMs,...result});
  }
  engine.expireUnobserved(doc.watermarkMs);
  return {mode:'OFFLINE_RESEARCH',sourceKind:doc.sourceKind,summary:engine.summary(),
    outcomes:engine.outcomes(),audit,publicationAuthorized:false};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  if(process.argv.length!==3)throw Error('USAGE: node src/replay.js path/to/local-fixture.json');
  const doc=JSON.parse(await readFile(process.argv[2],'utf8'));
  process.stdout.write(JSON.stringify(runReplay(doc),null,2)+'\n');
}

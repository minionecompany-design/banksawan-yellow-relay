/** Offline JSON analysis. Never fetches market data or triggers alerts.
 * Usage: node src/quality-shadow-cli.js samples.json > results.json
 * Input: [{"event":{...LONG_A event...},"bars":[...61+ closed candles...],"label": "optional observed outcome"}]
 */
import {readFile} from 'node:fs/promises';
import {inspectLongAQuality} from './quality-shadow-v1.js';
const file=process.argv[2];
if(!file)throw Error('USAGE: node src/quality-shadow-cli.js LOCAL_FILE.json');
const data=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(data))throw Error('EXPECTED_JSON_ARRAY');
if(data.length>10000)throw Error('INPUT_TOO_LARGE');
const results=data.map((row,index)=>({index,id:row?.event?.id??null,label:row?.label??null,
  quality:inspectLongAQuality(row?.event,row?.bars)}));
const counts=Object.fromEntries(['GOLD_RESEARCH','REVIEW_RESEARCH','WEAK_RESEARCH','UNVERIFIED']
  .map(key=>[key,results.filter(x=>(x.quality.grade||'UNVERIFIED')===key).length]));
process.stdout.write(JSON.stringify({mode:'OFFLINE_SHADOW_ONLY',thresholdStatus:'PROVISIONAL',
  source:'USER_SUPPLIED_AS_OF_SNAPSHOTS',total:results.length,counts,results},null,2)+'\n');


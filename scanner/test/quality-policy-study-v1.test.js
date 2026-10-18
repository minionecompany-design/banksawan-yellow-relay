import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {compareQualityPolicies} from '../src/quality-policy-study-v1.js';
import {measureForwardOutcome} from '../src/quality-evidence-v1.js';
const TF={'1m':60000,'5m':300000,'15m':900000,'1h':3600000};
const T=Date.UTC(2026,9,18,0);
// Deliberately SYNTHETIC. These fixtures do not prove historical market recall.
function sample({tf='1m',time=T,symbol='TESTUSDT',kind='gold',future='rise'}={}){
 const p=TF[tf];
 const bars=Array.from({length:61},(_,i)=>{
  const close=i===60?(kind==='weak'?1.39:1.002):1;
  return {endMs:time-(60-i)*p,open:close-.001,close,high:close+.0005,
   low:close-.0015,volume:i===60?(kind==='gold'?190:80):100};
 });
 const event={symbol,timeframe:tf,barClosedAtMs:time,price:bars.at(-1).close,
  signal:'LONG_A',id:symbol+':'+tf+':'+time+':LONG_A',detectedAtMs:time+500};
 const n=240*60000/p;
 const futureBars=Array.from({length:n},(_,i)=>{
  const c=event.price*(future==='rise'?1+.06*(i+1)/n:.98);
  return {endMs:time+(i+1)*p,open:c,high:c,low:c,close:c,volume:100};
 });
 return {event,bars,futureBars,provenance:{synthetic:true}};
}
test('frozen nested policies expose retained and discarded potential, not just fewer events',()=>{
 const r=compareQualityPolicies(['gold','review','weak'].map((kind,i)=>sample({kind,symbol:'TEST'+i+'USDT'})));
 assert.deepEqual(['LOOSE','MEDIUM','STRICT'].map(p=>r.comparison[p].kept),[3,2,1]);
 assert.deepEqual(['LOOSE','MEDIUM','STRICT'].map(p=>r.comparison[p].horizons[240].potential[5].missed),[0,1,2]);
 assert.equal(r.comparison.STRICT.horizons[240].potential[5].retentionPct,33.3333);
 assert.equal(r.readyForProduction,false);
 assert.ok(r.results.every(x=>x.quality.deliveryAction==='NONE'));
});
test('all four standalone TFs can pass without any cross-TF confirmation or daily cap',()=>{
 const rows=Array.from({length:12},(_,i)=>sample({tf:Object.keys(TF)[i%4],symbol:'TEST'+i+'USDT'}));
 const r=compareQualityPolicies(rows);
 assert.equal(r.comparison.STRICT.kept,12);
 for(const tf of Object.keys(TF))assert.equal(r.byTimeframe[tf].STRICT.kept,3);
});
test('future modifications affect outcomes but never policy membership or signal-time features',()=>{
 const row=sample();
 const a=compareQualityPolicies([row]).results[0];
 const b=compareQualityPolicies([{...row,futureBars:row.futureBars.map(x=>({...x,high:x.high*100,low:x.low*.1}))}]).results[0];
 assert.deepEqual(a.policies,b.policies);assert.deepEqual(a.quality,b.quality);
 assert.notDeepEqual(a.outcomes,b.outcomes);
});
test('metadata-only records remain unknown and cannot become discarded losers or zero-percent recall',()=>{
 const row=sample();row.bars=null;
 const r=compareQualityPolicies([row]);
 for(const p of ['LOOSE','MEDIUM','STRICT']){
  assert.equal(r.comparison[p].unverified,1);assert.equal(r.comparison[p].dropped,0);
  assert.equal(r.comparison[p].horizons[240].potential[5].retentionPct,null);
 }
 assert.equal(r.results[0].policies.STRICT,'UNVERIFIED');
});
test('future gaps invalidate that horizon, not the quality grade, and incomplete is not failure',()=>{
 const a=sample();a.futureBars.splice(90,1);
 const r=compareQualityPolicies([a]);
 assert.equal(r.results[0].quality.status,'ASSESSED');
 assert.equal(r.results[0].outcomes[60].status,'MEASURED');
 assert.equal(r.results[0].outcomes[240].status,'UNVERIFIED');
});
test('entry baseline clamps MFE and MAE and +5 timestamp is only a candle interval',()=>{
 const down=sample({future:'down'});
 const d=measureForwardOutcome(down.event,down.futureBars,240);
 assert.equal(d.maxFavorablePct,0);assert.equal(d.maxAdversePct,-2);
 const up=sample({tf:'1h'});for(const b of up.futureBars){b.open=b.high=b.low=b.close=up.event.price*1.06;}
 const u=measureForwardOutcome(up.event,up.futureBars,60);
 assert.equal(u.maxAdversePct,0);
 assert.deepEqual(u.firstPlus5WindowMinutes,{startInclusive:0,endInclusive:60});
 assert.equal(Object.hasOwn(u,'timeToFirstPlus5Minutes'),false);
});
test('chronological split purges four-hour labels at the validation boundary and sorts events',()=>{
 const cut=T+24*3600000;
 const rows=[sample({time:cut+3600000}),sample({time:cut-4*3600000}),
  sample({time:cut-5*3600000}),sample({time:cut})];
 const r=compareQualityPolicies(rows,{validationStartMs:cut});
 assert.equal(r.chronology.EARLIER.LOOSE.input,1);
 assert.equal(r.chronology.PURGED_OVERLAPPING_OUTCOME.LOOSE.input,1);
 assert.equal(r.chronology.VALIDATION.LOOSE.input,2);
 assert.ok(r.results.every((x,i)=>i===0||x.barClosedAtMs>=r.results[i-1].barClosedAtMs));
});
test('observation cutoff prevents measurements from candles not yet observed',()=>{
 const a=sample();const r=compareQualityPolicies([a],{observedThroughMs:T+600000});
 assert.equal(r.results[0].quality.status,'ASSESSED');
 assert.equal(r.results[0].outcomes[60].status,'UNVERIFIED');
 const b=compareQualityPolicies([a],{observedThroughMs:T-1});
 assert.equal(b.results[0].quality.reason,'EVENT_AFTER_OBSERVATION_CUTOFF');
 assert.equal(b.results[0].detectionDelayMs,null);
});
test('disabled 1m policy cost is reported separately and never silently changes quality',()=>{
 const a=sample();const b=sample({tf:'5m'});
 const r=compareQualityPolicies([a,b],{alertTimeframes:['5m','15m','1h']});
 assert.equal(r.deliveryPolicy.disabledTfEvents,1);
 assert.deepEqual(r.deliveryPolicy.disabledTfPotential[240][5],[a.event.id]);
 assert.equal(r.results[0].quality.grade,'GOLD_RESEARCH');
 assert.equal(r.comparison.STRICT.kept,2);
});
test('duplicate IDs and invalid settings are refused',()=>{
 const a=sample();assert.throws(()=>compareQualityPolicies([a,a]),/DUPLICATE_EVENT_ID/);
 for(const opts of [{validationStartMs:0},{observedThroughMs:0},{alertTimeframes:['3m']},
  {alertTimeframes:['1m','1m']},{validationStartMs:T+1,observedThroughMs:T}])
  assert.throws(()=>compareQualityPolicies([a],opts));
 const e={...a.event,barClosedAtMs:0};
 assert.equal(measureForwardOutcome(e,a.futureBars,60).reason,'INVALID_OUTCOME_EVENT');
});
test('CLI accepts recorder export and returns measured rows without any network',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-policy-cli-'));
 try{
  const file=path.join(dir,'capture.json');const opts=path.join(dir,'options.json');
  await writeFile(file,JSON.stringify({version:1,mode:'RESEARCH_ONLY',records:[sample()]}));
  await writeFile(opts,JSON.stringify({alertTimeframes:['5m','15m','1h']}));
  const cli=new URL('../src/quality-policy-study-cli.js',import.meta.url);
  const r=JSON.parse(execFileSync(process.execPath,[cli.pathname,file,opts],{encoding:'utf8'}));
  assert.equal(r.records,1);assert.equal(r.recorderHeader.records,1);
  assert.equal(r.comparison.STRICT.horizons[240].measured,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('offline research remains disconnected from all production notification imports',async()=>{
 for(const f of ['live-main.js','live-market.js','live-api.js','live-fcm.js','live-home-ledger.js']){
  const src=await readFile(new URL('../src/'+f,import.meta.url),'utf8');
  assert.doesNotMatch(src,/from\s*['"].*quality-(?:policy|shadow|evidence)/);
 }
});

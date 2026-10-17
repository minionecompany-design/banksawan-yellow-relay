import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateQualityEvidence} from '../src/quality-evidence-v1.js';

test('seven real log-verified natural event IDs cannot be scored from metadata alone',async()=>{
  const rows=JSON.parse(await readFile(new URL('../../docs/YELLOW-GOLD-EVIDENCE-METADATA-20261017.json',import.meta.url),'utf8'));
  const out=evaluateQualityEvidence(rows);
  assert.equal(rows.length,7);
  assert.equal(out.records,7);
  assert.equal(out.assessed,0);
  assert.equal(out.measured4h,0);
  assert.equal(out.gradeCounts.UNVERIFIED,7);
  assert.equal(out.readyForProduction,false);
  assert.deepEqual(new Set(rows.map(x=>x.event.symbol)),new Set(['AGTUSDT','TIAUSDT','AVAUSDT','BASEDUSDT','RSRUSDT','FOLKSUSDT','AIOUSDT']));
});

test('shadow modules are not wired to live scanner, FCM, API or HOME',async()=>{
  for(const file of ['live-main.js','live-market.js','live-api.js','live-fcm.js','live-home-ledger.js']){
    const code=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(code,/from ['"].*quality-(?:shadow|evidence)/);
  }
});

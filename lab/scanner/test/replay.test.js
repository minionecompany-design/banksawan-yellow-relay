import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runReplay} from '../src/replay.js';
test('replay demo is synthetic, cannot publish, and does not mix B candle MFE',async()=>{
 const doc=JSON.parse(await readFile(new URL('../fixtures/SYNTHETIC-DEMO-ONLY.json',import.meta.url),'utf8'));
 const o=runReplay(doc);
 assert.equal(o.sourceKind,'SYNTHETIC_TEST');assert.equal(o.publicationAuthorized,false);
 assert.equal(o.summary.complete,1);assert.equal(o.summary.selectedAtB1,1);
 assert.equal(o.outcomes[0].afterBMfePct,1.94);
 assert.equal(o.outcomes[0].afterBMaePct,-4.85);
});
test('replay requires provenance and rejects future rows',()=>{
 assert.throws(()=>runReplay({format:'YELLOW_LAB_OFFLINE_REPLAY_V1',sourceKind:'SCREENSHOT',rows:[],watermarkMs:120000}),/REPLAY_SOURCE/);
 assert.throws(()=>runReplay({format:'YELLOW_LAB_OFFLINE_REPLAY_V1',sourceKind:'SYNTHETIC_TEST',rows:[{kind:'bar',symbol:'TESTUSDT',bar:{endMs:180000}}],watermarkMs:120000}),/BAD_REPLAY_TIME/);
});

#!/usr/bin/env node
/** Synthetic acceptance evidence, never a prospective market cohort. */
import {mkdir,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {ForwardShadowJournal} from '../src/forward-shadow-journal.js';
import {evaluateEntryV4Evidence} from '../src/entry-v4-release-gate.js';
import {config as seed,T,M,event,inputs,quote} from '../test/fixtures/forward-shadow.mjs';
const [directory]=process.argv.slice(2);if(!directory)throw Error('OUTPUT_DIRECTORY_REQUIRED');
const out=resolve(directory);await mkdir(out,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceDirty=!!execFileSync('git',['status','--porcelain','--','scanner'],{encoding:'utf8'}).trim();
const config={...seed,sourceCommit};
const filename=join(out,'synthetic-shadow.ndjson'),j=new ForwardShadowJournal({filename,config});
await j.initialize(T);for(const input of inputs())await j.ingest(input);
const w=j.observer.records.get(event.id).v4,at=T+6*M+2000;
await j.ingest(quote(w.plan.referenceEntry,at));
const before=j.receipt();assert.equal(before.report.records[0].lastDecision.status,'GREEN');await j.close();
const restored=new ForwardShadowJournal({filename,config});await restored.initialize(at+1000);
const after=restored.receipt();assert.equal(after.report.records[0].lastDecision.status,'OFF');
assert.equal(after.report.records[0].quotePaper.unified.status,'INCOMPLETE_DATA');await restored.close();
const gate=evaluateEntryV4Evidence();assert.equal(gate.action,'NO_GO_LIVE');
await writeFile(join(out,'acceptance.json'),JSON.stringify({provenance:'SYNTHETIC_QA_NOT_FORWARD_MARKET',
  sourceCommit,sourceDirty,beforeRestart:before,afterRestart:after,releaseGate:gate,
  prospectiveMarketEvents:0,productionWrites:0,fcmSends:0},null,2)+'\n');
console.log(JSON.stringify({sourceCommit,sourceDirty,syntheticAcceptance:'PASS',prospectiveMarketEvents:0,
  releaseDecision:gate.action}));

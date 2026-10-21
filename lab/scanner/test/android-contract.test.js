import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {evaluateClosedSnapshot} from '../src/offline-evaluator.js';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'../../android');
test('APK has distinct package identity and uses HOME only',async()=>{
 const main=await readFile(resolve(base,'app/src/main/java/id/banksawan/yellowlab/MainActivity.java'),'utf8');
 const manifest=await readFile(resolve(base,'app/src/main/AndroidManifest.xml'),'utf8');
 const gradle=await readFile(resolve(base,'app/build.gradle'),'utf8');
 assert.match(main,/package id\.banksawan\.yellowlab;/);
 assert.match(gradle,/applicationId 'id\.banksawan\.yellowlab'/);
 assert.match(manifest,/BANKSAWAN YELLOW LAB/);
 assert.doesNotMatch(main,/api\/universe|renderUniverse|renderTabs|"universe"|"UNIVERSE"/);
 assert.match(main,/"\/api\/home"/);assert.match(main,/"LONG_B"/);assert.match(main,/"LONG_A"/);
 assert.match(main,/!"LAB_LIVE"\.equals/);
 assert.doesNotMatch(manifest,/MESSAGING_EVENT|POST_NOTIFICATIONS/);
 assert.doesNotMatch(gradle,/firebase|FCM_ENABLED/);
});
test('offline evaluator refuses unsupported live lane',()=>{
 assert.throws(()=>evaluateClosedSnapshot({symbol:'JCTUSDT',timeframe:'5m',snapshot:{},nowMs:1000}),/LAB_TF_ONLY/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {QualityCaptureStoreV1} from '../src/quality-capture-store-v1.js';
const fixture=async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-gold-capture-'));
 return {dir,store:new QualityCaptureStoreV1({filename:path.join(dir,'quality-evidence.json'),maxBytes:4096})};
};
test('missing optional file returns null and atomic writes are serialized',async()=>{
 const {dir,store}=await fixture();assert.equal(await store.restore(),null);
 const a={version:1,mode:'RESEARCH_ONLY',records:[],label:'first'};
 const b={version:1,mode:'RESEARCH_ONLY',records:[],label:'latest'};
 await Promise.all([store.save(a),store.save(b)]);
 assert.equal((await store.restore()).label,'latest');
 assert.deepEqual(await readdir(dir),['quality-evidence.json']);
});
test('size cap rejects, preserving prior valid research evidence',async()=>{
 const {store}=await fixture(),doc={version:1,mode:'RESEARCH_ONLY',records:[]};
 await store.save(doc);
 await assert.rejects(store.save({...doc,huge:'A'.repeat(6000)}),/CAPTURE_FILE_OVER_LIMIT/);
 assert.equal((await store.restore()).version,1);
});
test('corrupt JSON is rejected, never silently replaced by empty proof',async()=>{
 const {store,dir}=await fixture();
 await writeFile(path.join(dir,'quality-evidence.json'),'{bad json');
 await assert.rejects(store.restore(),/CAPTURE_FILE_INVALID_JSON/);
});
test('reject relative path and forged oversized disk state',async()=>{
 assert.throws(()=>new QualityCaptureStoreV1({filename:'not-absolute.json'}),/INVALID_QUALITY_STORE_CONFIG/);
 const {store,dir}=await fixture();
 await writeFile(path.join(dir,'quality-evidence.json'),'X'.repeat(5000));
 await assert.rejects(store.restore(),/CAPTURE_FILE_OVER_LIMIT/);
});

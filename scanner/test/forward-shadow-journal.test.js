import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';
import {ForwardShadowJournal} from '../src/forward-shadow-journal.js';
import {config,T,M,event,inputs,quote} from './fixtures/forward-shadow.mjs';
test('fsynced journal replays exact outputs then censors active plans on restart, without duplicate events',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'yellow-forward-'));
 try{
  const filename=path.join(dir,'shadow.ndjson'),j=new ForwardShadowJournal({filename,config});await j.initialize(T);
  for(const i of inputs())await j.ingest(i);
  const r=j.observer.records.get(event.id),at=T+6*M+2000;
  await j.ingest(quote(r.v4.plan.referenceEntry,at));const original=j.receipt();
  assert.equal(original.report.records[0].lastDecision.status,'GREEN');
  const duplicate=new ForwardShadowJournal({filename,config});await assert.rejects(()=>duplicate.initialize(at),/EEXIST/);
  await j.close();
  const restored=new ForwardShadowJournal({filename,config});await restored.initialize(at+1000);
  assert.ok(restored.sequence>j.sequence);assert.equal(restored.receipt().report.cohortEvents,1);
  assert.equal(restored.observer.records.get(event.id).lastDecision.status,'OFF');
  assert.equal(restored.observer.records.get(event.id).quotePaper.unified.status,'INCOMPLETE_DATA');
  await restored.ingest({...inputs()[0],receivedAtMs:at+2000});assert.equal(restored.observer.records.size,1);
  await restored.close();
  assert.ok((await readFile(filename,'utf8')).endsWith('\n'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('corrupt hashes, torn tails and incompatible config fail closed; no repair or optimistic restart',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'yellow-forward-'));
 try{
  const filename=path.join(dir,'shadow.ndjson'),j=new ForwardShadowJournal({filename,config});await j.initialize(T);await j.close();
  const raw=await readFile(filename,'utf8');
  await appendFile(filename,'{"partial":');
  await assert.rejects(()=>new ForwardShadowJournal({filename,config}).initialize(T+1),/TORN/);
  await writeFile(filename,raw.replace('HEADER','READER'));
  await assert.rejects(()=>new ForwardShadowJournal({filename,config}).initialize(T+1),/HASH_CHAIN/);
  await writeFile(filename,raw);
  await assert.rejects(()=>new ForwardShadowJournal({filename,config:{...config,sourceCommit:'b'.repeat(40)}}).initialize(T+1),/CONFIG/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('disk bounds and invalid input permanently stop collector; uncommitted state cannot appear as evidence',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'yellow-forward-'));
 try{
  const filename=path.join(dir,'shadow.ndjson'),j=new ForwardShadowJournal({filename,config,maxBytes:4096});await j.initialize(T);
  await assert.rejects(()=>j.ingest(inputs()[0]),/STORAGE_LIMIT/);
  assert.equal(j.receipt().failed,true);assert.equal(j.receipt().report,null);
  await assert.rejects(()=>j.ingest({type:'HEARTBEAT',receivedAtMs:T+8000}),/STOPPED/);await j.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('journal refuses a symlink path and preserves the unrelated target',async()=>{
 const {symlink}=await import('node:fs/promises');const dir=await mkdtemp(path.join(tmpdir(),'yellow-forward-'));
 try{
  const target=path.join(dir,'unrelated.json'),filename=path.join(dir,'shadow.ndjson');
  await writeFile(target,'unchanged');await symlink(target,filename);
  await assert.rejects(()=>new ForwardShadowJournal({filename,config}).initialize(T));
  assert.equal(await readFile(target,'utf8'),'unchanged');
 }finally{await rm(dir,{recursive:true,force:true});}
});

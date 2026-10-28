import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {ForwardShadowJournal} from '../src/forward-shadow-journal.js';
import {auditForwardJournal} from '../scripts/summarize-forward-shadow-journal.mjs';
import {config,T,M,event,inputs,quote} from './fixtures/forward-shadow.mjs';

async function sample(){
 const dir=await mkdtemp(join(tmpdir(),'yellow-audit-wal-'));
 const filename=join(dir,'shadow.ndjson'),receiptPath=join(dir,'receipt.json');
 const journal=new ForwardShadowJournal({filename,config});
 await journal.initialize(T);
 for(const input of inputs())await journal.ingest(input);
 const w=journal.observer.records.get(event.id).v4;
 const at=T+6*M+2000;
 await journal.ingest(quote(w.plan.referenceEntry,at));
 const receipt=journal.receipt();
 await writeFile(receiptPath,JSON.stringify(receipt));
 await journal.close();
 return {dir,filename,receiptPath,receipt};
}
test('WAL auditor verifies every journal transaction and shows observed GREEN as synthetic only',async()=>{
 const s=await sample();
 try{
   const x=await auditForwardJournal(s.filename,{receiptPath:s.receiptPath,
     expectedCommit:config.sourceCommit});
   assert.equal(x.journal.verified,true);
   assert.equal(x.provenance,'SYNTHETIC_QA');
   assert.equal(x.counts.acceptedLongA1m,1);
   assert.equal(x.counts.observedGreenEvents,1);
   assert.equal(x.canClaimWinRate,false);
   assert.equal(x.releaseDecision,'NO_GO_LIVE');
   assert.equal(x.journal.finalHash,s.receipt.finalHash);
   assert.equal(x.journal.transactions,s.receipt.transactions);
 }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('WAL auditor rejects tamper even when journal length is not changed',async()=>{
 const s=await sample();
 try{
   const text=await readFile(s.filename,'utf8');
   assert.ok(text.includes('LONG_A'));
   await writeFile(s.filename,text.replace('LONG_A','LONG_B'));
   await assert.rejects(auditForwardJournal(s.filename),/JOURNAL_HASH_CHAIN_CORRUPT/);
 }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('WAL auditor rejects a torn final line and mismatched receipt digest',async()=>{
 const s=await sample();
 try{
   const receipt=JSON.parse(await readFile(s.receiptPath,'utf8'));
   receipt.finalHash='0'.repeat(64);
   await writeFile(s.receiptPath,JSON.stringify(receipt));
   await assert.rejects(auditForwardJournal(s.filename,{receiptPath:s.receiptPath}),
     /RECEIPT_JOURNAL_HASH_MISMATCH/);
   const raw=await readFile(s.filename,'utf8');
   await writeFile(s.filename,raw.trimEnd());
   await assert.rejects(auditForwardJournal(s.filename),/TORN_JOURNAL_LAST_LINE/);
 }finally{await rm(s.dir,{recursive:true,force:true});}
});

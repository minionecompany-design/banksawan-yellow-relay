import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {EventJournal} from '../src/event-journal.js';
const e=(tf='1m',at=60000)=>({id:`PLAYUSDT:${tf}:${at}:LONG_A`,symbol:'PLAYUSDT',timeframe:tf,barClosedAtMs:at,signal:'LONG_A'});
test('journal survives restart and suppresses same ID, preserving other TFs',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-clean-journal-')),file=path.join(dir,'events.json');
 const a=new EventJournal(file);await a.restore();
 assert.equal(await a.accept(e()),true);
 assert.equal(await a.accept(e()),false);
 assert.equal(await a.accept(e('5m',300000)),true);
 const b=new EventJournal(file);await b.restore();
 assert.equal(b.list().length,2);
 assert.equal(await b.accept(e()),false);
 assert.equal((JSON.parse(await readFile(file,'utf8'))).events.length,2);
});
test('concurrent claims for the same event are serialized and idempotent',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-clean-serial-'));
 const j=new EventJournal(path.join(dir,'events.json'));
 const results=await Promise.all(Array.from({length:12},()=>j.accept(e())));
 assert.equal(results.filter(Boolean).length,1);
});
test('corrupt persisted content fails closed, no silent reset',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-clean-corrupt-')),file=path.join(dir,'events.json');
 await writeFile(file,'{oops');
 const j=new EventJournal(file);
 await assert.rejects(j.restore(),/CORRUPT_EVENT_JOURNAL/);
 assert.equal(await readFile(file,'utf8'),'{oops');
});
test('LONG B and malformed events are never written',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-clean-reject-')),j=new EventJournal(path.join(dir,'events.json'));
 await assert.rejects(j.accept({...e(),signal:'LONG_B'}),/INVALID_LONG_A_EVENT/);
 assert.equal(j.list().length,0);
});

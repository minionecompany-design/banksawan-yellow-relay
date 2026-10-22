import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {EventJournal} from '../src/event-journal.js';
const event=(closedAtMs)=>({symbol:'PLAYUSDT',timeframe:'1m',
 signal:'LONG_A',barClosedAtMs:closedAtMs,
 id:'PLAYUSDT:1m:'+closedAtMs+':LONG_A'});
test('stale process-ID tmp file from crashed prior writer cannot block new durable event',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'yellow-journal-stale-'));
 const path=join(directory,'events.json');
 const stale=path+'.'+process.pid+'.tmp';
 await writeFile(stale,'unfinished write from prior crash');
 const journal=new EventJournal(path);await journal.restore();
 assert.equal(await journal.accept(event(60000)),true);
 assert.equal(await journal.accept(event(60000)),false);
 assert.equal(await readFile(stale,'utf8'),'unfinished write from prior crash');
 const recovered=new EventJournal(path);await recovered.restore();
 assert.deepEqual(recovered.list().map(x=>x.id),[event(60000).id]);
});
test('concurrent accepts are serialized without lost events and no leaked new tmp files',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'yellow-journal-parallel-'));
 const path=join(directory,'events.json');
 const journal=new EventJournal(path);await journal.restore();
 const results=await Promise.all(Array.from({length:12},(_,i)=>
  journal.accept(event((i+1)*60000))));
 assert.deepEqual(results,Array(12).fill(true));
 const recovered=new EventJournal(path);await recovered.restore();
 assert.equal(new Set(recovered.list().map(x=>x.id)).size,12);
 const files=await readdir(directory);
 assert.deepEqual(files,['events.json']);
});

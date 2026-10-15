import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';import path from 'node:path';
const script=new URL('../scripts/review-remote-weight-latch.js',import.meta.url).pathname;
async function target(reason='REMOTE_WEIGHT_HEADROOM_LOW'){
  const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-operator-recovery-'));
  const filename=path.join(dir,'binance-circuit.json');
  await writeFile(filename,JSON.stringify({reason,atMs:12345}));
  return {dir,filename};
}
function run(dir,args=[]){return spawnSync(process.execPath,[script,...args],{
  env:{...process.env,YELLOW_DATA_DIR:dir},encoding:'utf8',timeout:5000});}
test('maintenance default is read-only dry run',async()=>{
  const {dir,filename}=await target();const before=await readFile(filename,'utf8');
  const response=run(dir);assert.equal(response.status,0);assert.match(response.stdout,/DRY_RUN_ONLY/);
  assert.equal(await readFile(filename,'utf8'),before);
  assert.equal((await readdir(dir)).length,1);
});
test('explicit approved local operation backs up legacy latch, never clears HTTP ban',async()=>{
  const {dir,filename}=await target();const old=await readFile(filename,'utf8');
  const response=run(dir,['--apply']);assert.equal(response.status,0,response.stderr);
  assert.equal(JSON.parse(await readFile(filename,'utf8')).reason,null);
  const names=await readdir(dir);const backup=names.find(n=>n.includes('legacy-remote-weight-backup'));
  assert.ok(backup);assert.equal(await readFile(path.join(dir,backup),'utf8'),old);
  for(const reason of ['HTTP_418','HTTP_429','HTTP_451','INVALID']){
    const b=await target(reason);
    const rejected=run(b.dir,['--apply']);assert.notEqual(rejected.status,0);
    assert.equal(JSON.parse(await readFile(b.filename,'utf8')).reason,reason);
    assert.equal((await readdir(b.dir)).length,1);
  }
});

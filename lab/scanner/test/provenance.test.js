import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const path=new URL('../src/reference/',import.meta.url);
test('frozen evaluator files match pinned production commit blob IDs',async()=>{
 const manifest=JSON.parse(await readFile(new URL('PROVENANCE.json',path),'utf8'));
 assert.equal(manifest.commit,'b31412b36634b207852901aac2cf37325e4c6870');
 for(const [file,hash] of Object.entries(manifest.referenceBlobs)){
  const bytes=await readFile(new URL(file,path));
  const gitBlob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(gitBlob,hash,`${file} must remain byte-identical to frozen production evaluator`);
 }
});

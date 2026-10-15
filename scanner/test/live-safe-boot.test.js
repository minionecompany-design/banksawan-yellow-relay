import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const base=new URL('../../',import.meta.url);
test('production entrypoint fails closed without explicit live opt-in and volume',async()=>{
 const root=JSON.parse(await readFile(new URL('../../package.json',import.meta.url)));
 assert.equal(root.scripts.start,'node scanner/src/live-main.js');
 const run=spawnSync(process.execPath,['scanner/src/live-main.js'],{cwd:new URL('.',base),
   env:{...process.env,YELLOW_LIVE_ENABLED:'false',YELLOW_DATA_DIR:''},encoding:'utf8',timeout:3000});
 assert.notEqual(run.status,0);
 assert.match(run.stderr,/LIVE_DISABLED/);
});

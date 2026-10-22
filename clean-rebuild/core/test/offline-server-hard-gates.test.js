import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const working=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const [name,values] of [
 ['LIVE',{YELLOW_LIVE_ENABLED:'true'}],
 ['FCM',{FCM_SENDING_ENABLED:'true'}],
 ['FEED',{FEED_MODE:'LIVE'}]
]){
 test('Stage6 offline Railway refuses '+name+' enable before deployment',()=>{
  const proc=spawnSync(process.execPath,['offline-http.js'],{
   cwd:working,encoding:'utf8',timeout:3000,
   env:{...process.env,YELLOW_LIVE_ENABLED:'false',FCM_SENDING_ENABLED:'false',
     FEED_MODE:'OFFLINE',...values}
  });
  assert.equal(proc.status,1,proc.stderr);
  assert.match(proc.stderr,/LIVE_OR_FCM_BLOCKED_ON_STAGE6/);
 });
}

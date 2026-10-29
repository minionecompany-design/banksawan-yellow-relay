/** Offline-only operator tool for the exact legacy REMOTE_WEIGHT_HEADROOM_LOW latch.
 * Default is dry-run. --apply MUST require separately authorized production work.
 * No Binance calls, no Railway calls, no process restarts.
 */
import {readFile,writeFile,rename,copyFile,open,mkdir} from 'node:fs/promises';
import path from 'node:path';
const filename=process.env.YELLOW_DATA_DIR && path.join(process.env.YELLOW_DATA_DIR,'binance-circuit.json');
const apply=process.argv.includes('--apply');
const expected='REMOTE_WEIGHT_HEADROOM_LOW';
const abort=message=>{console.error('RECOVERY_REFUSED_'+message);process.exitCode=1;};
if(!filename || process.argv.some(arg=>arg.startsWith('--') && arg!=='--apply'))abort('ENV_OR_FLAGS');
else{
  try{
    const raw=await readFile(filename,'utf8');
    const latch=JSON.parse(raw);
    if(latch.reason!==expected)abort('LATCH_REASON_NOT_APPROVED');
    else if(typeof latch.atMs!=='number'||!Number.isFinite(latch.atMs))abort('INVALID_LATCH_TIMESTAMP');
    else if(!apply)console.log('DRY_RUN_ONLY: legacy IP-weight latch eligible for review. No files changed.');
    else{
      // Operator must first confirm there is no HTTP 418/429/451 evidence, approve
      // the scoped code deployment, and stop the existing process before applying.
      const backup=filename+'.legacy-remote-weight-backup-'+Date.now();
      await copyFile(filename,backup,1); // COPYFILE_EXCL: never overwrite evidence
      const recovery={reason:null,originalReason:expected,recoveredAtMs:Date.now(),backupCreated:true};
      const temp=filename+'.review-'+process.pid;
      const f=await open(temp,'wx',0o600);
      try{await f.writeFile(JSON.stringify(recovery));await f.sync();}finally{await f.close();}
      await rename(temp,filename);
      console.log('OPERATOR_APPROVED_LATCH_RECLASSIFIED: backup created; no network used.');
    }
  }catch(e){abort(e.code==='ENOENT'?'NO_LATCH_FILE':e instanceof SyntaxError?'INVALID_LATCH_FILE':e.code||'UNKNOWN');}
}

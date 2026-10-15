/** Launch LOCALHOST ONLY. Offline replay is explicitly not a production feed. */
import {createOfflineAcceptanceServer} from '../src/offline-acceptance-server.js';
import path from 'node:path';
const port=Number(process.env.YELLOW_OFFLINE_PORT||4183);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('INVALID_OFFLINE_PORT');
const filename=process.env.YELLOW_OFFLINE_JOURNAL_PATH||path.resolve(process.cwd(),'.offline-home.json');
const replayToken=process.env.YELLOW_OFFLINE_REPLAY_TOKEN||null;
const server=createOfflineAcceptanceServer({journalFilename:filename,offlineReplayToken:replayToken});
server.listen(port,'127.0.0.1',()=>{
  console.log(`YELLOW OFFLINE ACCEPTANCE http://127.0.0.1:${port} — Binance requests 0`);
  console.log(replayToken&&replayToken.length>=24?'Local replay ingestion enabled':'Replay ingestion DISABLED (read-only)');
});

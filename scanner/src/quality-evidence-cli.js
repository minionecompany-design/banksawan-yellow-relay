/** Offline CLI. Reads local JSON only; NO HTTP/Binance/APK/FCM/DB.
 * node src/quality-evidence-cli.js LOCAL_EVIDENCE.json > study.json
 */
import {readFile} from 'node:fs/promises';
import {evaluateQualityEvidence} from './quality-evidence-v1.js';
if(process.argv.length!==3)throw Error('USAGE: node src/quality-evidence-cli.js LOCAL_EVIDENCE.json');
const records=JSON.parse(await readFile(process.argv[2],'utf8'));
process.stdout.write(JSON.stringify(evaluateQualityEvidence(records),null,2)+'\n');


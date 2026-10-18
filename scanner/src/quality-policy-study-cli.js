/** LOCAL JSON ONLY. Accepts a recorder export, or a plain array of evidence rows.
 * node src/quality-policy-study-cli.js INPUT.json [OPTIONS.json] > study.json
 * OPTIONS: validationStartMs, observedThroughMs, alertTimeframes.
 */
import {readFile} from 'node:fs/promises';
import {compareQualityPolicies} from './quality-policy-study-v1.js';
if(process.argv.length<3||process.argv.length>4)
 throw Error('USAGE: node src/quality-policy-study-cli.js LOCAL_INPUT.json [LOCAL_OPTIONS.json]');
const readJson=async file=>{
 const stat=await import('node:fs/promises').then(fs=>fs.stat(file));
 if(!stat.isFile()||stat.size>16*1024*1024)throw Error('INPUT_NOT_FILE_OR_TOO_LARGE');
 return JSON.parse(await readFile(file,'utf8'));
};
const input=await readJson(process.argv[2]);
const options=process.argv[3]?await readJson(process.argv[3]):{};
if(!options||typeof options!=='object'||Array.isArray(options))throw Error('INVALID_OPTIONS');
const records=Array.isArray(input)?input:
 input?.version===1&&input?.mode==='RESEARCH_ONLY'&&Array.isArray(input.records)?input.records:null;
const study=compareQualityPolicies(records,options);
if(!Array.isArray(input))study.recorderHeader={mode:input.mode,version:input.version,
 records:input.records.length,totals:input.totals??null,
 note:'Header counts are reported, not authenticated; each row is independently validated'};
process.stdout.write(JSON.stringify(study,null,2)+'\n');

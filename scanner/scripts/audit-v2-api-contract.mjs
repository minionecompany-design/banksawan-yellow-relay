#!/usr/bin/env node
/** Saved JSON input only. Does not contact Railway, Binance, Firebase or a phone. */
import {readFile} from 'node:fs/promises';
import {auditV2ApiContract} from './lib/v2-api-contract.mjs';
try{
  if(process.argv.length!==4||process.argv[2]!=='--snapshot')throw Error('Usage: audit-v2-api-contract.mjs --snapshot saved-api-snapshot.json');
  const report=auditV2ApiContract(JSON.parse(await readFile(process.argv[3],'utf8')));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  process.exitCode=report.passed?0:1;
}catch(error){process.stderr.write('V2_API_AUDIT_INPUT_ERROR: '+error.message+'\n');process.exitCode=2;}

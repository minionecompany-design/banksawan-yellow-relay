#!/usr/bin/env node
/** Usage (local files, NO network):
 * node scanner/scripts/audit-cex-universe.mjs --exchange-info exchange.json
 * --binance-tickers ticker24hr.json --binance-at-ms 1780000000000
 * [--cex-symbols cex.json --cex-at-ms 1780000000000]
 * CEX JSON is an array of BINANCE:PLAYUSDT.P / PLAYUSDT.P symbols.
 * The operator must independently match CEX screen filters.
 */
import {readFile} from 'node:fs/promises';
import {auditCexUniverse} from '../src/cex-universe-audit.js';
const argumentsByKey={};
for(let i=2;i<process.argv.length;i+=2){
 const flag=process.argv[i];
 if(!flag?.startsWith('--')||!process.argv[i+1]||argumentsByKey[flag])throw Error('INVALID_ARGUMENTS');
 argumentsByKey[flag]=process.argv[i+1];
}
const required=['--exchange-info','--binance-tickers','--binance-at-ms'];
if(required.some(k=>!argumentsByKey[k]))throw Error('REQUIRED_BINANCE_SNAPSHOT_INPUTS_MISSING');
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const comparison=await auditCexUniverse({
 exchangeInfo:await readJson(argumentsByKey['--exchange-info']),
 tickers:await readJson(argumentsByKey['--binance-tickers']),
 observedAtMs:Number(argumentsByKey['--binance-at-ms']),
 cexSymbols:argumentsByKey['--cex-symbols']?
   await readJson(argumentsByKey['--cex-symbols']):null,
 cexObservedAtMs:argumentsByKey['--cex-at-ms']?
   Number(argumentsByKey['--cex-at-ms']):null
});
process.stdout.write(JSON.stringify(comparison,null,2)+'\n');

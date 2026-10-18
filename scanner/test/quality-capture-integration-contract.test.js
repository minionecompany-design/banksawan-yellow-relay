import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {QualityCaptureBridgeV1} from '../src/quality-capture-bridge-v1.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('production defaults preserve all signals and report disabled research state',async()=>{
 const main=await readFile(new URL('../src/live-main.js',import.meta.url),'utf8');
 assert.match(main,/process\.env\.YELLOW_GOLD_EVIDENCE_ENABLED==='true'/);
 const dataDir=await mkdtemp(path.join(os.tmpdir(),'yellow-gold-disabled-'));
 const market=new YellowLiveMarket({dataDir,wsClass:class {},guard:{metrics:()=>({}),closedReason:null},log:()=>{}});
 assert.equal(market.passiveEvidence,null);
 assert.deepEqual(market.status().researchEvidence,{enabled:false});
});

test('enabled capture health status is small and contains no candle prices or OHLCV',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'yellow-gold-health-'));
 const bridge=new QualityCaptureBridgeV1({dataDir:dir});
 assert.equal(await bridge.initialize(),true);
 const s=bridge.status();
 assert.equal(s.enabled,true);assert.equal(s.pendingRecords,0);
 assert.equal(Object.hasOwn(s,'bars'),false);
 assert.equal(Object.hasOwn(s,'records'),false);
 assert.equal(Object.hasOwn(s,'price'),false);
});

test('binance REST, socket endpoints and FCM send are never altered by research imports',async()=>{
 const market=await readFile(new URL('../src/live-market.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/live-main.js',import.meta.url),'utf8');
 assert.match(market,/const API='https:\/\/fapi\.binance\.com'/);
 assert.match(market,/const WS_RAW='wss:\/\/fstream\.binance\.com\/market\/ws'/);
 assert.match(market,/const WS_SUBSCRIBE='wss:\/\/fstream\.binance\.com\/market\/stream'/);
 assert.match(main,/const delivery=await fcm\.send\(event\);/);
 assert.match(market,/await this\.sendEvent\(accepted\.event\);/);
});

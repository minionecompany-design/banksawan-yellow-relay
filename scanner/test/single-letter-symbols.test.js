import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {normalizeBinanceTicker} from '../src/binance-fixture-adapter.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {LiveHomeLedger} from '../src/live-home-ledger.js';
import {LaneCheckpoint} from '../src/live-state-checkpoint.js';
import {YellowFcm} from '../src/live-fcm.js';
import {auditCexUniverse} from '../src/cex-universe-audit.js';
import {validAnalysisEventId} from '../src/analysis-companion.js';
const now=Date.UTC(2026,9,27,3);
const info=symbol=>({symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'});
const ticker=symbol=>({symbol,lastPrice:'0.2',priceChangePercent:'2',quoteVolume:'20000000'});

test('Q/W pass exchange metadata, ticker normalization and complete UNIVERSE; malformed symbols stay rejected',async()=>{
  const symbols=['QUSDT','WUSDT','AINUSDT'];
  const market=new YellowLiveMarket({dataDir:'/unused-symbol-test',clock:()=>now,wsClass:class{},log:()=>{}});
  market.rest=async url=>url.includes('exchangeInfo')?{symbols:symbols.map(info)}:symbols.map(ticker);
  await market.refreshUniverse();
  assert.deepEqual(market.universe().map(x=>x.symbol),symbols);
  const comparison=auditCexUniverse({exchangeInfo:{symbols:symbols.map(info)},tickers:symbols.map(ticker),
    observedAtMs:now,cexObservedAtMs:now,cexSymbols:symbols.map(s=>'BINANCE:'+s+'.P')});
  assert.equal(comparison.exactMembershipMatch,true);
  for(const symbol of ['USDT','qusdt','QUSDT/../','QUSDT?symbol=WUSDT','Q-USDT'])
    assert.throws(()=>normalizeBinanceTicker({symbol,ticker:ticker(symbol),exchangeSymbol:info(symbol),observedAtMs:now}),/INVALID_SYMBOL/);
});

test('Q/W four-TF events survive durable HOME reload, bind analysis identity and pass FCM validation',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'yellow-symbols-'));
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const account={project_id:'test',client_email:'test@example.test',private_key:privateKey.export({format:'pem',type:'pkcs8'}).toString()};
  const pushes=[];
  const fcm=new YellowFcm({enabled:true,clock:()=>now,serviceAccountJson:JSON.stringify(account),
    fetchImpl:async(url,opts)=>url.includes('oauth2.googleapis.com')?
      {ok:true,json:async()=>({access_token:'offline-token',expires_in:3500})}:
      (pushes.push(JSON.parse(opts.body)),{ok:true,json:async()=>({name:'offline'})})});
  try{
    const filename=path.join(dir,'home.json'),ledger=new LiveHomeLedger({filename,clock:()=>now});
    await ledger.restore();const checkpoints=new LaneCheckpoint(path.join(dir,'lanes'));
    for(const symbol of ['QUSDT','WUSDT']){
      assert.equal(path.basename(checkpoints.filename(symbol)),symbol+'.json');
      for(const timeframe of ['1m','5m','15m','1h']){
        const event={id:`${symbol}:${timeframe}:${now}:LONG_A`,symbol,timeframe,signal:'LONG_A',barClosedAtMs:now,
          price:.2,binance24hChangePct:2,quoteVolume24h:20_000_000,expiresAtMs:now+300000};
        assert.equal(validAnalysisEventId(event.id),true);
        const accepted=await ledger.accept(event);assert.equal(accepted.accepted,true);
        assert.equal((await fcm.send(accepted.event)).sent,true);
        assert.equal((await ledger.accept(event)).reason,'DUPLICATE');
      }
    }
    const restored=new LiveHomeLedger({filename,clock:()=>now});await restored.restore();
    assert.equal(restored.home().length,8);assert.equal(pushes.length,8);
    assert.deepEqual(new Set(pushes.map(p=>p.message.data.symbol)),new Set(['QUSDT','WUSDT']));
    assert.throws(()=>checkpoints.filename('../QUSDT'),/INVALID_CHECKPOINT_SYMBOL/);
    assert.equal(validAnalysisEventId(`USDT:1m:${now}:LONG_A`),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCexUniverse} from '../src/cex-universe-audit.js';

const TIME=1_780_000_000_000;
const symbol=i=>'COIN'+i+'USDT';
const row=(s,pct='1.25',vol='20000000',price='0.49')=>({
 symbol:s,priceChangePercent:pct,lastPrice:price,quoteVolume:vol});
const info=names=>({symbols:names.map(s=>({symbol:s,contractType:'PERPETUAL',
 status:'TRADING',quoteAsset:'USDT'}))});
const args=(rows,metadata=info(rows.map(x=>x.symbol)))=>({
 exchangeInfo:metadata,tickers:rows,observedAtMs:TIME});
test('27 symbols (<50) means ALL 27 expected scanned in healthy steady state',()=>{
 const rows=Array.from({length:27},(_,i)=>row(symbol(i)));
 const x=auditCexUniverse(args(rows));
 assert.equal(x.eligibleCount,27);
 assert.equal(x.expectedCoveredWhenHealthy,27);
 assert.equal(x.comparison,'CEX_EXPORT_NOT_PROVIDED');
 assert.equal(x.networkRequests,0);
});
test('47 matching CEX Binance perpetual tickers get 47/47; matching membership proves a single snapshot only',()=>{
 const rows=Array.from({length:47},(_,i)=>row(symbol(i)));
 const result=auditCexUniverse({...args(rows),
   cexSymbols:rows.map(x=>'BINANCE:'+x.symbol+'.P'),cexObservedAtMs:TIME+1000});
 assert.equal(result.eligibleCount,47);
 assert.equal(result.cexCount,47);
 assert.equal(result.expectedCoveredWhenHealthy,47);
 assert.equal(result.exactMembershipMatch,true);
 assert.deepEqual(result.onlyBinance,[]);
 assert.deepEqual(result.onlyCex,[]);
});
test('65 eligible remain in universe; target 50/65, report CEX missing and extra by identity',()=>{
 const rows=Array.from({length:65},(_,i)=>row(symbol(i)));
 const cex=rows.slice(0,64).map(x=>x.symbol+'.P').concat('OUTSIDEUSDT.P');
 const result=auditCexUniverse({...args(rows),cexSymbols:cex,cexObservedAtMs:TIME});
 assert.equal(result.eligibleCount,65);
 assert.equal(result.expectedCoveredWhenHealthy,50);
 assert.deepEqual(result.onlyBinance,[symbol(64)]);
 assert.deepEqual(result.onlyCex,['OUTSIDEUSDT']);
 assert.equal(result.exactMembershipMatch,false);
});
test('strict changes / volume / price and wrong contract status exclude, REST conversion only',()=>{
 const rows=[row('GOODUSDT'),row('CHANGEUSDT','1'),row('VOLUMEUSDT','4','10000000'),
  row('PRICEUSDT','2','20000000','10'),row('NOQUSDT','3',undefined),
  row('BADUSDT','4','nan'),row('DELIVUSDT','4','20000000')];
 // Delete rather than default fallback for the missing field.
 delete rows[4].quoteVolume;
 const metadata=info(rows.map(x=>x.symbol));
 metadata.symbols.find(x=>x.symbol==='DELIVUSDT').status='BREAK';
 const r=auditCexUniverse(args(rows,metadata));
 assert.deepEqual(r.eligibleSymbols,['GOODUSDT']);
 assert.equal(r.rejectedMalformed,1);
});
test('reject misleading unsynced CEX comparison, spot symbols, incorrect exchange and duplicated rows',()=>{
 const rows=[row('PLAYUSDT'),row('FOGOUSDT')],base=args(rows);
 for(const cexSymbols of [['PLAYUSDT','FOGOUSDT.P'],
     [{symbol:'PLAYUSDT.P',exchange:'BYBIT'}],
     ['PLAYUSDT.P','PLAYUSDT.P']]){
  assert.throws(()=>auditCexUniverse({...base,cexSymbols,cexObservedAtMs:TIME}),/CEX_/);
 }
 assert.throws(()=>auditCexUniverse({...base,
  cexSymbols:['PLAYUSDT.P'],cexObservedAtMs:TIME+120001}),/SNAPSHOTS_MORE_THAN/);
 assert.throws(()=>auditCexUniverse({...base,tickers:rows.concat(rows[0])}),/DUPLICATE_BINANCE/);
 assert.throws(()=>auditCexUniverse({...base,observedAtMs:null}),/TIMESTAMPED/);
});

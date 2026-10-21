import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {labTickerGate,LAB_24H_MIN,LAB_PRICE_EXCLUSIVE} from '../src/eligibility.js';
import {createHomeCard,chooseHomeCards,LAB_HOME_TTL_MS,LAB_HOME_MAX_CARDS} from '../src/home-policy.js';
import {evaluateClosedSnapshot} from '../src/offline-evaluator.js';
import {stepLongAOnTimeframe as goldReference} from '../src/reference/parallel-long-a.js';
import {stepLongAOnTimeframe as labReference} from '../src/lab-parallel-long-a.js';

const M=60000,H=3600000;
const AT=1797000000000;
const ticker=(p=0,price=.5,at=AT)=>({symbol:'TESTUSDT',contractType:'PERPETUAL',status:'TRADING',
  source:'BINANCE_USDM_FUTURES',priceChangePercent:String(p),lastPrice:String(price),observedAtMs:at});
test('LAB 1m >=0%, 1h >=1%, strict <10; ticker must be Binance USDM as-of',()=>{
  assert.deepEqual(LAB_24H_MIN,{'1m':0,'1h':1});assert.equal(LAB_PRICE_EXCLUSIVE,10);
  for(const p of [-.01,-2])assert.equal(labTickerGate(ticker(p),'1m',AT).eligible,false);
  for(const p of [0,.001,.5,1])assert.equal(labTickerGate(ticker(p),'1m',AT).eligible,true);
  assert.equal(labTickerGate(ticker(0.5),'1h',AT).eligible,false);
  assert.equal(labTickerGate(ticker(1),'1h',AT).eligible,true);
  assert.equal(labTickerGate(ticker(1,10),'1m',AT).reason,'PRICE_NOT_BELOW_10');
  assert.equal(labTickerGate(ticker(1,9.999999),'1m',AT).eligible,true);
  assert.equal(labTickerGate(ticker(1,.5,AT+1),'1m',AT).reason,'UNTRUSTWORTHY_ASOF_TICKER');
  assert.equal(labTickerGate(ticker(1,.5,AT-121000),'1m',AT).eligible,false);
  assert.equal(labTickerGate({...ticker(2),contractType:'CURRENT_QUARTER'},'1m',AT).eligible,false);
  assert.equal(labTickerGate(ticker(1),'5m',AT).reason,'UNSUPPORTED_TF');
});
const makeSnapshot=(tf,pct=0,price=.5)=>{
 const span={'1m':M,'5m':5*M,'15m':15*M,'1h':H};
 // align target candle and all MTF snapshots as of this target, no future close.
 const target=AT-AT%span[tf];
 const frames={};
 for(const [frame,key] of Object.entries({'1m':'oneMinute','5m':'fiveMinute','15m':'fifteenMinute','1h':'oneHour'})){
  const n=span[frame];const last=frame===tf?target:Math.floor((target-1)/n)*n;
  frames[key]=Array.from({length:115},(_,i)=>({endMs:last-(114-i)*n,open:price,high:price,
    low:price,close:price,volume:100}));
 }
 return {snapshot:{...frames,ticker24h:ticker(pct,price,target)},nowMs:target+M};
};
test('actual LAB evaluator 1m allows pct=0 to pass ticker gate, GOLD reference still blocks it',()=>{
  const {snapshot,nowMs}=makeSnapshot('1m',0);
  const lab=evaluateClosedSnapshot({symbol:'TESTUSDT',timeframe:'1m',snapshot,nowMs});
  const gold=goldReference('TESTUSDT','1m',{...snapshot,nowMs,contextMode:'CAUSAL_REALTIME'},
    {tradeState:0,countDown:0,countUp:0,lastPullbackBar:null,protectBar:null,index:-1,lastProcessedEndMs:null,lastEventId:null});
  assert.equal(lab.reason,'NO_CONFIRMED_SIGNAL');
  assert.equal(lab.diagnostics.eligible,true);
  assert.equal(gold.reason,'BINANCE_24H_FILTER');
  assert.equal(gold.diagnostics.eligible,false);
  assert.equal(evaluateClosedSnapshot({symbol:'TESTUSDT',timeframe:'1m',snapshot:makeSnapshot('1m',-.1).snapshot,nowMs}).reason,'BINANCE_24H_FILTER');
});
test('actual LAB evaluator 1h retains +1% threshold and rejects price >=10',()=>{
  const {snapshot,nowMs}=makeSnapshot('1h',.5);
  const pctHalf=evaluateClosedSnapshot({symbol:'TESTUSDT',timeframe:'1h',snapshot,nowMs});
  assert.equal(pctHalf.reason,'BINANCE_24H_FILTER');
  const pctOne=evaluateClosedSnapshot({symbol:'TESTUSDT',timeframe:'1h',snapshot:makeSnapshot('1h',1).snapshot,nowMs});
  assert.equal(pctOne.reason,'NO_CONFIRMED_SIGNAL');assert.equal(pctOne.diagnostics.eligible,true);
  const highPrice=evaluateClosedSnapshot({symbol:'TESTUSDT',timeframe:'1h',snapshot:makeSnapshot('1h',1,10).snapshot,nowMs});
  assert.equal(highPrice.reason,'BINANCE_24H_FILTER');
});
test('LAB production reference files remain frozen identical to pinned provenance',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../src/reference/PROVENANCE.json',import.meta.url),'utf8'));
  assert.equal(manifest.commit,'b31412b36634b207852901aac2cf37325e4c6870');
  for(const [name,expected] of Object.entries(manifest.referenceBlobs)){
    const b=await readFile(new URL('../src/reference/'+name,import.meta.url));
    const sha=createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');assert.equal(sha,expected);
  }
});
const valid=(symbol='DOODUSDT',at=AT,tf='1m',signal='LONG_B',bOrdinal=1)=>({
 symbol,timeframe:tf,signal, ...(tf==='1m'?{bOrdinal}:{}),barClosedAtMs:at,
 id:`${symbol}:${tf}:${at}:${signal}`,price:.0023,
 confirmedClosedBar:true,causalVerified:true,eligibleAsOf:true,
 ...(tf==='1m'?{fromFirstA:true,protectVerified:true,qualityPassed:true,episodeAtMs:at-10*M}:{}),
});
test('only confirmed B1/B2 and 1h A can appear; A1, HOT, B3 stay invisible',()=>{
 const now=AT+M;
 for(const x of [valid('DOODUSDT',AT,'1m','LONG_A'),valid('DOODUSDT',AT,'1m','HOT'),
   valid('DOODUSDT',AT,'1m','LONG_B',3),valid('DOODUSDT',AT,'1h','LONG_B')])assert.equal(createHomeCard(x,now),null);
 for(const x of [valid(),valid('JCTUSDT',AT,'1m','LONG_B',2),valid('BRUSDT',AT,'1h','LONG_A')]){
   let card=createHomeCard(x,now);assert.equal(card.expiresAtMs,AT+LAB_HOME_TTL_MS);assert.equal(card.signaledAtMs,AT);
 }
 assert.equal(createHomeCard({...valid(),price:10},now),null);
 assert.equal(createHomeCard({...valid(),price:0},now),null);
 assert.equal(createHomeCard({...valid(),protectVerified:false},now),null);
 assert.equal(createHomeCard({...valid(),eligibleAsOf:false},now),null);
 assert.equal(createHomeCard({...valid(),confirmedClosedBar:false},now),null);
 assert.equal(createHomeCard({...valid(),episodeAtMs:AT-121*M},now),null);
});
test('HOME 10h from B close, does not renew on restart/polling; exact deadline excluded',()=>{
 const x=valid();
 assert.ok(createHomeCard(x,AT+LAB_HOME_TTL_MS-1));
 assert.equal(createHomeCard(x,AT+LAB_HOME_TTL_MS),null);
 assert.equal(createHomeCard(x,AT+LAB_HOME_TTL_MS+1),null);
 assert.equal(createHomeCard(x,AT-M),null);
});
test('same episode B1 before B2, no repeated symbol/timeframe and HOME max 12',()=>{
 const t=AT+30*M;
 const a=valid('DOODUSDT',AT,'1m','LONG_B',1),b=valid('DOODUSDT',AT+2*M,'1m','LONG_B',2);
 b.episodeAtMs=a.episodeAtMs;
 const cards=chooseHomeCards([b,a,a,valid('BRUSDT',AT,'1h','LONG_A')],t);
 assert.equal(cards.length,2);assert.equal(cards.find(e=>e.symbol==='DOODUSDT').bOrdinal,1);
 const many=Array.from({length:20},(_,i)=>valid('T'+String(i).padStart(2,'0')+'USDT',AT));
 assert.equal(chooseHomeCards(many,t).length,LAB_HOME_MAX_CARDS);
});
test('Android explicitly routes TradingView Mobile, no Chrome and verified 10h client timeout',async()=>{
 const main=await readFile(new URL('../../android/app/src/main/java/id/banksawan/yellowlab/MainActivity.java',import.meta.url),'utf8');
 const manifest=await readFile(new URL('../../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 assert.match(main,/setPackage\(TV_PACKAGE\)/);assert.match(main,/com\.tradingview\.tradingviewapp/);
 assert.match(main,/card\.setOnClickListener\(v->openTradingViewNative/);
 assert.match(main,/HOME_TTL_MS=10L\*60L\*60L\*1000L/);
 assert.match(main,/expires!=signaledAt\+HOME_TTL_MS/);
 assert.doesNotMatch(main,/startActivity\(new Intent\(Intent\.ACTION_VIEW,uri\)\)/);
 assert.doesNotMatch(main,/setPackage\(null\)|setPackage\(\"com\.android\.chrome\"\)/i);
 assert.match(manifest,/com\.tradingview\.tradingviewapp/);
});
test('LAB fork differs from frozen LONG A logic only in intentional 1M eligibility substitution',async()=>{
  const base=await readFile(new URL('../src/reference/parallel-long-a.js',import.meta.url),'utf8');
  const fork=await readFile(new URL('../src/lab-parallel-long-a.js',import.meta.url),'utf8');
  const fromImport=x=>x.slice(x.indexOf('import {SETTINGS, wilderRsiSeries}'));
  const expected=fromImport(base)
    .replace("from './long-a.js'","from './reference/long-a.js'")
    .replace('function checkTicker(symbol,ticker,signalEndMs){',
             'function checkTicker(symbol,ticker,signalEndMs,minBinance24hChangePct){')
    .replace('eligible:pct>=SETTINGS.minBinance24hChangePct',
             'eligible:pct>=minBinance24hChangePct')
    .replace('const ticker=checkTicker(symbol,input.ticker24h,end);',
      "const ticker=checkTicker(symbol,input.ticker24h,end,tf==='1m'?0:SETTINGS.minBinance24hChangePct);");
  assert.equal(fromImport(fork),expected);
});

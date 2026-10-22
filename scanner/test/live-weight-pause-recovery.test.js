import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {YellowLiveMarket} from '../src/live-market.js';
import {RequestGuard,RestPaused,CircuitOpen} from '../src/live-request-guard.js';
const END=Date.UTC(2026,9,15,12);
const exchange=symbol=>({symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'});
class FakeWs {
  constructor(url){this.url=url;this.readyState=1;this.callbacks={};}
  addEventListener(name,cb){this.callbacks[name]=cb;}
  emit(name,v){this.callbacks[name]?.(v);}
  send(){}
  close(){this.readyState=3;}
}
async function setup({header='450',responses,clock=()=>END}={}){
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'yellow-rest-pause-'));
  let calls=0;
  const guard=new RequestGuard({filename:path.join(dataDir,'binance-circuit.json'),clock,minGapMs:0,
    fetchImpl:async(url)=>{
      calls++;
      return {status:200,ok:true,headers:{get:()=>typeof header==='function'?header(calls):header},
        json:async()=>responses?responses(url,calls):{symbols:[exchange('WALUSDT')]}};
    }});
  await guard.restore();
  const market=new YellowLiveMarket({dataDir,clock,guard,wsClass:FakeWs,log:()=>{}});
  return {market,guard,getCalls:()=>calls};
}

test('startup under high shared-IP weight retains WS feed and defers REST without crashing',async()=>{
  let now=END;
  const {market,guard,getCalls}=await setup({clock:()=>now});
  await market.start();
  try{
    assert.equal(getCalls(),1,'exchangeInfo is only network request; 40-weight 24h fetch deferred');
    assert.equal(market.isRunning,true);assert.equal(market.isHalted,false);
    assert.equal(guard.isRemotePaused(),true);
    market.tickerWs.emit('open');market.klineWs.emit('open');
    market.tickerWs.emit('message',{data:JSON.stringify([{s:'WALUSDT',c:'0.05',P:'5.6',q:'20000000',E:now,st:1}])});
    assert.equal(market.tickerConnected,true);
    assert.equal(market.universe().length,1,'WebSocket still updates eligible universe');
    assert.equal(getCalls(),1);
    // The scheduler must not bootstrap while high-weight pause is active.
    await new Promise(r=>setTimeout(r,1250));
    assert.equal(getCalls(),1);
  }finally{market.stop();}
});

test('paused 4-timeframe bootstrap cannot create incomplete SCANNING slot or halt engine',async()=>{
  const {market}=await setup({header:'2'});const symbol='WALUSDT';
  market.exchangeSymbols.set(symbol,exchange(symbol));
  market.isRunning=true;market.tickerConnected=true;market.klineConnected=true;
  let requested=0;
  market.rest=async()=>{requested++;throw new RestPaused(END+90_000);};
  await market.bootstrap(symbol);
  assert.equal(requested,1);
  assert.equal(market.isHalted,false);
  assert.equal(market.covered.has(symbol),false);
  assert.equal(market.inProgress.size,0);
  assert.equal(market.retryAfter.get(symbol),END+90_000);
  assert.match(market.recentFaults.at(-1).reason,/BOOTSTRAP_REST_DEFERRED/);
});

test('real HTTP 429 still halts YELLOW rather than continuing existing websocket lane',async()=>{
  const {market,guard}=await setup({header:'950'});
  guard.fetchImpl=async()=>({status:429,ok:false,headers:{get:()=> '950'},json:async()=>({})});
  await assert.rejects(market.rest('/fapi/v1/exchangeInfo'),CircuitOpen);
  assert.equal(market.isHalted,true);
  assert.equal(guard.closedReason,'HTTP_429');
});

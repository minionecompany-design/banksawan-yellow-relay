import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {YellowV16WatchMonitor} from '../src/yellow-v16-watch-monitor.js';
import {YellowLiveMarket} from '../src/live-market.js';
import {event,T,M,candle} from './fixtures/forward-shadow.mjs';
import {context} from './fixtures/entry-watch.mjs';
const baseline='381823f7ce773c6c7e276c6833f47fbac481f5ed';
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
test('production critical strategy, all Android UI, FCM, universe, request guard and V16 decisions byte-identical to deployed commit',()=>{
 const files=execFileSync('git',['ls-tree','-r','--name-only',baseline,'scanner/src','android'],{cwd:root,encoding:'utf8'}).trim().split('\n');
 const critical=files.filter(p=>p.startsWith('android/')||/(long-a|pine-v13|live-fcm|live-request-guard|live-universe|yellow-v16-watch-monitor|entry-readiness-v3|entry-continuation-v4|second-signal-compositor|live-analysis-delivery|binance-fixture-adapter|live-api)\.js$/.test(p));
 assert.ok(critical.length>20);
 for(const file of critical)assert.deepEqual(fs.readFileSync(path.join(root,file)),execFileSync('git',['show',`${baseline}:${file}`],{cwd:root,maxBuffer:8*1024*1024}),file);
});
test('native scanner WS / ticker / universe unchanged even if every observation hook throws',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v16-parity-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const tar=execFileSync('git',['archive',baseline,'scanner/src'],{cwd:root,maxBuffer:32*1024*1024});execFileSync('tar',['-x','-C',dir],{input:tar});fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
 const {YellowLiveMarket:Original}=await import(pathToFileURL(path.join(dir,'scanner/src/live-market.js')));
 class Socket{static OPEN=1;constructor(url){this.url=url;this.readyState=1;this.listeners=new Map();this.messages=[];}addEventListener(k,f){this.listeners.set(k,f);}send(x){this.messages.push(x);}close(){this.readyState=3;}emit(k,v){this.listeners.get(k)?.(v);}}
 const exploding=new Proxy({},{get(){return ()=>{throw Error('RECORDER_FAULT');}}});
 const run=async(C,observation)=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'v16-parity-market-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));let rest=0;
  const m=new C({dataDir:d,clock:()=>T+5000,wsClass:Socket,observation,log:()=>{},random:()=>0,guard:{closedReason:null,metrics:()=>({}),getJson:()=>{rest++;throw Error('NETWORK_FORBIDDEN');}}});
  m.isRunning=true;m.exchangeSymbols.set(event.symbol,{symbol:event.symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'});m.connectWebsockets();m.tickerWs.emit('open');m.klineWs.emit('open');
  m.tickerWs.emit('message',{data:JSON.stringify([{s:event.symbol,c:'1',P:'2',q:'20000000',st:1,E:T+4990}])});
  const out={universe:m.universe(),tickers:[...m.tickers],messages:m.klineWs.messages,rest};m.stop();return out;};
 assert.deepEqual(await run(YellowLiveMarket,exploding),await run(Original,null));
});
test('passive mirror leaves original V16 6-hour states identical for sequential closed-bar replay',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v16-monitor-baseline-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive',baseline,'scanner/src'],{cwd:root,maxBuffer:32*1024*1024})});fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
 const {YellowV16WatchMonitor:Original}=await import(pathToFileURL(path.join(dir,'scanner/src/yellow-v16-watch-monitor.js')));
 let now=T+5000;const a=new Original({clock:()=>now}),b=new YellowV16WatchMonitor({clock:()=>now});for(const m of [a,b])m.capture(event,context(T));
 for(let i=1;i<=360;i++){now=T+i*M+1000;const bar=candle(i,1,1.005,.99,1);const snapshot=context(bar.endMs,[bar]);for(const m of [a,b])m.onClosedBar(event.symbol,'1m',bar,snapshot);assert.deepEqual(b.view(event.id,null,now),a.view(event.id,null,now));}
});

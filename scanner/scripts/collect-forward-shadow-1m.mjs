#!/usr/bin/env node
/** Explicit operator-run observer. Default is a network-free plan. */
import {readFile,writeFile,mkdir,rename,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {ForwardShadowJournal} from '../src/forward-shadow-journal.js';
import {ForwardSubscriptionBudget} from './lib/forward-shadow-subscription-budget.mjs';
import {readShadowJson,captureShadowWarmup,parseShadowMarket,SHADOW_WS,YELLOW_READ_BASE} from './lib/forward-shadow-source.mjs';

export async function main(args=process.argv.slice(2)){
  if(!args.length||args[0]==='--plan'){
    console.log(JSON.stringify({mode:'PLAN_ONLY_NO_NETWORK',productionWrites:false,
      routes:[YELLOW_READ_BASE+'/api/events',YELLOW_READ_BASE+'/api/research/candles'],
      websocket:SHADOW_WS,required:'--collect ABSOLUTE_SEPARATE_DIRECTORY EXACT_RESEARCH_SHA [hours<=23]',
      warning:'Operator-run host required; never the production /data directory.'},null,2));return;
  }
  const [flag,directory,sourceCommit,hours='12']=args;
  if(flag!=='--collect'||!directory||!directory.startsWith('/')||resolve(directory)==='/data'||
     resolve(directory).startsWith('/data/')||!/^[a-f0-9]{40}$/.test(sourceCommit??'')||
     !(Number(hours)>0&&Number(hours)<=23)||args.length>4)throw Error('INVALID_SHADOW_COLLECT_ARGS');
  if(!globalThis.WebSocket)throw Error('NODE_22_WEBSOCKET_REQUIRED');
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const actual=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const dirty=execFileSync('git',['-C',root,'status','--porcelain','--','scanner'],{encoding:'utf8'}).trim();
  if(actual!==sourceCommit||dirty)throw Error('EXACT_CLEAN_RESEARCH_SOURCE_REQUIRED');
  await mkdir(directory,{recursive:true});
  const real=await realpath(directory);
  if(real==='/data'||real.startsWith('/data/'))throw Error('PRODUCTION_DATA_DIRECTORY_REJECTED');
  const configPath=join(directory,'forward-config.json');let config;
  try{config=JSON.parse(await readFile(configPath,'utf8'));
    if(config.sourceCommit!==sourceCommit)throw Error('SOURCE_FROZEN_USE_NEW_COHORT_DIRECTORY');
  }catch(e){if(e.code!=='ENOENT')throw e;
    config={startedAtMs:Date.now(),sourceCommit,provenance:'FORWARD_PUBLIC_WS',maxEvents:1000};
    await writeFile(configPath,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  const journal=new ForwardShadowJournal({filename:join(directory,'forward-shadow.ndjson'),config});
  await journal.initialize(Date.now());
  const symbols=new Set(journal.observer.books.keys());
  const ws=new WebSocket(SHADOW_WS);let id=1,stopped=false,polling=false,timer,stopTimer,subscribeTimer,lastWs=Date.now();
  const subscriptionBudget=new ForwardSubscriptionBudget();
  let stopPromise=null;
  const report=async()=>{
    const target=join(directory,'forward-receipt.json');
    await writeFile(target+'.tmp',JSON.stringify(journal.receipt(),null,2)+'\n',{mode:0o600});
    await rename(target+'.tmp',target);
  };
  const stop=(reason,error=null)=>{
    if(stopPromise)return stopPromise;
    stopped=true;clearInterval(timer);clearInterval(subscribeTimer);clearTimeout(stopTimer);
    stopPromise=(async()=>{
      try{if(!journal.failed)await journal.ingest({type:'GAP',reason,receivedAtMs:Date.now()});}
      finally{try{ws.close();}catch{}await journal.close();await report();}
      console.log(JSON.stringify({mode:'FORWARD_SHADOW_STOPPED',reason,failed:!!error,
        cohortEvents:journal.observer.records.size,releaseDecision:'NO_GO_LIVE'}));
      if(error)process.exitCode=1;
    })();return stopPromise;
  };
  const ingest=input=>journal.ingest(input).catch(e=>{void stop('COLLECTOR_FAULT',e);});
  // Outbound WebSocket SUBSCRIBE controls are budgeted to ONE PER SECOND.
  // Even if dozens of LONG A events arrive together, do not burst controls
  // into Binance's IP limiter. Data lag must be recorded as missing, not
  // silently repaired from later candles.
  const subscribe=added=>subscriptionBudget.enqueue(added);
  const flushSubscriptions=()=>{
    if(stopped||ws.readyState!==1)return;
    const batch=subscriptionBudget.take(Date.now());
    if(batch)ws.send(JSON.stringify({method:'SUBSCRIBE',params:batch.params,id:String(id++)}));
  };
  ws.addEventListener('message',e=>{
    if(stopped)return;
    const now=Date.now();lastWs=now;
    try{for(const input of parseShadowMarket(String(e.data),now,symbols))void ingest(input);}
    catch(error){void stop('WS_INVALID_INPUT',error);}
  });
  ws.addEventListener('close',()=>{if(!stopped)void stop('WS_CONNECTION_CLOSED');});
  ws.addEventListener('error',()=>{if(!stopped)void stop('WS_CONNECTION_ERROR',Error('PUBLIC_WS_UNAVAILABLE'));});
  const poll=async()=>{
    if(polling||stopped)return;polling=true;
    try{
      if(Date.now()-lastWs>30_000)throw Error('WS_SILENCE');
      const after=Math.max(config.startedAtMs-1,Date.now()-300_000);
      const data=await readShadowJson('/api/events?afterMs='+after);
      if(data.simulation!==false||data.mode!=='LIVE_SHADOW'||!Array.isArray(data.events)||data.events.length>1000)
        throw Error('INVALID_LONG_A_FEED');
      const fresh=data.events.filter(e=>!journal.observer.seenEvents.has(e.id));
      const added=[];
      for(const event of fresh){
        if(stopped)break;
        await journal.ingest({type:'LONG_A',event,receivedAtMs:Date.now()});
        if(event.timeframe==='1m'&&journal.observer.records.has(event.id)&&!symbols.has(event.symbol)){
          symbols.add(event.symbol);added.push(event.symbol);
        }
      }
      subscribe(added);
      for(const symbol of added){
        if(stopped)break;
        await captureShadowWarmup(symbol,journal);
      }
      if(!stopped){await journal.ingest({type:'HEARTBEAT',receivedAtMs:Date.now()});await report();}
    }catch(e){await stop('EVENT_FEED_OR_STORAGE_FAULT',e);}finally{polling=false;}
  };
  ws.addEventListener('open',()=>{
    if(stopped)return;
    try {
      ws.send(JSON.stringify({method:'SUBSCRIBE',params:['!ticker@arr'],id:String(id++)}));
      subscriptionBudget.noteControlSent(Date.now());
      subscribe([...symbols]);
      subscribeTimer=setInterval(()=>{
        try{flushSubscriptions();}catch(error){void stop('SUBSCRIBE_BUDGET_FAULT',error);}
      },1000);
      void poll();timer=setInterval(()=>void poll(),5000);
    }catch(error){void stop('SUBSCRIBE_STARTUP_FAULT',error);}
  });
  process.once('SIGINT',()=>void stop('OPERATOR_STOP'));
  process.once('SIGTERM',()=>void stop('OPERATOR_STOP'));
  stopTimer=setTimeout(()=>void stop('SESSION_DURATION_ENDED'),Number(hours)*3_600_000);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error(e.message);process.exitCode=1;});

#!/usr/bin/env node
/** Read-only, cryptographically verified forward research WAL audit.
 * Does not restore observer, change journals, fetch prices, or invent fills.
 */
import {createReadStream} from 'node:fs';
import {stat,open,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const ZERO='0'.repeat(64),sha=s=>createHash('sha256').update(s).digest('hex');
export async function auditForwardJournal(filename,{expectedCommit,receiptPath}={}){
  const max=512*1024*1024,info=await stat(filename);
  if(!info.isFile()||info.size===0||info.size>max)throw Error('INVALID_JOURNAL_SIZE');
  const f=await open(filename,'r');
  try{
    const byte=Buffer.alloc(1);
    await f.read(byte,0,1,info.size-1);
    if(byte[0]!==10)throw Error('TORN_JOURNAL_LAST_LINE');
  }finally{await f.close();}
  let previous=ZERO,sequence=0,header=null,transactions=0;
  const events=new Map(),excluded={},issues={},colors={},paperStatuses={};
  const progress={nativeBars:0,tickers:0,tickerBatches:0,minuteDecisions:0,
    heartbeat:0,forwardWatches:0};
  let report=null;
  const lines=createInterface({input:createReadStream(filename,{encoding:'utf8'}),crlfDelay:Infinity});
  for await(const line of lines){
    if(Buffer.byteLength(line)>8*1024*1024)throw Error('JOURNAL_LINE_TOO_LARGE');
    let row;try{row=JSON.parse(line);}catch{throw Error('INVALID_JOURNAL_JSON');}
    const {hash,...body}=row;
    if(body.sequence!==sequence||body.previous!==previous||sha(JSON.stringify(body))!==hash)
      throw Error('JOURNAL_HASH_CHAIN_CORRUPT');
    sequence++;previous=hash;
    if(sequence===1){
      if(body.type!=='HEADER'||!body.config||
         body.config.provenance!=='FORWARD_PUBLIC_WS'&&body.config.provenance!=='SYNTHETIC_QA')
         throw Error('INVALID_WAL_HEADER');
      header=body.config;
      if(expectedCommit&&header.sourceCommit!==expectedCommit)throw Error('SOURCE_COMMIT_MISMATCH');
      continue;
    }
    if(body.type!=='TRANSACTION'||!body.input||!Array.isArray(body.outputs))
      throw Error('INVALID_WAL_TRANSACTION');
    transactions++;
    const input=body.input;
    if(input.type==='HEARTBEAT')progress.heartbeat++;
    if(input.type==='NATIVE_BAR')progress.nativeBars++;
    if(input.type==='TICKER')progress.tickers++;
    if(input.type==='TICKER_BATCH')progress.tickerBatches++;
    for(const out of body.outputs){
      if(out.type==='EXCLUDED_EVENT'){
        excluded[out.reason]=(excluded[out.reason]||0)+1;
      }
      if(out.type==='COVERAGE_ISSUE'){
        issues[out.reason]=(issues[out.reason]||0)+1;
      }
      if(out.type==='ACCEPTED_LONG_A'){
        if(events.has(out.event.id))throw Error('DUPLICATE_ACCEPTED_EVENT_IN_WAL');
        events.set(out.event.id,{
          eventId:out.event.id,symbol:out.event.symbol,timeframe:out.event.timeframe,
          signalAtMs:out.event.barClosedAtMs,firstObservedAtMs:out.firstObservedAtMs,
          lateDiscovery:out.completeFromStart!==true,firstPriorityAtMs:null,
          firstRedAtMs:null,firstGreenAtMs:null,lastStatus:null,
          statusChanges:0,quotePaper:{},candlePaper:{}});
      }
      if(out.type==='MINUTE_DECISION')progress.minuteDecisions++;
      if(out.type==='LAMP_TRANSITION'&&out.lane==='unified'){
        const item=events.get(out.eventId);
        if(!item)throw Error('LAMP_WITHOUT_ACCEPTED_LONG_A');
        const status=out.decision?.status;
        if(!['OFF','RED','YELLOW','GREEN'].includes(status))throw Error('UNSUPPORTED_LAMP_STATUS');
        colors[status]=(colors[status]||0)+1;
        item.statusChanges++;item.lastStatus=status;
        if(status==='GREEN'&&item.firstGreenAtMs===null)item.firstGreenAtMs=out.atMs;
        if(status==='RED'&&item.firstRedAtMs===null)item.firstRedAtMs=out.atMs;
        if(out.decision.priority===true&&item.firstPriorityAtMs===null)item.firstPriorityAtMs=out.atMs;
      }
      if(out.type==='PAPER_TRANSITION'){
        const item=events.get(out.eventId);if(!item)throw Error('PAPER_WITHOUT_ACCEPTED_LONG_A');
        item.quotePaper[out.lane]=out.quotePaper?.status??null;
        item.candlePaper[out.lane]=out.candlePaper?.status??null;
        const name=out.lane+':'+(out.quotePaper?.status??'NO_QUOTE');
        paperStatuses[name]=(paperStatuses[name]||0)+1;
      }
    }
  }
  if(!header)throw Error('NO_JOURNAL_HEADER');
  if(receiptPath){
    const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
    if(receipt.finalHash!==previous||receipt.transactions!==transactions)
      throw Error('RECEIPT_JOURNAL_HASH_MISMATCH');
    report=receipt.report||null;
  }
  const cases=[...events.values()].map(x=>({
    ...x,firstPriorityMinutes:x.firstPriorityAtMs===null?null:
      Number(((x.firstPriorityAtMs-x.signalAtMs)/60_000).toFixed(2)),
    firstGreenMinutes:x.firstGreenAtMs===null?null:
      Number(((x.firstGreenAtMs-x.signalAtMs)/60_000).toFixed(2))
  }));
  return {
    mode:'VERIFIED_WAL_FORWARD_OBSERVATION_DIAGNOSTIC_ONLY',sourceCommit:header.sourceCommit,
    provenance:header.provenance,sourceStartedAtMs:header.startedAtMs,
    journal:{verified:true,transactions,finalHash:previous,bytes:info.size},
    counts:{acceptedLongA1m:cases.length,excluded,independentEpisodes:report?.independentEpisodes??null,
      completeSixHourEvents:report?.completeSixHourEvents??null,
      watchPriorities:cases.filter(x=>x.firstPriorityAtMs!==null).length,
      redEvents:cases.filter(x=>x.firstRedAtMs!==null).length,
      observedGreenEvents:cases.filter(x=>x.firstGreenAtMs!==null).length,
      unifiedTransitions:colors,quotePaperTransitions:paperStatuses,coverageIssues:issues,...progress},
    cases,canClaimWinRate:false,releaseDecision:'NO_GO_LIVE',
    limitations:['NO_INDEPENDENT_TRADING_PERFORMANCE_CERTIFICATION',
      'LTP_PAPER_NOT_EXECUTABLE_ASK','NO_CERTIFIED_SPREAD_OR_SLIPPAGE',
      'SMALL_OR_INCOMPLETE_WINDOWS_MUST_NOT_BE_TREATED_AS_LOSSES',
      'GREEN_NEEDS_A_REAL_POST_CONFIRMATION_QUOTE']
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [filename,receiptPath,destination]=process.argv.slice(2);
  if(!filename)throw Error('Usage: node summarize-forward-shadow-journal.mjs JOURNAL [RECEIPT] [OUTPUT_JSON]');
  const summary=await auditForwardJournal(filename,{receiptPath:receiptPath||undefined});
  if(destination)await writeFile(destination,JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
}

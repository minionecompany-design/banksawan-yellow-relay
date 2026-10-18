/**
 * YELLOW GOLD — passive proof recorder, RESEARCH ONLY.
 * No Binance, FCM, HOME, scanner imports or automatic I/O.
 * Only genuine LONG_A and contiguous, confirmed candle bars.
 */
export const TIMEFRAME_MS=Object.freeze({'1m':60_000,'5m':300_000,'15m':900_000,'1h':3_600_000});
export const CAPTURE_HORIZON_MS=4*60*60_000;
const WINDOW=5*60_000,RETENTION=7*24*60*60_000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const keys=['endMs','open','high','low','close','volume'];
const cloneBar=b=>Object.fromEntries(keys.map(k=>[k,b[k]]));
const cloneEvent=e=>({id:e.id,symbol:e.symbol,timeframe:e.timeframe,signal:'LONG_A',barClosedAtMs:e.barClosedAtMs,price:e.price});
const validBar=(b,p)=>b&&Number.isSafeInteger(b.endMs)&&b.endMs>0&&b.endMs%p===0&&keys.slice(1).every(k=>finite(b[k]))&&
 b.open>0&&b.high>0&&b.low>0&&b.close>0&&b.volume>=0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&b.high>=b.low;
const validEvent=e=>e&&e.signal==='LONG_A'&&Object.hasOwn(TIMEFRAME_MS,e.timeframe)&&
 /^[A-Z0-9]{2,25}USDT$/.test(e.symbol||'')&&Number.isSafeInteger(e.barClosedAtMs)&&e.barClosedAtMs>0&&
 e.barClosedAtMs%TIMEFRAME_MS[e.timeframe]===0&&e.id===e.symbol+':'+e.timeframe+':'+e.barClosedAtMs+':LONG_A'&&finite(e.price)&&e.price>0;
const lastCloseMatches=(e,b)=>Math.abs(b.close-e.price)<=Math.max(1e-10,e.price*1e-8);
export class QualityCaptureV1 {
 constructor({clock=()=>Date.now(),maxRecords=240,retentionMs=RETENTION}={}){
  if(typeof clock!=='function'||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>240||
   !Number.isSafeInteger(retentionMs)||retentionMs<CAPTURE_HORIZON_MS||retentionMs>30*24*60*60_000)
   throw Error('INVALID_CAPTURE_CONFIG');
  this.clock=clock;this.maxRecords=maxRecords;this.retentionMs=retentionMs;
  this.records=new Map();this.totals={accepted:0,rejected:0,duplicates:0,evicted:0,gaps:0};
 }
 #prune(){
  const now=this.clock();
  for(const [id,r] of this.records)if(now-r.capturedAtMs>this.retentionMs){this.records.delete(id);this.totals.evicted++;}
  while(this.records.size>this.maxRecords){this.records.delete(this.records.keys().next().value);this.totals.evicted++;}
 }
 acceptLongA(event,rawCandles){
  this.#prune();const now=this.clock();
  const reject=reason=>{this.totals.rejected++;return {accepted:false,reason};};
  if(!validEvent(event))return reject('INVALID_LONG_A');
  if(this.records.has(event.id)){this.totals.duplicates++;return {accepted:false,reason:'DUPLICATE'};}
  if(now<event.barClosedAtMs||now-event.barClosedAtMs>WINDOW)return reject('NOT_FRESH_LONG_A');
  if(!Array.isArray(rawCandles))return reject('HISTORY_UNAVAILABLE');
  const period=TIMEFRAME_MS[event.timeframe],end=event.barClosedAtMs;
  const bars=rawCandles.filter(b=>b&&Number.isSafeInteger(b.endMs)&&b.endMs<=end)
    .sort((a,b)=>a.endMs-b.endMs).slice(-61);
  if(bars.length!==61||bars.at(-1).endMs!==end)return reject('INSUFFICIENT_CLOSED_CANDLES');
  if(bars.some((b,i)=>!validBar(b,period)||b.endMs!==end-(60-i)*period))
   return reject('INVALID_OR_GAPPED_CANDLES');
  if(!lastCloseMatches(event,bars.at(-1)))return reject('EVENT_PRICE_MISMATCH');
  this.records.set(event.id,{event:cloneEvent(event),bars:bars.map(cloneBar),futureBars:[],
    capturedAtMs:now,captureStatus:'COLLECTING',captureIssue:null});
  this.totals.accepted++;this.#prune();return {accepted:true,reason:null};
 }
 acceptClosedBar(symbol,tf,bar){
  this.#prune();const period=TIMEFRAME_MS[tf];
  if(!period||!validBar(bar,period)||bar.endMs>this.clock())
   return {updated:0,rejectedReason:'INVALID_OR_OPEN_CANDLE'};
  let updated=0;
  for(const r of this.records.values()){
   if(r.event.symbol!==symbol||r.event.timeframe!==tf||r.captureStatus!=='COLLECTING')continue;
   const finish=r.event.barClosedAtMs+CAPTURE_HORIZON_MS;
   if(bar.endMs<=r.event.barClosedAtMs||bar.endMs>finish)continue;
   const next=r.event.barClosedAtMs+(r.futureBars.length+1)*period;
   if(bar.endMs<next)continue;
   if(bar.endMs!==next){r.captureStatus='GAPPED';r.captureIssue='MISSING_FUTURE_CANDLE';this.totals.gaps++;updated++;continue;}
   r.futureBars.push(cloneBar(bar));updated++;
   if(bar.endMs===finish)r.captureStatus='COMPLETE';
  }
  return {updated,rejectedReason:null};
 }
 restore(doc){
  if(this.records.size||!doc||doc.version!==1||doc.mode!=='RESEARCH_ONLY'||!Array.isArray(doc.records)||
     doc.records.length>this.maxRecords)throw Error('INVALID_CAPTURE_RESTORE_HEADER');
  const ready=new Map();
  for(const r of doc.records){
   const e=r?.event,p=TIMEFRAME_MS[e?.timeframe];
   if(!validEvent(e)||ready.has(e.id)||!Array.isArray(r.bars)||r.bars.length!==61||
      !Array.isArray(r.futureBars)||r.futureBars.length>CAPTURE_HORIZON_MS/p||
      !Number.isSafeInteger(r.capturedAtMs)||r.capturedAtMs<e.barClosedAtMs||
      r.capturedAtMs>e.barClosedAtMs+WINDOW||r.capturedAtMs>this.clock()||
      !['COLLECTING','COMPLETE','GAPPED'].includes(r.captureStatus)||
      (r.captureStatus==='GAPPED'&&r.captureIssue!=='MISSING_FUTURE_CANDLE')||
      (r.captureStatus!=='GAPPED'&&r.captureIssue!==null))
       throw Error('INVALID_CAPTURE_RESTORE_RECORD');
   if(r.bars.some((b,i)=>!validBar(b,p)||b.endMs!==e.barClosedAtMs-(60-i)*p)||
      !lastCloseMatches(e,r.bars.at(-1))||
      r.futureBars.some((b,i)=>!validBar(b,p)||b.endMs!==e.barClosedAtMs+(i+1)*p)||
      (r.captureStatus==='COMPLETE'&&r.futureBars.length!==CAPTURE_HORIZON_MS/p)||
      (r.captureStatus==='COLLECTING'&&r.futureBars.length===CAPTURE_HORIZON_MS/p))
       throw Error('INVALID_CAPTURE_RESTORE_CANDLES');
   ready.set(e.id,{event:cloneEvent(e),bars:r.bars.map(cloneBar),futureBars:r.futureBars.map(cloneBar),
     capturedAtMs:r.capturedAtMs,captureStatus:r.captureStatus,captureIssue:r.captureIssue});
  }
  this.records=ready;this.#prune();return {restored:this.records.size,expiredRemoved:ready.size-this.records.size};
 }
 snapshot(){
  this.#prune();return {version:1,mode:'RESEARCH_ONLY',maxRecords:this.maxRecords,totals:{...this.totals},
   records:[...this.records.values()].map(r=>({event:{...r.event},bars:r.bars.map(cloneBar),
    futureBars:r.futureBars.map(cloneBar),capturedAtMs:r.capturedAtMs,
    captureStatus:r.captureStatus,captureIssue:r.captureIssue}))};
 }
}

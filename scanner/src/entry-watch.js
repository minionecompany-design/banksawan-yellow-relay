/** Original research rules. Closed candles only; no orders/network/Pine changes.
 * A LONG A arms a six-hour watch, NOT an entry. At most one confirmed scenario
 * per original event; no hindsight low, replacement plan or second opportunity.
 */
import {ANALYSIS_FRAMES,ANALYSIS_KEYS,closedHistory,frameAnalysis,levelsAndPlan,
 validAnalysisBar,newPaperOutcome,advancePaperOutcome,validAnalysisEventId} from './analysis-companion.js';
export const WATCH_METHOD='YELLOW_PULLBACK_WATCH_V1';
const M=60_000,HORIZON=360*M;
const finite=x=>typeof x==='number'&&Number.isFinite(x),positive=x=>finite(x)&&x>0;
const terminal=new Set(['ENDED','DATA_GAP']);
export function newEntryWatch(event,at){
 return {schemaVersion:1,method:WATCH_METHOD,eventId:event.id,signalAtMs:event.barClosedAtMs,
  startedAtMs:at,watchUntilMs:event.barClosedAtMs+HORIZON,lastBarEndMs:Math.floor(at/M)*M,
  state:'WATCHING',reason:'MENUNGGU_PULLBACK',signalPrice:event.price,low:null,lowAtMs:null,
  pullbackSeen:false,checkedAtMs:at,confirmedAtMs:null,scenarioId:null,entryUntilMs:null,
  plan:null,frames:null,greenPublishedAtMs:null,paper:null,greenPaper:null};
}
export function validEntryWatch(w,eventId,now){
 if(!w||w.method!==WATCH_METHOD||w.schemaVersion!==1||w.eventId!==eventId||!validAnalysisEventId(eventId)||
  !['WATCHING','PULLBACK','CONFIRMED','ENDED','DATA_GAP'].includes(w.state)||
  !positive(w.signalPrice)||!Number.isSafeInteger(w.signalAtMs)||w.signalAtMs!==Number(eventId.split(':')[2])||
  w.watchUntilMs!==w.signalAtMs+HORIZON||!Number.isSafeInteger(w.startedAtMs)||
  w.startedAtMs<w.signalAtMs||w.startedAtMs>w.signalAtMs+300000||w.startedAtMs>now||
  !Number.isSafeInteger(w.lastBarEndMs)||w.lastBarEndMs%M||w.lastBarEndMs<w.signalAtMs||w.lastBarEndMs>now||
  !Number.isSafeInteger(w.checkedAtMs)||w.checkedAtMs>now||typeof w.pullbackSeen!=='boolean'||
  !/^[A-Z0-9_]{3,80}$/.test(w.reason||''))return false;
 if(w.low!==null&&(!positive(w.low)||!Number.isSafeInteger(w.lowAtMs)||w.lowAtMs>w.lastBarEndMs))return false;
 if(w.greenPublishedAtMs!==null&&(!Number.isSafeInteger(w.greenPublishedAtMs)||w.greenPublishedAtMs<w.confirmedAtMs||w.greenPublishedAtMs>now))return false;
 if(w.plan){const p=w.plan;
  if(!['referenceEntry','entryLow','entryHigh','stopLoss','tp1','tp2','tp3','riskPct'].every(k=>positive(p[k]))||
   !(p.stopLoss<p.entryLow&&p.entryLow<=p.referenceEntry&&p.referenceEntry<=p.entryHigh&&p.entryHigh<p.tp1&&p.tp1<p.tp2&&p.tp2<p.tp3)||
   (p.riskPct<.3||p.riskPct>5||!finite(p.roomToResistanceR)||p.roomToResistanceR<1.5)||
   !Number.isSafeInteger(w.confirmedAtMs)||w.confirmedAtMs<w.startedAtMs||w.confirmedAtMs>now||
   w.scenarioId!==eventId+':ENTRY:'+w.confirmedBarEndMs||w.entryUntilMs!==w.confirmedAtMs+3*M||!Array.isArray(w.frames)||w.frames.length!==4)return false;
 }else if(w.state==='CONFIRMED'||w.paper||w.greenPaper||w.greenPublishedAtMs!==null)return false;
 for(const p of [w.paper,w.greenPaper])if(p&&(!['WAITING_ENTRY','OPEN','NOT_ENTERED','INCOMPLETE_DATA','TP1_BEFORE_SL','SL_BEFORE_TP1','AMBIGUOUS','TIMEOUT'].includes(p.status)||
  !Number.isSafeInteger(p.entryAtMs)||p.deadlineMs!==p.entryAtMs+120*M||!finite(p.costBps)||p.costBps<0||p.costBps>1000||
  !Number.isSafeInteger(p.lastBarEndMs)||p.lastBarEndMs<p.entryAtMs||p.lastBarEndMs>p.deadlineMs||
  !Number.isSafeInteger(p.deadlineMs)||!(p.endedAtMs===null||Number.isSafeInteger(p.endedAtMs)&&p.endedAtMs<=now)||
  !['entryPrice','exitPrice'].every(k=>p[k]===null||positive(p[k]))||
  !['grossReturnPct','netReturnPct'].every(k=>p[k]===null||finite(p[k]))||
  (['OPEN','TP1_BEFORE_SL','SL_BEFORE_TP1','TIMEOUT'].includes(p.status)&&!positive(p.entryPrice))||
  (['TP1_BEFORE_SL','SL_BEFORE_TP1','TIMEOUT'].includes(p.status)&&(!positive(p.exitPrice)||!finite(p.netReturnPct)))))return false;
 return true;
}
export function advanceEntryWatch(previous,bar,snapshot,now){
 if(terminal.has(previous.state)&&![previous.paper,previous.greenPaper].some(p=>p&&['WAITING_ENTRY','OPEN'].includes(p.status)))return previous;
 if(!validAnalysisBar(bar)||bar.endMs>now||bar.endMs<=previous.lastBarEndMs)return previous;
 const w=structuredClone(previous);w.checkedAtMs=now;
 if(bar.endMs!==w.lastBarEndMs+M){
  w.state='DATA_GAP';w.reason='DATA_CANDLE_TERPUTUS';
  for(const k of ['paper','greenPaper'])if(w[k]&&['WAITING_ENTRY','OPEN'].includes(w[k].status))
   w[k]={...w[k],status:'INCOMPLETE_DATA',endedAtMs:now};
  w.lastBarEndMs=bar.endMs;return w;
 }
 w.lastBarEndMs=bar.endMs;
 for(const k of ['paper','greenPaper'])if(w[k])w[k]=advancePaperOutcome(w,w[k],bar);
 if(terminal.has(w.state))return w;
 if(w.state==='CONFIRMED'){
  w.currentFrames=ANALYSIS_FRAMES.map(tf=>frameAnalysis(closedHistory(snapshot?.[ANALYSIS_KEYS[tf]],tf,bar.endMs),tf));
  if(w.currentFrames.slice(2).some(f=>f.trend==='DOWN')||w.currentFrames[1].availability==='READY'&&
    (w.currentFrames[1].close<=w.currentFrames[1].ma7||w.currentFrames[1].ma7<w.currentFrames[1].ma25)){
   w.state='ENDED';w.reason='TREN_BESAR_BERUBAH';
   for(const key of ['paper','greenPaper'])if(w[key]?.status==='WAITING_ENTRY')w[key]={...w[key],status:'NOT_ENTERED',endedAtMs:now};
   return w;
  }
  if(w.paper&&!['WAITING_ENTRY','OPEN'].includes(w.paper.status)){
   w.state='ENDED';w.reason='SKENARIO_'+w.paper.status;
  }else if(now>=w.entryUntilMs){w.state='ENDED';w.reason='JENDELA_ENTRY_BERAKHIR';}
  return w;
 }
 if(now>=w.watchUntilMs){w.state='ENDED';w.reason='PEMANTAUAN_BERAKHIR';return w;}
 if(w.low===null||bar.low<w.low){w.low=bar.low;w.lowAtMs=bar.endMs;}
 const histories=Object.fromEntries(ANALYSIS_FRAMES.map(tf=>[tf,closedHistory(snapshot?.[ANALYSIS_KEYS[tf]],tf,bar.endMs)]));
 const frames=ANALYSIS_FRAMES.map(tf=>frameAnalysis(histories[tf],tf));w.frames=frames;
 if(frames.some(f=>f.availability!=='READY')){w.reason='DATA_EMPAT_TF_BELUM_LENGKAP';return w;}
 if(now-bar.endMs>90000){w.reason='CANDLE_KONFIRMASI_TERLAMBAT';return w;}
 const minute=frames[0],atr=minute.atr14;
 if(!positive(atr)){w.reason='ATR_BELUM_VALID';return w;}
 if(w.signalPrice-w.low<Math.max(w.signalPrice*.005,atr*.8)){w.reason='MENUNGGU_PULLBACK';return w;}
 w.pullbackSeen=true;w.state='PULLBACK';
 const bars=histories['1m'],last=bars.at(-1),prior=bars.slice(-4,-1);
 if(bar.endMs-w.lowAtMs<2*M||!bars.slice(-2).every(b=>b.low>w.low)||last.close<=Math.max(...prior.map(b=>b.high))||last.close<=minute.ma7||
  !finite(minute.relativeVolume)||minute.relativeVolume<1.2){w.reason='MENUNGGU_KONFIRMASI_PULIH';return w;}
 const five=frames[1];
 if(five.close<=five.ma7||five.ma7<five.ma25||frames.slice(2).some(f=>f.trend==='DOWN')){
  w.reason='TREN_PENDUKUNG_BELUM_SESUAI';return w;
 }
 const entry=last.close,stopLoss=w.low-atr*.25,risk=entry-stopLoss,riskPct=risk/entry*100;
 if(!positive(stopLoss)||riskPct<.3||riskPct>5){w.reason='JARAK_SL_TIDAK_SESUAI';return w;}
 const overhead=frames.slice(1).map(f=>levelsAndPlan(histories[f.timeframe],f,entry).levels.resistance).filter(positive);
 const resistance=overhead.length?Math.min(...overhead):null;
 if(resistance===null||(resistance-entry)/risk<1.5){w.reason='RUANG_RESISTANCE_BELUM_CUKUP';return w;}
 w.state='CONFIRMED';w.reason='PULLBACK_TERKONFIRMASI';w.confirmedAtMs=now;w.confirmedBarEndMs=bar.endMs;
 w.scenarioId=w.eventId+':ENTRY:'+bar.endMs;w.entryUntilMs=now+3*M;
 w.plan={referenceEntry:entry,entryLow:entry-atr*.1,entryHigh:entry+atr*.25,stopLoss,
  tp1:entry+risk,tp2:entry+2*risk,tp3:entry+3*risk,riskPct,roomToResistanceR:(resistance-entry)/risk};
 if(w.plan.entryLow<=stopLoss||w.plan.entryHigh>=w.plan.tp1){w.state='PULLBACK';w.plan=null;w.reason='ZONA_ENTRY_TIDAK_VALID';w.scenarioId=null;w.confirmedAtMs=null;w.entryUntilMs=null;return w;}
 w.currentFrames=structuredClone(w.frames);
 w.paper=newPaperOutcome({plan:w.plan,capturedAtMs:now});return w;
}
export function observeWatchQuote(w,ticker,now){
 if(w.state!=='CONFIRMED'||!freshQuote(ticker,now)||ticker.observedAtMs<w.confirmedAtMs)return false;
 if(ticker.lastPrice<=w.plan.stopLoss||ticker.lastPrice>=w.plan.tp1){
  w.state='ENDED';w.reason=ticker.lastPrice<=w.plan.stopLoss?'SL_TERSENTUH':'TP1_TERSENTUH';w.checkedAtMs=now;
  for(const key of ['paper','greenPaper'])if(w[key]?.status==='WAITING_ENTRY')w[key]={...w[key],status:'NOT_ENTERED',endedAtMs:now};
  return true;
 }return false;
}
export function freshQuote(t,now){return t&&positive(t.lastPrice)&&Number.isSafeInteger(t.observedAtMs)&&t.observedAtMs<=now+10000&&now-t.observedAtMs<30000;}
export function watchLight(w,ticker,now){
 const base={method:WATCH_METHOD,eventId:w.eventId,checkedAtMs:now,tickerPrice:ticker?.lastPrice??null,tickerAtMs:ticker?.observedAtMs??null};
 const out=(status,reason)=>({...base,status,reason});
 if(terminal.has(w.state))return out('OFF',w.reason);
 if(w.state!=='CONFIRMED')return now>=w.watchUntilMs?out('OFF','PEMANTAUAN_BERAKHIR'):out('YELLOW',w.reason);
 if(now>=w.entryUntilMs)return out('OFF','JENDELA_ENTRY_BERAKHIR');
 if(w.currentFrames?.some(f=>f.availability!=='READY'))return out('YELLOW','DATA_EMPAT_TF_BELUM_LENGKAP');
 if(now-w.lastBarEndMs>=90000)return out('YELLOW','KONTEKS_CANDLE_TIDAK_SEGAR');
 if(!freshQuote(ticker,now))return out('YELLOW','HARGA_LIVE_TIDAK_SEGAR');
 if(ticker.lastPrice<=w.plan.stopLoss||ticker.lastPrice>=w.plan.tp1)return out('OFF','BATAS_SKENARIO_TERSENTUH');
 if(ticker.lastPrice<w.plan.entryLow||ticker.lastPrice>w.plan.entryHigh)return out('YELLOW','DI_LUAR_ZONA_ENTRY');
 return out('GREEN','PULLBACK_TERKONFIRMASI');
}
export function publishGreen(w,ticker,now){
 if(w.greenPublishedAtMs!==null||watchLight(w,ticker,now).status!=='GREEN')return false;
 w.greenPublishedAtMs=now;w.greenPaper=newPaperOutcome({plan:w.plan,capturedAtMs:now});return true;
}

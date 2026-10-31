/** Bounded, fire-and-forget worker bridge. Never awaited by scanner/FCM. */
import {Worker} from 'node:worker_threads';
import path from 'node:path';
export class V16ObservationBridge {
 constructor({dataDir,clock=()=>Date.now(),WorkerClass=Worker}={}){
  this.clock=clock;this.pending=0;this.active=new Map();this.enabled=true;this.ready=false;
  try{
   this.worker=new WorkerClass(new URL('./v16-observation-worker.js',import.meta.url),{workerData:{directory:path.join(dataDir,'v16-forward'),startedAtMs:clock()},resourceLimits:{maxOldGenerationSizeMb:128}});
   this.worker.unref();
   this.timer=setInterval(()=>this.post({type:'TICK'}),1000);this.timer.unref();
   this.worker.on('message',m=>{if(m.ready)this.ready=true;if(m.ack)this.pending=Math.max(0,this.pending-m.ack);if(m.durable)this.durable=m.durable;if(m.closed){clearTimeout(this.closeTimer);this.worker.unref();}if(m.failed)this.fail();});
   this.worker.on('error',()=>this.fail());this.worker.on('exit',()=>{this.enabled=false;clearInterval(this.timer);clearTimeout(this.closeTimer);});
  }catch{this.enabled=false;}
 }
 fail(){clearTimeout(this.closeTimer);this.enabled=false;clearInterval(this.timer);this.active.clear();void this.worker?.terminate();}
 post(x){
  if(!this.enabled)return false;
  if(this.pending>=256){this.fail();return false;}
  try{this.worker.postMessage({...x,at:this.clock()});this.pending++;return true;}catch{this.fail();return false;}
 }
 prune(){const now=this.clock();for(const [id,r] of this.active)if(now>r.until)this.active.delete(id);}
 capture(event,snapshot){
  this.prune();
  if(event?.timeframe!=='1m'||event.signal!=='LONG_A'||this.active.has(event.id))return;
  if(this.active.size>=100){this.fail();return;}
  if(this.post({type:'START',event,snapshot}))this.active.set(event.id,{symbol:event.symbol,until:event.barClosedAtMs+120*60000+90000});
 }
 watches(symbol){this.prune();return [...this.active.values()].some(r=>r.symbol===symbol);}
 onTicker(symbol,ticker){if(this.watches(symbol))this.post({type:'TICKER',symbol,ticker});}
 onBar(symbol,timeframe,bar){if(timeframe==='1m'&&this.watches(symbol))this.post({type:'BAR',symbol,bar});}
 onDecisionBar(symbol,bar,snapshot){if(this.watches(symbol))this.post({type:'DECISION_BAR',symbol,bar,snapshot});}
 gap(reason){if(this.active.size)this.post({type:'GAP',reason});}
 status(){return {enabled:this.enabled,ready:this.ready,pending:this.pending,active:this.active.size,durable:this.durable??null};}
 close(){clearInterval(this.timer);if(this.enabled){this.worker.ref?.();this.post({type:'CLOSE'});this.closeTimer=setTimeout(()=>this.fail(),3000);this.closeTimer.unref();}}
}

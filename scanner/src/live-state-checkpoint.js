/** Persist only proven lane states. Never replay historical alerts or invent
 * historical 24h tickers. A lane resumes only at the identical closed candle. */
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {newParallelState,PERIODS} from './parallel-long-a.js';
import {validPineOneMinuteState} from './pine-v13-one-minute.js';
const revision='long-a-v1-causal-realtime';
const validSymbol=s=>/^[A-Z0-9]{1,25}USDT$/.test(s);
function valid(s,tf,now){
  return s && [0,1,2].includes(s.tradeState) &&
    (tf!=='1m'||s.pine1m===undefined||validPineOneMinuteState(s)) &&
    ['index','countDown','countUp'].every(k=>Number.isSafeInteger(s[k])&&s[k]>= (k==='index'?-1:0)) &&
    ['lastPullbackBar','protectBar'].every(k=>s[k]===null||Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=s.index) &&
    Number.isSafeInteger(s.lastProcessedEndMs)&&s.lastProcessedEndMs>0&&
    s.lastProcessedEndMs<=now&&s.lastProcessedEndMs%PERIODS[tf]===0;
}
export class LaneCheckpoint {
  constructor(directory){this.directory=directory;this.chain=Promise.resolve();}
  filename(symbol){if(!validSymbol(symbol))throw Error('INVALID_CHECKPOINT_SYMBOL');return path.join(this.directory,symbol+'.json');}
  async save(symbol,states,now){
    const filename=this.filename(symbol);
    if(!Object.keys(PERIODS).every(tf=>valid(states[tf],tf,now)))throw Error('INVALID_CHECKPOINT_STATE');
    const content=JSON.stringify({version:1,revision,symbol,savedAtMs:now,states});
    const job=this.chain.then(async()=>{await mkdir(this.directory,{recursive:true});
      const tmp=filename+'.tmp';await writeFile(tmp,content);await rename(tmp,filename);});
    this.chain=job.catch(()=>{});return job;
  }
  async restore(symbol,book,now){
    await this.chain;
    const states=newParallelState(),resumed=[],cold=[];
    let doc;
    try{doc=JSON.parse(await readFile(this.filename(symbol),'utf8'));}
    catch(e){if(e.code!=='ENOENT')throw Error('CHECKPOINT_UNREADABLE');}
    if(doc&&(doc.version!==1||doc.revision!==revision||doc.symbol!==symbol||
      !Number.isSafeInteger(doc.savedAtMs)||doc.savedAtMs>now||
      !Object.keys(PERIODS).every(tf=>valid(doc.states?.[tf],tf,doc.savedAtMs))))
      throw Error('CHECKPOINT_INVALID');
    for(const tf of Object.keys(PERIODS)){
      const end=book.latest(tf).endMs;
      if(doc&&doc.states[tf].lastProcessedEndMs===end){states[tf]={...doc.states[tf]};resumed.push(tf);}
      else {states[tf].lastProcessedEndMs=end;cold.push(tf);}
    }
    return {states,resumed,cold,previousOneMinute:doc&&validPineOneMinuteState(doc.states['1m'])?doc.states['1m']:null};
  }
}

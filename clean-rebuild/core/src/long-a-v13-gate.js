/** Pure Pine v1.3 LONG A gate on CONFIRMED, AS-OF timeframe metrics.
 * Caller supplies own timeframe metrics and confirmed MTF snapshots, no lookahead.
 * Persistent pullback/countDown is retained by caller per lane. */
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const gt=(a,b)=>finite(a)&&finite(b)&&a>b;
const ge=(a,b)=>finite(a)&&finite(b)&&a>=b;
export function longAFromConfirmed({one,five,fifteen,hour,pullbackWindowActive}={}){
 if(![one,five,fifteen,hour].every(x=>x&&typeof x==='object'))return {ready:false,longA:false,reason:'MISSING_CONFIRMED_MTF'};
 const required=[one.close,one.ma7,one.ma25,one.ma99,one.rsi,one.rsiAvg,one.volRatio,
   five.close,five.ma7,five.ma25,five.rsi,five.rsiAvg,
   fifteen.close,fifteen.ma7,fifteen.ma25,fifteen.ma99,fifteen.rsi,
   hour.close,hour.ma7,hour.ma25,hour.ma99,hour.rsi];
 if(!required.every(finite)||one.ma7<=0)return {ready:false,longA:false,reason:'UNWARMED_OR_INVALID_METRICS'};
 const h=gt(hour.close,hour.ma99)&&ge(hour.ma7,hour.ma25)&&ge(hour.rsi,48);
 const f15=gt(fifteen.close,fifteen.ma99)&&ge(fifteen.ma7,fifteen.ma25)&&ge(fifteen.rsi,48);
 const f5=gt(five.close,five.ma7)&&gt(five.close,five.ma25)&&ge(five.ma7,five.ma25)&&
   gt(five.rsi,50)&&ge(five.rsi,five.rsiAvg);
 const distance=Math.abs(one.close-one.ma7)/one.ma7*100;
 const entry=gt(one.close,one.ma7)&&gt(one.close,one.ma25)&&gt(one.close,one.ma99)&&
  gt(one.ma7,one.ma25)&&gt(one.rsi,50)&&gt(one.rsi,one.rsiAvg)&&one.rsi<75&&
  one.volRatio>=0.75&&distance<=2.5&&one.close<10;
 return {ready:true,longA:pullbackWindowActive===true&&h&&f15&&f5&&entry,
   diagnostics:{hour:h,fifteen:f15,five:f5,entry,pullback:pullbackWindowActive===true}};
}
export class PullbackWindow{
 constructor(){this.index=-1;this.countDown=0;this.pullbackAt=null;this.lastClose=[];}
 update(close){
  if(!finite(close)||close<=0)throw Error('INVALID_CLOSE');
  this.index++;
  const fourAgo=this.lastClose.length===4?this.lastClose[0]:null;
  this.countDown=fourAgo!==null&&close<fourAgo?this.countDown+1:0;
  if([9,13,14,15,16].includes(this.countDown))this.pullbackAt=this.index;
  this.lastClose.push(close);if(this.lastClose.length>4)this.lastClose.shift();
  return this.pullbackAt!==null&&this.index-this.pullbackAt<=30;
 }
}

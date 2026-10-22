import {fcmLongAData} from './fcm-payload.js';
import {tradingViewUrl} from './api-view.js';

const PERMANENT=new Set(['UNREGISTERED','INVALID_RECIPIENT',
 'messaging/registration-token-not-registered',
 'messaging/invalid-registration-token']);
const CAPPED_RETRY_MS=3600_000;
export function retryDelayMs(attempts){
 if(!Number.isSafeInteger(attempts)||attempts<1)throw Error('INVALID_RETRY_ATTEMPT');
 return Math.min(CAPPED_RETRY_MS,Math.pow(2,Math.min(attempts-1,11))*10_000);
}
/** One offline-testable FCM delivery step, without Firebase SDK or network.
 * Requires an EXPLICIT injected transport + opt-in. Default is disabled.
 * NEVER infer that provider success is proof the phone displayed a notification.
 * A single target only: per-recipient durable fanout is pending.
 */
export async function dispatchOne({
 outbox,transport,recipient,nowMs,enabled=false,maxAttempts=5,
 maxEventAgeMs=7_200_000
}={}){
 if(enabled!==true)return {status:'DISABLED'};
 if(typeof transport?.send!=='function'||typeof recipient!=='string'||
    recipient.length<6||recipient.length>4096||
    !Number.isSafeInteger(nowMs)||nowMs<=0||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>20||
    !Number.isSafeInteger(maxEventAgeMs)||maxEventAgeMs<60_000||maxEventAgeMs>86_400_000)
  throw Error('INVALID_FCM_DISPATCH_CONFIG');
 const row=await outbox.claim(nowMs);
 if(!row)return {status:'QUEUE_EMPTY'};
 if(row.barClosedAtMs>nowMs+5000||nowMs-row.barClosedAtMs>maxEventAgeMs){
  await outbox.fail(row.id,row.leaseToken,'EVENT_EXPIRED');
  return {status:'FAILED',reason:'EVENT_EXPIRED',eventId:row.id};
 }
 const data=fcmLongAData(row);
 if(data.tradingViewUrl!==tradingViewUrl(row.symbol))
  throw Error('CHART_IDENTITY_BROKEN');
 try{
  const result=await transport.send({recipient,data});
  if(typeof result?.messageId!=='string'||result.messageId.length===0||
     result.messageId.length>256)throw Object.assign(Error('INVALID_PROVIDER_ACK'),{code:'INVALID_PROVIDER_ACK'});
  const committed=await outbox.ack(row.id,row.leaseToken,result.messageId);
  if(!committed)throw Error('LOST_OUTBOX_LEASE');
  return {status:'PROVIDER_ACCEPTED',eventId:row.id,displayConfirmed:false};
 }catch(error){
  const permanent=PERMANENT.has(error?.code),exhausted=row.attempts>=maxAttempts;
  if(permanent||exhausted){
   const reason=permanent?'INVALID_RECIPIENT':'RETRIES_EXHAUSTED';
   await outbox.fail(row.id,row.leaseToken,reason);
   return {status:'FAILED',reason,eventId:row.id};
  }
  const delay=retryDelayMs(row.attempts);
  await outbox.retry(row.id,row.leaseToken,nowMs,delay);
  return {status:'RETRY_SCHEDULED',eventId:row.id,retryAfterMs:delay};
 }
}

/** Independent YELLOW FCM HTTP v1. No BR Firebase project or credentials.
 * Optional and strictly off by default. Asynchronous best effort: signals must
 * already be persisted before this module is invoked. No shared BR topic.
 */
import {eligibleEvent} from './product-policy.js';
import {createSign} from 'node:crypto';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const scope='https://www.googleapis.com/auth/firebase.messaging';
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const allowed=/^[A-Z0-9]{2,25}USDT$/;
export class YellowFcm {
  constructor({serviceAccountJson='',enabled=false,fetchImpl=globalThis.fetch,clock=()=>Date.now(),
     topic='banksawan-yellow-v2'}={}){
    this.enabled=enabled;this.fetchImpl=fetchImpl;this.clock=clock;this.topic=topic;
    this.token=null;this.tokenExpiryMs=0;this.attempted=0;this.sent=0;this.failed=0;
    if(enabled){
      if(!serviceAccountJson)throw new Error('FCM_CREDENTIALS_REQUIRED');
      try{this.account=JSON.parse(serviceAccountJson);}catch{throw new Error('INVALID_FCM_CREDENTIAL_JSON');}
      if(!this.account.client_email||!this.account.private_key||!this.account.project_id)
        throw new Error('FCM_ACCOUNT_FIELDS_REQUIRED');
    }
  }
  async getToken(){
    if(this.token&&this.tokenExpiryMs>this.clock()+60_000)return this.token;
    const now=Math.floor(this.clock()/1000);
    const jwtData=`${b64({alg:'RS256',typ:'JWT'})}.${b64({iss:this.account.client_email,sub:this.account.client_email,
      scope,aud:TOKEN_URL,iat:now,exp:now+3600})}`;
    const signer=createSign('RSA-SHA256');signer.update(jwtData);signer.end();
    const jwt=jwtData+'.'+signer.sign(this.account.private_key,'base64url');
    const res=await this.fetchImpl(TOKEN_URL,{method:'POST',signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
    if(!res.ok)throw new Error('FCM_OAUTH_FAILED_HTTP_'+res.status);
    const response=await res.json();if(!response.access_token||!Number.isFinite(Number(response.expires_in)))
      throw new Error('FCM_INVALID_OAUTH_RESPONSE');
    this.token=response.access_token;this.tokenExpiryMs=this.clock()+Math.min(3600,Number(response.expires_in))*1000;
    return this.token;
  }
  async send(record){
    if(!this.enabled)return {sent:false,reason:'FCM_DISABLED'};
    this.attempted++;
    if(!eligibleEvent(record)||record.signal!=='LONG_A'||record.id!==`${record.symbol}:${record.timeframe}:${record.barClosedAtMs}:LONG_A`||!allowed.test(record.symbol||'')||!['5m','15m','1h'].includes(record.timeframe)||
       !Number.isFinite(record.expiresAtMs)||record.expiresAtMs<=this.clock())
      return {sent:false,reason:'EVENT_NOT_DELIVERABLE'};
    try{
      const token=await this.getToken();
      const leftMs=record.expiresAtMs-this.clock();if(leftMs<=0)return {sent:false,reason:'EXPIRED'};
      const url=`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.project_id)}/messages:send`;
      const msg={message:{topic:this.topic,
        data:{event:'YELLOW_LONG_A',event_id:String(record.id),symbol:record.symbol,
          timeframe:record.timeframe,price:String(record.price),
          binance_change:String(record.binance24hChangePct),quote_volume_24h:String(record.quoteVolume24h),
          bar_closed_at_ms:String(record.barClosedAtMs),
          expires_at_ms:String(record.expiresAtMs)},
        android:{priority:'HIGH',ttl:Math.max(1,Math.floor(leftMs/1000))+'s'}}};
      const response=await this.fetchImpl(url,{method:'POST',signal:AbortSignal.timeout(8000),
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(msg)});
      if(!response.ok)throw new Error('FCM_SEND_HTTP_'+response.status);
      this.sent++;return {sent:true};
    }catch(e){this.failed++;return {sent:false,reason:String(e.message||e)};}
  }
  metrics(){return {enabled:this.enabled,attempted:this.attempted,sent:this.sent,failed:this.failed};}
}

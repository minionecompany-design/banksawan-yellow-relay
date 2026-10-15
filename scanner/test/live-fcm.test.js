import test from 'node:test';import assert from 'node:assert/strict';
import {YellowFcm} from '../src/live-fcm.js';
test('FCM stays off with no credentials and performs zero HTTP requests',async()=>{
 let calls=0;const fcm=new YellowFcm({fetchImpl:async()=>{calls++;throw new Error('Unexpected request');}});
 assert.deepEqual(await fcm.send({id:'anything'}),{sent:false,reason:'FCM_DISABLED'});
 assert.equal(calls,0);assert.equal(fcm.metrics().sent,0);
});
test('opt-in FCM never starts without a complete service account',()=>{
 assert.throws(()=>new YellowFcm({enabled:true}),/FCM_CREDENTIALS_REQUIRED/);
 assert.throws(()=>new YellowFcm({enabled:true,serviceAccountJson:'{}'}),/FCM_ACCOUNT_FIELDS_REQUIRED/);
});
import {generateKeyPairSync} from 'node:crypto';
test('FCM emits data-only LONG A push with bounded TTL; no other symbols',async()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const account={project_id:'test-yellow-project',client_email:'sample@sample.iam.gserviceaccount.com',
   private_key:privateKey.export({format:'pem',type:'pkcs8'}).toString()};
 const now=Date.UTC(2026,9,15,12),calls=[];
 const sender=async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes('oauth2.googleapis.com'))return {ok:true,status:200,json:async()=>({access_token:'test-token',expires_in:3500})};
  return {ok:true,status:200,json:async()=>({name:'projects/test/messages/123'})};
 };
 const fcm=new YellowFcm({enabled:true,serviceAccountJson:JSON.stringify(account),fetchImpl:sender,clock:()=>now});
 const event={id:`WALUSDT:15m:${now}:LONG_A`,symbol:'WALUSDT',timeframe:'15m',
   barClosedAtMs:now,expiresAtMs:now+299000,price:.051,binance24hChangePct:5.8};
 assert.equal((await fcm.send(event)).sent,true);
 assert.equal(calls.length,2);
 const payload=JSON.parse(calls[1].opts.body);
 assert.equal(payload.message.topic,'banksawan-yellow-v2');
 assert.equal(payload.message.data.event,'YELLOW_LONG_A');
 assert.ok(parseInt(payload.message.android.ttl)<=299);
 assert.equal((await fcm.send({...event,expiresAtMs:now-1})).sent,false);
 assert.equal(calls.length,2);
});

/** Entrypoint is NOT invoked by npm test, npm run demo, or existing Railway.
 *  YELLOW_LIVE_ENABLED=true + persistent YELLOW_DATA_DIR required explicitly.
 *  No Firebase/entry-ready notifications until parity and mobile acceptance.
 */
import {YellowLiveMarket} from './live-market.js';
import {createLiveApi} from './live-api.js';
import {YellowFcm} from './live-fcm.js';
const enabled=process.env.YELLOW_LIVE_ENABLED==='true';
const dataDir=process.env.YELLOW_DATA_DIR;
const port=Number(process.env.PORT||8080);
if(!enabled)throw new Error('LIVE_DISABLED: YELLOW_LIVE_ENABLED must explicitly be true');
if(!dataDir)throw new Error('YELLOW_DATA_DIR_REQUIRED: mount a persistent Railway volume');
if(!Number.isInteger(port)||port<=0||port>65535)throw new Error('INVALID_PORT');
const fcm=new YellowFcm({enabled:process.env.YELLOW_FCM_ENABLED==='true',
  serviceAccountJson:process.env.YELLOW_FCM_SERVICE_ACCOUNT_JSON||''});
const market=new YellowLiveMarket({dataDir,maxTracked:Number(process.env.YELLOW_MAX_TRACKED||24),
  sendEvent:async event=>{
    const delivery=await fcm.send(event);
    if(fcm.enabled)console.log('YELLOW_FCM',event.id,delivery.sent?'SENT':delivery.reason);
  }});
market.fcm=fcm;
const server=createLiveApi(market);
server.listen(port,'0.0.0.0',()=>console.log('YELLOW LIVE SHADOW API active on port',port));
process.on('SIGTERM',()=>{market.stop();server.close();});
try{await market.start();}catch(e){console.error('YELLOW LIVE STARTUP FAILED:',e.message);server.close();process.exitCode=1;}

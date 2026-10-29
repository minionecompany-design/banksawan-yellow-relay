/** Entrypoint is NOT invoked by npm test, npm run demo, or existing Railway.
 *  YELLOW_LIVE_ENABLED=true + persistent YELLOW_DATA_DIR required explicitly.
 *  No Firebase/entry-ready notifications until parity and mobile acceptance.
 */
import {YellowLiveMarket} from './live-market.js';
import {createLiveApi} from './live-api.js';
import {YellowFcm} from './live-fcm.js';
import {QualityCaptureBridgeV1} from './quality-capture-bridge-v1.js';
import {AnalysisCompanionBridge} from './analysis-companion-bridge.js';
import {YellowV16WatchMonitor} from './yellow-v16-watch-monitor.js';
const enabled=process.env.YELLOW_LIVE_ENABLED==='true';
const dataDir=process.env.YELLOW_DATA_DIR;
const port=Number(process.env.PORT||8080);
if(!enabled)throw new Error('LIVE_DISABLED: YELLOW_LIVE_ENABLED must explicitly be true');
if(!dataDir)throw new Error('YELLOW_DATA_DIR_REQUIRED: mount a persistent Railway volume');
if(!Number.isInteger(port)||port<=0||port>65535)throw new Error('INVALID_PORT');
const fcm=new YellowFcm({enabled:process.env.YELLOW_FCM_ENABLED==='true',
  serviceAccountJson:process.env.YELLOW_FCM_SERVICE_ACCOUNT_JSON||''});
// Explicit opt-in only. Research errors never interfere with HOME or FCM.
// No existing Railway environment has this enabled by default.
const research=process.env.YELLOW_GOLD_EVIDENCE_ENABLED==='true'
  ?new QualityCaptureBridgeV1({dataDir,log:(...args)=>console.warn(...args)}):null;
if(research)await research.initialize();
// New analysis is disabled unless explicitly opted in. No extra data feed.
const analysis=process.env.YELLOW_ANALYSIS_ENABLED==='true'
  ?new AnalysisCompanionBridge({dataDir,log:(...args)=>console.warn(...args)}):null;
if(analysis)await analysis.initialize();
// V16 deliberately off unless operator enables it after production review.
// Shares EXISTING native candles and tickers; no Binance/API connections added.
const monitor1m=process.env.YELLOW_V16_WATCH_ONLY_ENABLED==='true'
  ?new YellowV16WatchMonitor():null;
const market=new YellowLiveMarket({dataDir,maxTracked:Number(process.env.YELLOW_MAX_TRACKED||50),
  passiveEvidence:research,
  analysisCompanion:analysis,
  monitor1m,
  sendEvent:async event=>{
    const delivery=await fcm.send(event);
    if(fcm.enabled)console.log('YELLOW_FCM',event.id,delivery.sent?'SENT':delivery.reason);
  }});
market.fcm=fcm;
const server=createLiveApi(market);
// On 418/429/451, WS failure or dead feed, stop the process instead of
// leaving an idle billable Railway container marked alive. Restart=NEVER.
const haltWatch=setInterval(()=>{if(!market.isHalted)return;
  console.error('YELLOW_STOPPED_FAIL_CLOSED',market.haltReason);
  clearInterval(haltWatch);server.close(()=>{process.exitCode=1;});
},5000);
server.listen(port,'0.0.0.0',()=>console.log('YELLOW LIVE SHADOW API active on port',port));
process.on('SIGTERM',()=>{clearInterval(haltWatch);market.stop();void analysis?.flush();server.close();});
try{await market.start();}catch(e){console.error('YELLOW LIVE STARTUP FAILED:',e.message);
  clearInterval(haltWatch);server.close(()=>{process.exitCode=1;});}

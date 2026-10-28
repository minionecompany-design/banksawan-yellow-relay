#!/usr/bin/env node
/** Offline audit of all saved events (no winner cherry-picking or live quote reconstruction).
 * Output stdout JSON, or redirect to a .json file in CI.
 */
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {replaySecondSignalCase} from './lib/replay-second-signal-1m.mjs';
const [manifestFile]=process.argv.slice(2);
if(!manifestFile)throw Error('Usage: node compare-second-signal-1m.mjs <saved-manifest.json>');
const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
if(!Array.isArray(manifest.cases)||manifest.cases.length>500)throw Error('INVALID_MANIFEST');
const cases=[],ids=new Set();
for(const c of manifest.cases){
 if(ids.has(c.event.id))throw Error('DUPLICATE_EVENT');
 ids.add(c.event.id);
 const bytes=await readFile(resolve(dirname(manifestFile),c.candlesFile));
 const raw=c.candlesFile.endsWith('.gz')?gunzipSync(bytes):bytes;
 const hash=createHash('sha256').update(raw).digest('hex');
 if(hash!==c.candlesSha256)throw Error('CANDLE_HASH_MISMATCH');
 cases.push({...replaySecondSignalCase(JSON.parse(raw),c.event),sourceSha256:hash});
}
const inScope=cases.filter(x=>x.scope==='LONG_A_1M_ONLY');
const excluded=cases.filter(x=>x.scope==='OUT_OF_SCOPE_NON_1M');
const total=k=>inScope.reduce((n,x)=>n+(x.colorsByClosedMinute[k]||0),0);
const redCases=inScope.filter(x=>x.firstRed);
const finished=inScope.filter(x=>x.completeSixHourWindow);
const censored=inScope.filter(x=>!x.completeSixHourWindow);
const missingAtA=inScope.filter(x=>x.chg24hAtA===null);
const stronger=inScope.filter(x=>x.maxFavorableFromAPct>=20);
const redAndStrong=stronger.filter(x=>x.firstRed);
const redAndRecovered=redCases.filter(x=>x.afterFirstRed?.subsequentHighAboveRedClosePct>=10);
const withCandles=inScope.filter(x=>x.candlesEvaluated>0);
const confirmed=inScope.filter(x=>x.v3CandleConfirmation);
const transitions=inScope.map(x=>x.transitions.length).reduce((a,b)=>a+b,0);
const summary={
  mode:'OFFLINE_ARCHIVED_CANDLES_ONLY_NO_LIVE_ENTRY',
  sourceCases:cases.length,oneMinuteCases:inScope.length,excludedNon1m:excluded.length,
  excludedByTf:excluded.reduce((s,x)=>(s[x.timeframe]=(s[x.timeframe]||0)+1,s),{}),
  missingCases:manifest.missingCases||[],
  sixHourComplete:finished.length,windowCensored:censored.length,
  withAnyPostSignalCandle:withCandles.length,
  frozen24hPercentAtASourceMissing:missingAtA.length,
  colorsByClosedMinute:{YELLOW:total('YELLOW'),RED:total('RED'),GREEN:total('GREEN'),OFF:total('OFF')},
  statusTransitions:transitions,redEvents:redCases.length,
  redThenGainTenPctFromRedClose:redAndRecovered.length,
  roseTwentyPctAboveLongA:stronger.length,
  roseTwentyPctWithAnyEarlierRed:redAndStrong.length,
  v3CandleConfirmations:confirmed.length,
  v3Paths:confirmed.reduce((s,x)=>(s[x.v3CandleConfirmation.path]=(s[x.v3CandleConfirmation.path]||0)+1,s),{}),
  historicalGreenEligibility:'UNAVAILABLE_WITHOUT_TIME_STAMPED_TICKER_AND_QUOTE_VOLUME',
  percentSinceA:'AVAILABLE_FROM_CLOSED_CANDLE_NOT_LIVE_TICKER',
  recordsWithRedThen10Pct: redAndRecovered.map(x=>x.eventId),
  recordsRose20Pct:stronger.map(x=>({eventId:x.eventId,mfePct:x.maxFavorableFromAPct,red:x.firstRed!==null})),
  caveats:[
    'IN_SAMPLE_ARCHIVED_CASES_NOT_PROSPECTIVE_VALIDATION',
    'MFE_MAE_ONLY_WITHIN_RETAINED_CANDLE_WINDOWS',
    'MISSING_24H_CHG_AT_A_IN_CANDLE_MANIFEST',
    'NO_HISTORICAL_GREEN_WITHOUT_ELIGIBLE_QUOTE',
    'CANDLES_ONLY_CANNOT_MEASURE_DEVICE_FCM_DELIVERY_OR_FILLED_ORDERS',
    'NATIVE_HIGHER_TF_CLOSE_TIME_ASSUMED_AS_AVAILABLE_AT_BAR_CLOSE',
    'RED_IS_CURRENT_RISK_NOT_FORECAST_OF_NO_FUTURE_RECOVERY',
    'GAPS_AND_CENSORED_WINDOWS_NOT_CLASSIFIED_AS_FAILURES',
    'SAME_SYMBOL_MARKET_EPISODES_CAN_BE_CORRELATED'
  ]
};
console.log(JSON.stringify({summary,cases},null,2));

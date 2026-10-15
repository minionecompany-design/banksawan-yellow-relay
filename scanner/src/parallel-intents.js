/**
 * OFFLINE notification-intent preparation only. No Firebase/network calls.
 * Every fresh LONG_A event in any of the four parallel TF lanes is eligible
 * for one delivery intent, even when HOME already contains that symbol.
 * The UI keeps one 24h HOME card per symbol from first detection.
 * Production requires durable transactional dedupe across FCM + polling.
 */
import {addToHome,getActiveHome} from './long-a.js';
const MAX_EVENT_AGE_MS=5*60_000;
export function newIntentState() {return {home:[],claimedEventIds:new Set()};}
export function routeParallelIntents(events,atMs,state=newIntentState()) {
  const active=getActiveHome(state.home,atMs),next={home:active,claimedEventIds:new Set(state.claimedEventIds)};
  const notificationIntents=[],rejected=[];
  for(const event of events||[]) {
    if(!event||event.signal!=='LONG_A'||!['1m','5m','15m','1h'].includes(event.timeframe)||
       typeof event.id!=='string'||!event.id ||!Number.isFinite(event.barClosedAtMs)){
      rejected.push({eventId:event?.id||null,reason:'NOT_LONG_A_OR_INVALID_EVENT'});continue;
    }
    if(next.claimedEventIds.has(event.id)){
      rejected.push({eventId:event.id,reason:'EVENT_ALREADY_CLAIMED'});continue;
    }
    if(!Number.isFinite(atMs)||atMs<event.barClosedAtMs||
      atMs-event.barClosedAtMs>MAX_EVENT_AGE_MS){
      rejected.push({eventId:event.id,reason:'EXPIRED_OR_FUTURE_EVENT'});continue;
    }
    next.claimedEventIds.add(event.id);
    next.home=addToHome(next.home,event,atMs);
    notificationIntents.push({eventId:event.id,symbol:event.symbol,timeframe:event.timeframe,
      signal:'LONG_A',barClosedAtMs:event.barClosedAtMs,expiresAtMs:event.barClosedAtMs+MAX_EVENT_AGE_MS,
      status:'OFFLINE_INTENT_ONLY'});
  }
  return {state:next,notificationIntents,rejected};
}

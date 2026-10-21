/** LAB HOME contract for a future explicitly authorized live publisher.
 * This function does not enable publishing or notifications by itself.
 */
export const LAB_HOME_TTL_MS=10*60*60_000;
export const LAB_HOME_MAX_CARDS=12;
const SYMBOL=/^[A-Z0-9]{2,25}USDT$/;
export function createHomeCard(event,nowMs){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0 || !event || !SYMBOL.test(event.symbol||''))return null;
  const tf=event.timeframe, signal=event.signal, ordinal=event.bOrdinal;
  if(!(tf==='1m'&&signal==='LONG_B'&&(ordinal===1||ordinal===2)) &&
     !(tf==='1h'&&signal==='LONG_A'))return null;
  const at=event.barClosedAtMs,price=event.price;
  if(!Number.isSafeInteger(at)||at<=0||at>nowMs||nowMs-at>=LAB_HOME_TTL_MS ||
     typeof price!=='number'||!Number.isFinite(price)||price<=0||price>=10)return null;
  if(event.confirmedClosedBar!==true||event.causalVerified!==true||event.eligibleAsOf!==true)return null;
  if(tf==='1m'&&(event.fromFirstA!==true||event.protectVerified!==true||
      event.qualityPassed!==true||event.episodeAtMs===undefined||
      !Number.isSafeInteger(event.episodeAtMs)||event.episodeAtMs>=at||
      at-event.episodeAtMs>120*60_000))return null;
  const id=event.id;
  if(id!==`${event.symbol}:${tf}:${at}:${signal}`)return null;
  return {id,symbol:event.symbol,timeframe:tf,signal,
    ...(tf==='1m'?{bOrdinal:ordinal}:{}),
    price,signaledAtMs:at,expiresAtMs:at+LAB_HOME_TTL_MS};
}
export function chooseHomeCards(events,nowMs){
  if(!Array.isArray(events))return [];
  // If a faulty upstream ever supplies both B1 and B2 of one episode,
  // choose the FIRST eligible B, never promote a later duplicate alert.
  const earliest=new Map();
  for(const e of events){
    const card=createHomeCard(e,nowMs);if(!card)continue;
    const episodeKey=e.timeframe==='1m'?e.symbol+':1m:'+e.episodeAtMs:card.id;
    const old=earliest.get(episodeKey);
    if(!old||card.signaledAtMs<old.signaledAtMs)earliest.set(episodeKey,card);
  }
  const cards=[...earliest.values()].sort((a,b)=>b.signaledAtMs-a.signaledAtMs||a.symbol.localeCompare(b.symbol));
  const seen=new Set(),result=[];
  for(const card of cards){
    const key=card.symbol+':'+card.timeframe;
    if(seen.has(key))continue;
    seen.add(key);result.push(card);if(result.length>=LAB_HOME_MAX_CARDS)break;
  }
  return result;
}

import {EventJournal} from './event-journal.js';
import {OfflineDeliveryOutbox} from './offline-delivery-outbox.js';

/**
 * Crash-window repair: after an accepted LONG A is durable in EventJournal but
 * before it is added to the FCM outbox, a restart must recover the event.
 * The queue enforces unique event identity. No Firebase SDK, Internet or
 * actual push delivery in this stage.
 *
 * Call only after BOTH journals have been independently restored and validated.
 */
export async function reconcileAcceptedEvents(eventJournal,outbox,nowMs){
 if(!(eventJournal instanceof EventJournal)||!(outbox instanceof OfflineDeliveryOutbox)||
    !outbox.restored||!Number.isSafeInteger(nowMs)||nowMs<=0)
  throw Error('RECONCILE_NOT_READY');
 const accepted=eventJournal.list();
 let queued=0,duplicates=0;
 for(const e of accepted){
  // If journal has a forged, old or invalid LONG A market snapshot, fail closed.
  const didQueue=await outbox.enqueue(e,nowMs);
  if(didQueue)queued++;else duplicates++;
 }
 return {total:accepted.length,queued,duplicates};
}

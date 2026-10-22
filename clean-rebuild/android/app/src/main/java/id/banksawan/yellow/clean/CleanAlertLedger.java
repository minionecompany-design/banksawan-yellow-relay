package id.banksawan.yellow.clean;
import android.content.Context;
import android.content.SharedPreferences;
import java.util.Map;

/** Local QA duplicate barrier. Avoid OS alert replays after service restart.
 * Durable-before-notify favors suppressing duplicates; a crash between
 * persistence and OS notify can lose a display. Exactly-once is not claimed.
 */
public final class CleanAlertLedger {
 private CleanAlertLedger(){}
 public static synchronized boolean reserve(Context context,CleanViewModel.Signal signal,long nowMs){
  if(context==null||signal==null||nowMs<=0||
     signal.closedAt>nowMs+5000||nowMs-signal.closedAt>7200000)
   return false;
  return reserveInLedger(context,signal,nowMs,"yellow_clean_alerts_qa");
 }
 /** Local QA simulations MUST NOT suppress a later real FCM event. */
 public static synchronized boolean reserveLocal(Context context,CleanViewModel.Signal signal,long nowMs){
  return reserveInLedger(context,signal,nowMs,"yellow_clean_test_alerts_qa");
 }
 private static boolean reserveInLedger(Context context,CleanViewModel.Signal signal,long nowMs,String ledger){
  if(context==null||signal==null||nowMs<=0||
     signal.closedAt>nowMs+5000||nowMs-signal.closedAt>7200000)return false;
  SharedPreferences pref=context.getSharedPreferences(ledger,Context.MODE_PRIVATE);
  if(pref.contains(signal.id))return false;
  SharedPreferences.Editor editor=pref.edit();
  Map<String,?> existing=pref.getAll();
  if(existing.size()>800){
   long cutoff=nowMs-7L*24*3600000L;
   for(Map.Entry<String,?> item:existing.entrySet()){
    Object value=item.getValue();
    if(value instanceof Long&&((Long)value)<cutoff)editor.remove(item.getKey());
   }
  }
  editor.putLong(signal.id,nowMs);
  return editor.commit();
 }
}

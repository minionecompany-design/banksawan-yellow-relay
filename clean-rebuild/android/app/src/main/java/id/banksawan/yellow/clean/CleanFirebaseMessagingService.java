package id.banksawan.yellow.clean;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Stage-7 receiver installed into QA package only.
 * FCM auto-init disabled at manifest and no backend/token registration exists.
 * All remote messages are ignored unless QA user explicitly opts in.
 * Send ONLY FCM data messages; never an FCM notification+data hybrid.
 */
public final class CleanFirebaseMessagingService extends FirebaseMessagingService {
 private static final String CHANNEL="yellow_clean_long_a_qa";
 @Override public void onNewToken(String token){
  // Intentionally do NOT log, upload or retain tokens; no consented
  // recipient-registration backend exists yet.
 }
 @Override public void onMessageReceived(RemoteMessage message){
  if(!CleanFcmConsent.allowed(this))return;
  // Notification+data messages can auto-display in the background and
  // bypass our strict per-event contract. Reject such hybrids.
  if(message.getNotification()!=null)return;
  Map<String,String> payload=message.getData();
  final CleanViewModel.Signal signal;
  try{signal=CleanPushContract.parse(payload);}
  catch(RuntimeException malformed){return;}
  if(!CleanAlertLedger.reserve(this,signal,System.currentTimeMillis()))return;
  showLongA(signal,payload);
 }
 private void showLongA(CleanViewModel.Signal signal,Map<String,String> payload){
  NotificationManager manager=getSystemService(NotificationManager.class);
  if(manager==null)return;
  if(Build.VERSION.SDK_INT>=26){
   NotificationChannel channel=new NotificationChannel(CHANNEL,
       "YELLOW Clean LONG A (QA)",NotificationManager.IMPORTANCE_DEFAULT);
   channel.setDescription("Explicit QA opt-in LONG A only; not trading advice");
   manager.createNotificationChannel(channel);
  }
  Intent click=new Intent(this,CleanNotificationOpenActivity.class);
  click.setAction(Intent.ACTION_VIEW);
  click.setData(Uri.parse(NotificationEventRoute.route(signal.symbol,signal.timeframe,signal.closedAt)));
  for(String field:new String[]{"schemaVersion","signal","eventId","symbol",
        "timeframe","barClosedAtMs","tradingViewUrl"})
   click.putExtra(field,payload.get(field));
  PendingIntent open=PendingIntent.getActivity(this,0,click,
    PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
  Notification alert=new Notification.Builder(this,CHANNEL)
    .setSmallIcon(id.banksawan.yellow.R.mipmap.ic_launcher)
    .setContentTitle(signal.symbol+" · LONG A "+signal.timeframe.toUpperCase())
    .setContentText("Ketuk untuk membuka simbol tepat di TradingView")
    .setContentIntent(open).setAutoCancel(true).build();
  manager.notify(signal.id,1,alert);
 }
}

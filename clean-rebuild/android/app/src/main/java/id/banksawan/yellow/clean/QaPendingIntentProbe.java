package id.banksawan.yellow.clean;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
/** Debug-only synthetic notification-tap probe.
 * Uses a UNIQUE event data URI with immutable PendingIntent, including for
 * multiple LONG A events from the same symbol at different bar timestamps.
 * Never posts a real notification or connects to a push provider. */
public final class QaPendingIntentProbe {
 private QaPendingIntentProbe(){}
 public static PendingIntent create(Activity owner,String symbol,String timeframe,long closedAtMs){
  if(!id.banksawan.yellow.BuildConfig.DEBUG||
     !"id.banksawan.yellow.qa".equals(owner.getPackageName()))
   throw new SecurityException("QA_PACKAGE_ONLY");
  String route=NotificationEventRoute.route(symbol,timeframe,closedAtMs);
  Intent i=new Intent(owner,QaChartCaptureActivity.class);
  i.setAction(Intent.ACTION_VIEW);
  i.addCategory(Intent.CATEGORY_BROWSABLE);
  i.setData(Uri.parse(route));
  i.putExtra("yellow.qa.eventId",NotificationEventRoute.eventId(symbol,timeframe,closedAtMs));
  i.putExtra("yellow.qa.chartUrl",CleanViewModel.chartUrl(symbol));
  return PendingIntent.getActivity(owner,0,i,
   PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
 }
}

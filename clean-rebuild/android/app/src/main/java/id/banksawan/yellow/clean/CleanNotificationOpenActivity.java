package id.banksawan.yellow.clean;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import java.util.HashMap;
import java.util.Map;

/** Non-exported Android OS notification click receiver: per-event URI is
 * checked against the same immutable payload to prevent PLAY → FOGO swaps.
 */
public final class CleanNotificationOpenActivity extends Activity {
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);
  try{
   Intent inbound=getIntent();Uri data=inbound==null?null:inbound.getData();
   if(data==null||!"yellowcleanqa".equals(data.getScheme())||
      !"longa".equals(data.getHost())||data.getPathSegments().size()!=3)throw new IllegalArgumentException();
   Map<String,String> payload=new HashMap<>();
   for(String key:new String[]{"schemaVersion","signal","eventId","symbol","timeframe",
      "barClosedAtMs","tradingViewUrl"})payload.put(key,inbound.getStringExtra(key));
   CleanViewModel.Signal signal=CleanPushContract.parse(payload);
   String route=NotificationEventRoute.route(signal.symbol,signal.timeframe,signal.closedAt);
   if(!route.equals(data.toString()))throw new IllegalArgumentException("EVENT_ROUTE_MISMATCH");
   Uri target=Uri.parse(signal.chartUrl);
   Intent view=new Intent(Intent.ACTION_VIEW,target);
   view.addCategory(Intent.CATEGORY_BROWSABLE);
   startActivity(view);
  }catch(Exception e){
   android.util.Log.w("YELLOW_FCM","Rejected invalid or unsupported chart tap");
  }finally{finish();}
 }
}

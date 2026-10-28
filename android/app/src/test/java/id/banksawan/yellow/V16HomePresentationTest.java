package id.banksawan.yellow;
import android.view.View;import android.view.ViewGroup;import android.widget.TextView;
import org.json.JSONArray;import org.json.JSONObject;
import org.junit.Test;import org.junit.runner.RunWith;
import org.robolectric.Robolectric;import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import java.util.ArrayList;

@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class V16HomePresentationTest {
  private static void collect(View v,ArrayList<String> out){
    if(v instanceof TextView)out.add(((TextView)v).getText().toString());
    if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++)
      collect(((ViewGroup)v).getChildAt(i),out);
  }
  private JSONObject one(long now,String state)throws Exception{
    long bar=now/60_000L*60_000L;String id="QUSDT:1m:"+bar+":LONG_A";
    return new JSONObject().put("id",id).put("symbol","QUSDT").put("signal","LONG_A")
      .put("timeframe","1m").put("barClosedAtMs",bar).put("firstSeenMs",now)
      .put("price",1.02).put("binance24hChangePct",2.5)
      .put("quoteVolume24h",20_000_000.0).put("homeExpiresMs",now+600_000L)
      .put("monitor1m",new JSONObject().put("schemaVersion",1).put("method","YELLOW_V16_WATCH_ONLY_1M")
        .put("mode","WATCH_ONLY").put("eventId",id).put("status",state)
        .put("reason","PRIORITY".equals(state)?"STRUCTURE_WATCH_PRIORITY":"RISK_LATCHED")
        .put("checkedAtMs",now).put("lastBarEndMs",bar).put("startedAtMs",bar)
        .put("watchUntilMs",bar+21_600_000L)
        .put("entryAllowed",false).put("entryPrice",JSONObject.NULL)
        .put("stopLoss",JSONObject.NULL).put("tp1",JSONObject.NULL)
        .put("priceChangeSinceAPct",1.22).put("tickerAtMs",now));
  }
  @Test public void onlyOneCompactWatchStatusAppearsAndNoEntryOrTPClaim()throws Exception{
    try(ActivityController<MainActivity> control=Robolectric.buildActivity(MainActivity.class).create()){
      MainActivity a=control.get();long now=System.currentTimeMillis();
      a.applyLiveSnapshot(new JSONArray().put(one(now,"PRIORITY")),new JSONArray(),0,0);
      ArrayList<String> texts=new ArrayList<>();collect(a.getWindow().getDecorView(),texts);
      assertTrue(texts.stream().anyMatch(x->x.contains("PEMANTAUAN 1M")&&x.contains("PANTAU PRIORITAS")));
      assertTrue(texts.stream().anyMatch(x->x.contains("belum konfirmasi ENTRY")));
      assertFalse(texts.stream().anyMatch(x->x.contains("TP1")||x.contains("STOP LOSS")));
    }
  }
  @Test public void forgedGreenCannotBePresentedAsWatchPriority()throws Exception{
    try(ActivityController<MainActivity> control=Robolectric.buildActivity(MainActivity.class).create()){
      MainActivity a=control.get();long now=System.currentTimeMillis();
      JSONObject e=one(now,"PRIORITY");e.getJSONObject("monitor1m").put("status","GREEN");
      a.applyLiveSnapshot(new JSONArray().put(e),new JSONArray(),0,0);
      ArrayList<String> texts=new ArrayList<>();collect(a.getWindow().getDecorView(),texts);
      assertFalse(texts.stream().anyMatch(x->x.contains("PEMANTAUAN 1M")));
    }
  }
}

package id.banksawan.yellow;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class WatchOnlyV16Test {
  private final long t=1793073600000L;
  private final String id="QUSDT:1m:"+t+":LONG_A";
  private JSONObject event(String tf)throws Exception{
    String eid="QUSDT:"+tf+":"+t+":LONG_A";
    JSONObject e=new JSONObject().put("id",eid).put("symbol","QUSDT")
      .put("timeframe",tf).put("barClosedAtMs",t).put("signal","LONG_A")
      .put("price",1.00);
    JSONObject watch=new JSONObject().put("method","YELLOW_V16_WATCH_ONLY_1M")
      .put("schemaVersion",1).put("mode","WATCH_ONLY").put("eventId",eid)
      .put("checkedAtMs",t+25_000L).put("lastBarEndMs",t)
      .put("startedAtMs",t).put("watchUntilMs",t+21_600_000L)
      .put("status","PRIORITY").put("reason","STRUCTURE_WATCH_PRIORITY")
      .put("entryAllowed",false).put("entryPrice",JSONObject.NULL)
      .put("stopLoss",JSONObject.NULL).put("tp1",JSONObject.NULL)
      .put("priceChangeSinceAPct",2.34).put("tickerAtMs",t+22_000L);
    return e.put("monitor1m",watch);
  }
  @Test public void acceptsBoundFreshWatchOnlyAndNoOtherTf()throws Exception{
    JSONObject a=event("1m");
    JSONObject watch=AnalysisSnapshot.monitor1m(a,t+30_000L);
    assertNotNull(watch);
    assertEquals("PANTAU PRIORITAS",AnalysisSnapshot.monitor1mLabel(watch));
    assertNull(AnalysisSnapshot.monitor1m(event("5m"),t+30_000L));
    assertEquals("DATA TIDAK TERSEDIA",AnalysisSnapshot.monitor1mLabel(null));
  }
  @Test public void forbidsGreenEntryLevelsForgedEventAndOldQuote()throws Exception{
    JSONObject e=event("1m"),w=e.getJSONObject("monitor1m");
    w.put("status","GREEN");
    assertNull(AnalysisSnapshot.monitor1m(e,t+30_000L));
    w.put("status","PRIORITY").put("entryAllowed",true);
    assertNull(AnalysisSnapshot.monitor1m(e,t+30_000L));
    w.put("entryAllowed",false).put("entryPrice",1.002);
    assertNull(AnalysisSnapshot.monitor1m(e,t+30_000L));
    w.put("entryPrice",JSONObject.NULL).put("eventId","PUSDT:1m:"+t+":LONG_A");
    assertNull(AnalysisSnapshot.monitor1m(e,t+30_000L));
    w.put("eventId",id).put("tickerAtMs",t-1);
    assertNull(AnalysisSnapshot.monitor1m(e,t+30_000L));
  }
  @Test public void omitsStaleCrossCandleOrExpiredActiveStatus()throws Exception{
    JSONObject e=event("1m"),w=e.getJSONObject("monitor1m");
    assertNull(AnalysisSnapshot.monitor1m(e,t+90_000L));
    w.put("checkedAtMs",t+120_000L).put("lastBarEndMs",t);
    assertNull(AnalysisSnapshot.monitor1m(e,t+130_000L));
    w.put("checkedAtMs",t+21_600_000L).put("lastBarEndMs",t+21_600_000L);
    assertNull(AnalysisSnapshot.monitor1m(e,t+21_600_001L));
    // An OFF result after six hours must no longer carry a stale old ticker.
    w.put("status","OFF").put("priceChangeSinceAPct",JSONObject.NULL)
      .put("tickerAtMs",JSONObject.NULL);
    assertNotNull(AnalysisSnapshot.monitor1m(e,t+21_600_001L));
  }
}

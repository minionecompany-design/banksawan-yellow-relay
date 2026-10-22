package id.banksawan.yellow.clean;
import org.junit.Test;import static org.junit.Assert.*;
import org.json.*;
public class CleanViewModelTest {
 @Test public void eachHomeCardOpensItsOwnSymbol() throws Exception{
  JSONObject data=new JSONObject().put("schemaVersion","yellow-clean-v1").put("dataState","OK").put("count",2);
  JSONArray items=new JSONArray();
  for(String symbol:new String[]{"PLAYUSDT","FOGOUSDT"}){
   items.put(new JSONObject().put("id",symbol+":1m:60000:LONG_A").put("symbol",symbol)
    .put("signal","LONG_A").put("timeframe","1m").put("barClosedAtMs",60000)
    .put("tradingViewUrl",CleanViewModel.chartUrl(symbol)));
  }
  data.put("events",items);
  CleanViewModel.Home h=CleanViewModel.parseHome(data);
  assertEquals("https://www.tradingview.com/chart/?symbol=BINANCE%3APLAYUSDT.P",h.signals.get(0).chartUrl);
  assertTrue(h.signals.get(1).chartUrl.contains("FOGOUSDT.P"));
 }
 @Test(expected=IllegalArgumentException.class)public void mismatchFailsClosed() throws Exception{
  JSONObject data=new JSONObject().put("schemaVersion","yellow-clean-v1").put("dataState","OK").put("count",1);
  data.put("events",new JSONArray().put(new JSONObject().put("id","PLAYUSDT:1m:60000:LONG_A")
   .put("symbol","PLAYUSDT").put("signal","LONG_A").put("timeframe","1m").put("barClosedAtMs",60000)
   .put("tradingViewUrl",CleanViewModel.chartUrl("FOGOUSDT"))));
  CleanViewModel.parseHome(data);
 }
 @Test public void unavailableIsNotNoCandidates() throws Exception{
  JSONObject data=new JSONObject().put("schemaVersion","yellow-clean-v1").put("dataState","UNAVAILABLE")
   .put("count",JSONObject.NULL).put("events",new JSONArray());
  assertTrue(CleanViewModel.parseHome(data).unavailable);
 }
 @Test public void universeSupportsEligibleBeyond50ButTrackedAtMost50() throws Exception {
  JSONObject coverage=new JSONObject().put("eligible",2).put("covered",1).put("maxTracked",50).put("trackedEligible",1);
  JSONArray rows=new JSONArray();
  for(String s:new String[]{"PLAYUSDT","FOGOUSDT"}){
   rows.put(new JSONObject().put("symbol",s).put("price",2.1).put("binance24hChangePct",1.5)
    .put("quoteVolume24h",12000001).put("tracked",s.equals("PLAYUSDT")));
  }
  JSONObject o=new JSONObject().put("schemaVersion","yellow-clean-v1").put("dataState","OK")
   .put("coverage",coverage).put("universe",rows);
  CleanViewModel.Universe u=CleanViewModel.parseUniverse(o);
  assertEquals(2,u.eligible);assertEquals(1,u.tracked);assertEquals(50,u.capacity);
 }
 @Test(expected=IllegalArgumentException.class)public void universeRejectsVolumeAtTenMillion() throws Exception {
  JSONObject coverage=new JSONObject().put("eligible",1).put("covered",1).put("maxTracked",50).put("trackedEligible",1);
  JSONArray rows=new JSONArray().put(new JSONObject().put("symbol","PLAYUSDT").put("price",2.1)
   .put("binance24hChangePct",1.5).put("quoteVolume24h",10000000).put("tracked",true));
  CleanViewModel.parseUniverse(new JSONObject().put("schemaVersion","yellow-clean-v1")
   .put("dataState","OK").put("coverage",coverage).put("universe",rows));
 }
 @Test public void reorderedHomeAlwaysBindsCorrectChart() throws Exception {
  JSONObject root=new JSONObject().put("schemaVersion","yellow-clean-v1").put("dataState","OK").put("count",2);
  JSONArray events=new JSONArray();
  for(String s:new String[]{"FOGOUSDT","PLAYUSDT"}){
   events.put(new JSONObject().put("id",s+":5m:300000:LONG_A").put("symbol",s)
    .put("timeframe","5m").put("signal","LONG_A").put("barClosedAtMs",300000)
    .put("tradingViewUrl",CleanViewModel.chartUrl(s)));
  }
  root.put("events",events);
  CleanViewModel.Home home=CleanViewModel.parseHome(root);
  assertEquals("FOGOUSDT",home.signals.get(0).symbol);
  assertEquals(CleanViewModel.chartUrl("FOGOUSDT"),home.signals.get(0).chartUrl);
  assertEquals("PLAYUSDT",home.signals.get(1).symbol);
  assertEquals(CleanViewModel.chartUrl("PLAYUSDT"),home.signals.get(1).chartUrl);
 }
 @Test(expected=IllegalArgumentException.class)public void forgedChartSymbolCannotReachUi() throws Exception {
  JSONObject bad=new JSONObject().put("schemaVersion","yellow-clean-v1").put("dataState","OK").put("count",1);
  bad.put("events",new JSONArray().put(new JSONObject()
   .put("id","PLAYUSDT:1m:60000:LONG_A").put("symbol","PLAYUSDT")
   .put("signal","LONG_A").put("timeframe","1m").put("barClosedAtMs",60000)
   .put("tradingViewUrl",CleanViewModel.chartUrl("FOGOUSDT"))));
  CleanViewModel.parseHome(bad);
 }
}

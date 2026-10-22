package id.banksawan.yellow.clean;
import java.util.HashMap;import java.util.Map;
import org.junit.Test;import static org.junit.Assert.*;
public class CleanPushContractTest {
 private Map<String,String> signal(String symbol,String tf,long ms){
  Map<String,String> p=new HashMap<>();
  p.put("schemaVersion","yellow-clean-v1");p.put("signal","LONG_A");
  p.put("symbol",symbol);p.put("timeframe",tf);p.put("barClosedAtMs",Long.toString(ms));
  p.put("eventId",symbol+":"+tf+":"+ms+":LONG_A");
  p.put("tradingViewUrl",CleanViewModel.chartUrl(symbol));
  return p;
 }
 @Test public void playAndFogoAlwaysKeepIndependentUrls(){
  CleanViewModel.Signal play=CleanPushContract.parse(signal("PLAYUSDT","1m",60000));
  CleanViewModel.Signal fogo=CleanPushContract.parse(signal("FOGOUSDT","15m",900000));
  assertEquals("PLAYUSDT",play.symbol);assertEquals("FOGOUSDT",fogo.symbol);
  assertEquals(CleanViewModel.chartUrl("PLAYUSDT"),play.chartUrl);
  assertEquals(CleanViewModel.chartUrl("FOGOUSDT"),fogo.chartUrl);
  assertNotEquals(play.id,fogo.id);
 }
 @Test(expected=IllegalArgumentException.class)public void crossedTargetRejected(){
  Map<String,String> x=signal("PLAYUSDT","1m",60000);
  x.put("tradingViewUrl",CleanViewModel.chartUrl("FOGOUSDT"));
  CleanPushContract.parse(x);
 }
 @Test(expected=IllegalArgumentException.class)public void longBRejected(){
  Map<String,String> x=signal("PLAYUSDT","1m",60000);x.put("signal","LONG_B");
  CleanPushContract.parse(x);
 }
 @Test(expected=IllegalArgumentException.class)public void invalidCandleRejected(){
  CleanPushContract.parse(signal("PLAYUSDT","5m",60000));
 }
 @Test(expected=IllegalArgumentException.class)public void forgedIdRejected(){
  Map<String,String> x=signal("PLAYUSDT","1m",60000);
  x.put("eventId","FOGOUSDT:1m:60000:LONG_A");
  CleanPushContract.parse(x);
 }
}

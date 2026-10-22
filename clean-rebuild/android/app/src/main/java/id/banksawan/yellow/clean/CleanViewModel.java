package id.banksawan.yellow.clean;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
/** Offline Android view-model parser. No network, activity or mutable selected symbol. */
public final class CleanViewModel {
 public static final String SCHEMA="yellow-clean-v1";
 private CleanViewModel(){}
 public static final class Signal {
  public final String id,symbol,timeframe,chartUrl;
  public final long closedAt;
  Signal(String id,String symbol,String tf,long when,String url){
   this.id=id;this.symbol=symbol;this.timeframe=tf;this.closedAt=when;this.chartUrl=url;
  }
 }
 public static final class Home {
  public final String state;
  public final List<Signal> signals;
  public final boolean unavailable;
  Home(String state,List<Signal> signals){this.state=state;this.signals=signals;this.unavailable=!"OK".equals(state);}
 }
 private static void check(boolean ok,String msg){if(!ok)throw new IllegalArgumentException(msg);}
 private static boolean symbol(String s){return s!=null&&s.matches("[A-Z0-9]{2,25}USDT");}
 public static String chartUrl(String symbol){
  check(symbol(symbol),"INVALID_SYMBOL");
  return "https://www.tradingview.com/chart/?symbol=BINANCE%3A"+symbol+".P";
 }
 public static Home parseHome(JSONObject obj){
  check(SCHEMA.equals(obj.optString("schemaVersion")),"UNSUPPORTED_SCHEMA");
  String state=obj.optString("dataState");
  check("OK".equals(state)||"UNAVAILABLE".equals(state),"UNKNOWN_STATE");
  if("UNAVAILABLE".equals(state)){
   check(obj.isNull("count")&&obj.optJSONArray("events")!=null&&obj.optJSONArray("events").length()==0,"INVALID_UNAVAILABLE");
   return new Home(state,new ArrayList<>());
  }
  JSONArray source=obj.optJSONArray("events");
  check(source!=null&&obj.optInt("count",-1)==source.length(),"COUNT_MISMATCH");
  List<Signal> result=new ArrayList<>();
  for(int i=0;i<source.length();i++){
   JSONObject item=source.optJSONObject(i);check(item!=null,"BAD_EVENT");
   String s=item.optString("symbol"),tf=item.optString("timeframe"),id=item.optString("id");
   long at=item.optLong("barClosedAtMs",-1);
   check(symbol(s)&&("1m".equals(tf)||"5m".equals(tf)||"15m".equals(tf)||"1h".equals(tf))&&at>0&&
    "LONG_A".equals(item.optString("signal"))&&id.equals(s+":"+tf+":"+at+":LONG_A"),"BAD_EVENT_ID");
   String url=chartUrl(s);
   check(url.equals(item.optString("tradingViewUrl")),"BAD_CHART_IDENTITY");
   result.add(new Signal(id,s,tf,at,url));
  }
  return new Home(state,result);
 }
 public static final class Universe {
  public final int eligible,tracked,capacity;
  public final boolean unavailable;
  public final List<String> symbols;
  Universe(int eligible,int tracked,int capacity,boolean unavailable,List<String> symbols){
   this.eligible=eligible;this.tracked=tracked;this.capacity=capacity;
   this.unavailable=unavailable;this.symbols=symbols;
  }
 }
 public static Universe parseUniverse(JSONObject obj){
  check(SCHEMA.equals(obj.optString("schemaVersion")),"UNSUPPORTED_SCHEMA");
  String state=obj.optString("dataState");
  check("OK".equals(state)||"UNAVAILABLE".equals(state),"UNKNOWN_STATE");
  JSONObject coverage=obj.optJSONObject("coverage");
  JSONArray rows=obj.optJSONArray("universe");
  check(coverage!=null&&rows!=null,"MISSING_COVERAGE");
  if("UNAVAILABLE".equals(state)){
   check(coverage.isNull("eligible")&&rows.length()==0,"INVALID_UNAVAILABLE");
   return new Universe(0,0,50,true,new ArrayList<>());
  }
  int eligible=coverage.optInt("eligible",-1),tracked=coverage.optInt("covered",-1),capacity=coverage.optInt("maxTracked",-1);
  check(eligible>=0&&eligible==rows.length()&&tracked>=0&&tracked<=50&&capacity==50&&tracked<=capacity,"INVALID_COVERAGE");
  List<String> symbols=new ArrayList<>();
  int trackedEligible=0;
  for(int i=0;i<rows.length();i++){
   JSONObject row=rows.optJSONObject(i);check(row!=null,"BAD_ROW");
   String s=row.optString("symbol");check(symbol(s)&&!symbols.contains(s),"INVALID_SYMBOL");
   double price=row.optDouble("price",Double.NaN),change=row.optDouble("binance24hChangePct",Double.NaN),
    vol=row.optDouble("quoteVolume24h",Double.NaN);
   check(Double.isFinite(price)&&price>0&&price<10&&Double.isFinite(change)&&change>=1&&
     Double.isFinite(vol)&&vol>10000000,"FILTER_MISMATCH");
   if(row.optBoolean("tracked"))trackedEligible++;
   symbols.add(s);
  }
  check(trackedEligible==coverage.optInt("trackedEligible",-1)&&trackedEligible<=tracked,"TRACKED_MISMATCH");
  return new Universe(eligible,tracked,capacity,false,symbols);
 }
}

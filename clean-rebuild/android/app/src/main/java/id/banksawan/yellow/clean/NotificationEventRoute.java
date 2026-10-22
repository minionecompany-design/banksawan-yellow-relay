package id.banksawan.yellow.clean;
/** Pure per-event route identity: stable across restart, distinct across symbol,
 * timeframe and closed candle. No global "selected symbol" state. */
public final class NotificationEventRoute {
 private NotificationEventRoute(){}
 public static String route(String symbol,String timeframe,long closedAtMs){
  if(symbol==null||!symbol.matches("[A-Z0-9]{2,25}USDT")||
     !("1m".equals(timeframe)||"5m".equals(timeframe)||
       "15m".equals(timeframe)||"1h".equals(timeframe))||
     closedAtMs<=0)throw new IllegalArgumentException("INVALID_LONG_A_ROUTE");
  return "yellowcleanqa://longa/"+symbol+"/"+timeframe+"/"+closedAtMs;
 }
 public static String eventId(String symbol,String timeframe,long closedAtMs){
  route(symbol,timeframe,closedAtMs);
  return symbol+":"+timeframe+":"+closedAtMs+":LONG_A";
 }
}

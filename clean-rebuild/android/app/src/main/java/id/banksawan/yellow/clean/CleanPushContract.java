package id.banksawan.yellow.clean;
import java.util.Map;
/** Validates a data-only LONG A push contract; no Firebase dependency, token,
 * network access or Android notification dispatch is enabled here. */
public final class CleanPushContract {
 private CleanPushContract(){}
 private static void require(boolean yes){if(!yes)throw new IllegalArgumentException("INVALID_LONG_A_PUSH");}
 public static CleanViewModel.Signal parse(Map<String,String> data){
  require(data!=null&&"yellow-clean-v1".equals(data.get("schemaVersion"))&&
   "LONG_A".equals(data.get("signal")));
  String s=data.get("symbol"),tf=data.get("timeframe"),id=data.get("eventId"),time=data.get("barClosedAtMs");
  require(s!=null&&s.matches("[A-Z0-9]{2,25}USDT")&&
   ("1m".equals(tf)||"5m".equals(tf)||"15m".equals(tf)||"1h".equals(tf))&&
   time!=null&&time.matches("[0-9]{1,16}"));
  long at;
  try{at=Long.parseLong(time);}catch(NumberFormatException e){throw new IllegalArgumentException("INVALID_LONG_A_PUSH",e);}
  long span="1m".equals(tf)?60000:"5m".equals(tf)?300000:"15m".equals(tf)?900000:3600000;
  require(at>0&&at%span==0&&id!=null&&id.equals(s+":"+tf+":"+at+":LONG_A")&&
   CleanViewModel.chartUrl(s).equals(data.get("tradingViewUrl")));
  return new CleanViewModel.Signal(id,s,tf,at,CleanViewModel.chartUrl(s));
 }
}

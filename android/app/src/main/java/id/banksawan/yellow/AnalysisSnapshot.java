package id.banksawan.yellow;

import org.json.JSONArray;
import org.json.JSONObject;

/** Validates the identity and time of a frozen analysis before any price is shown. */
final class AnalysisSnapshot {
    final JSONObject data;
    private AnalysisSnapshot(JSONObject data){this.data=data;}

    static long period(String tf){
        switch(tf){case "1m":return 60_000L;case "5m":return 300_000L;
            case "15m":return 900_000L;case "1h":return 3_600_000L;default:return 0;}
    }
    static boolean validId(String id){
        if(id==null||id.length()>100||!id.matches("[A-Z0-9]{1,25}USDT:(1m|5m|15m|1h):[1-9][0-9]{0,15}:LONG_A"))return false;
        try{String[] parts=id.split(":");long end=Long.parseLong(parts[2]);return end>0&&end<=9_007_199_254_740_991L&&end%period(parts[1])==0;}
        catch(Exception bad){return false;}
    }
    static String homeEventId(JSONObject item){
        if(item==null||!"LONG_A".equals(item.optString("signal")))return "";
        String id=item.optString("id","");
        String expected=item.optString("symbol")+":"+item.optString("timeframe")+":"+item.optLong("barClosedAtMs",-1)+":LONG_A";
        return validId(id)&&id.equals(expected)?id:"";
    }
    /**
     * HOME displays only a frozen preview bound to the exact accepted LONG A.
     * Any malformed/mismatched level is hidden instead of producing false guidance.
     */
    static JSONObject homePreview(JSONObject item,long nowMs){
        String eventId=homeEventId(item);
        if(eventId.isEmpty()||!item.optBoolean("analysisCaptured",false))return null;
        JSONObject p=item.optJSONObject("analysisPreview");
        if(p==null||p.optInt("schemaVersion",-1)!=1||
            !"YELLOW_COMPANION_V1".equals(p.optString("method"))||
            !"RESEARCH_ONLY".equals(p.optString("mode"))||
            !eventId.equals(p.optString("eventId")))return null;
        long signalAt=item.optLong("barClosedAtMs",-1);
        long captured=p.optLong("capturedAtMs",-1);
        if(p.optLong("signalAtMs",-1)!=signalAt||captured<signalAt||
            captured-signalAt>300_000L||captured>nowMs+30_000L||
            p.optLong("expiresAtMs",-1)!=signalAt+900_000L)return null;
        for(String key:new String[]{"referenceEntry","entryLow","entryHigh","stopLoss","tp1","tp2","tp3"})
            if(!positive(p,key))return null;
        double stop=p.optDouble("stopLoss"),low=p.optDouble("entryLow"),high=p.optDouble("entryHigh");
        double reference=p.optDouble("referenceEntry"),tp1=p.optDouble("tp1"),tp2=p.optDouble("tp2"),tp3=p.optDouble("tp3");
        double eventPrice=item.optDouble("price",Double.NaN);
        if(!Double.isFinite(eventPrice)||eventPrice<=0||
            Math.abs(reference-eventPrice)>Math.max(eventPrice*1e-8,1e-12)||
            !(stop<low&&low<=reference&&reference<=high&&high<=tp1&&tp1<tp2&&tp2<tp3)||
            !p.has("trendConflict")||!p.has("resistanceBeforeTp1")||
            !(p.opt("trendConflict") instanceof Boolean)||
            !(p.opt("resistanceBeforeTp1") instanceof Boolean))return null;
        return p;
    }
    /**
     * A signal-quality light is NOT an entry order. Reject stale,
     * cross-event or ungrounded green/red verdicts fail closed.
     */
    static JSONObject homeLight(JSONObject item,long nowMs){
        String id=homeEventId(item);
        if(id.isEmpty())return null;
        JSONObject light=item.optJSONObject("analysisLight");
        if(light==null||!id.equals(light.optString("eventId")))return null;
        String status=light.optString("status"),reason=light.optString("reason");
        if(!("GREEN".equals(status)||"YELLOW".equals(status)||"RED".equals(status))||
            !reason.matches("[A-Z_]{4,50}"))return null;
        long checked=light.optLong("checkedAtMs",-1);
        if(checked<=0||checked>nowMs+10_000L||nowMs-checked>=45_000L)return null;
        if("GREEN".equals(status)||"RED".equals(status)){
            if(!item.optBoolean("analysisCaptured",false))return null;
            JSONObject plan=homePreview(item,nowMs);
            if(plan==null||nowMs>=plan.optLong("expiresAtMs"))return null;
            double px=light.optDouble("tickerPrice",Double.NaN);
            long at=light.optLong("tickerAtMs",-1);
            if(!Double.isFinite(px)||px<=0||at<=0||at>checked+10_000L||
                checked-at>=30_000L)return null;
            if("GREEN".equals(status)&&
                (px<plan.optDouble("entryLow")||px>plan.optDouble("entryHigh")||
                !"KONDISI_TEKNIS_MENDUKUNG".equals(reason)))return null;
        }
        return light;
    }
    private static boolean positive(JSONObject o,String key){
        double value=o.optDouble(key,Double.NaN);return Double.isFinite(value)&&value>0;
    }
    private static boolean nullablePositive(JSONObject o,String key){return o.has(key)&&(o.isNull(key)||positive(o,key));}
    private static void require(boolean valid){if(!valid)throw new IllegalStateException("INVALID_ANALYSIS_SNAPSHOT");}

    static AnalysisSnapshot parse(JSONObject reply,String requestedId,long nowMs)throws Exception {
        require(validId(requestedId)&&reply!=null&&!reply.optBoolean("simulation",true)&&
            "LIVE_SHADOW".equals(reply.optString("mode")));
        JSONObject a=reply.getJSONObject("analysis");
        String[] parts=requestedId.split(":");long signalAt=Long.parseLong(parts[2]);
        long captured=a.optLong("capturedAtMs",-1),expires=a.optLong("expiresAtMs",-1);
        require(a.optInt("schemaVersion",-1)==1&&"YELLOW_COMPANION_V1".equals(a.optString("method"))&&
            "RESEARCH_ONLY".equals(a.optString("mode"))&&requestedId.equals(a.optString("eventId"))&&
            parts[0].equals(a.optString("symbol"))&&parts[1].equals(a.optString("timeframe"))&&
            signalAt==a.optLong("signalAtMs",-1)&&captured>=signalAt&&captured-signalAt<=300_000L&&
            captured<=nowMs+30_000L&&expires==signalAt+900_000L);
        String availability=a.optString("availability");
        require("READY".equals(availability)||"PARTIAL".equals(availability));
        JSONArray frames=a.getJSONArray("frames");String[] names={"1m","5m","15m","1h"};
        require(frames.length()==4);boolean complete=true;
        for(int i=0;i<4;i++){
            JSONObject f=frames.getJSONObject(i);require(names[i].equals(f.optString("timeframe")));
            String available=f.optString("availability");
            require("READY".equals(available)||"UNAVAILABLE".equals(available));
            if("UNAVAILABLE".equals(available)){complete=false;continue;}
            long span=period(names[i]);
            require(f.optLong("candleEndMs",-1)==signalAt/span*span&&positive(f,"close")&&
                positive(f,"ma7")&&positive(f,"ma25")&&positive(f,"ma99")&&
                Double.isFinite(f.optDouble("atr14",Double.NaN))&&f.optDouble("atr14")>=0&&
                (f.isNull("relativeVolume")||Double.isFinite(f.optDouble("relativeVolume",Double.NaN))&&f.optDouble("relativeVolume")>=0)&&
                ("UP".equals(f.optString("trend"))||"DOWN".equals(f.optString("trend"))||"MIXED".equals(f.optString("trend"))));
        }
        require(complete=="READY".equals(availability));
        JSONObject levels=a.optJSONObject("levels");
        if(levels!=null){
            String interaction=levels.optString("interaction");
            require(nullablePositive(levels,"support")&&nullablePositive(levels,"resistance")&&
                nullablePositive(levels,"breakoutLevel")&&positive(levels,"rangeHigh")&&positive(levels,"rangeLow")&&
                levels.getDouble("rangeHigh")>=levels.getDouble("rangeLow")&&
                ("BREAKOUT".equals(interaction)||"BREAKDOWN".equals(interaction)||"RETEST".equals(interaction)||"INSIDE_RANGE".equals(interaction)));
        }
        JSONObject p=a.optJSONObject("plan");
        if(p!=null){
            for(String key:new String[]{"referenceEntry","entryLow","entryHigh","stopLoss","tp1","tp2","tp3","riskPct"})require(positive(p,key));
            require(complete&&p.getDouble("stopLoss")<p.getDouble("entryLow")&&
                p.getDouble("entryLow")<=p.getDouble("referenceEntry")&&p.getDouble("referenceEntry")<=p.getDouble("entryHigh")&&
                p.getDouble("entryHigh")<=p.getDouble("tp1")&&p.getDouble("tp1")<p.getDouble("tp2")&&p.getDouble("tp2")<p.getDouble("tp3")&&
                nullablePositive(p,"roomToResistanceR"));
        }
        JSONObject paper=a.getJSONObject("paper");String result=paper.optString("status");
        require(result.matches("WAITING_ENTRY|OPEN|NO_PLAN|NOT_ENTERED|INCOMPLETE_DATA|TP1_BEFORE_SL|SL_BEFORE_TP1|AMBIGUOUS|TIMEOUT"));
        require(p!=null||"NO_PLAN".equals(result));
        require(Double.isFinite(paper.optDouble("costBps",Double.NaN))&&paper.optDouble("costBps")>=0&&paper.optDouble("costBps")<=1000);
        if(!paper.isNull("netReturnPct"))require(Double.isFinite(paper.optDouble("netReturnPct",Double.NaN)));
        require(a.optJSONArray("warnings")!=null);
        return new AnalysisSnapshot(new JSONObject(a.toString()));
    }
}

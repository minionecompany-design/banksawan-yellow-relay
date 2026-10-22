package id.banksawan.yellow;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.*;

/** Pure parser used by the Android UI and JVM fixture tests. No network or Android UI. */
public final class UniverseSnapshot {
    public static final String SCHEMA="yellow-universe-v1";
    public final ArrayList<JSONObject> rows=new ArrayList<>();
    public int eligible,tracked,capacity;
    public boolean partial;
    public long generatedAtMs;
    public static final class DataException extends Exception {
        public final String label;
        DataException(String label){super(label);this.label=label;}
    }
    private static void require(boolean ok,String label)throws DataException{if(!ok)throw new DataException(label);}
    public static void compatible(JSONObject status)throws DataException {
        JSONObject p=status.optJSONObject("productPolicy");
        require(SCHEMA.equals(status.optString("universeSchema"))&&policy(p),"BACKEND BELUM KOMPATIBEL");
    }
    private static boolean policy(JSONObject p){return p!=null&&p.optDouble("maxPriceExclusive")==10&&
        p.optDouble("minChangeInclusive")==1&&p.optDouble("minQuoteVolumeExclusive")==10_000_000;}
    private static boolean fresh(long at,long now){return at>0&&at<=now+10_000&&now-at<30_000;}
    public static UniverseSnapshot parse(JSONObject reply,long now)throws Exception{
        require(SCHEMA.equals(reply.optString("schemaVersion"))&&policy(reply.optJSONObject("productPolicy")),"BACKEND BELUM KOMPATIBEL");
        require(!reply.optBoolean("simulation",true)&&"LIVE_SHADOW".equals(reply.optString("mode")),"DATA TIDAK TERSEDIA");
        String state=reply.optString("dataState");
        require("OK".equals(state)||"PARTIAL".equals(state),"STALE".equals(state)?"STALE":"DATA TIDAK TERSEDIA");
        UniverseSnapshot result=new UniverseSnapshot();result.partial="PARTIAL".equals(state);
        result.generatedAtMs=reply.optLong("generatedAtMs",0);
        require(fresh(result.generatedAtMs,now)&&fresh(reply.optLong("lastTickerDataAtMs",0),now),"STALE");
        JSONObject c=reply.getJSONObject("coverage");
        result.eligible=c.getInt("eligible");result.tracked=c.getInt("covered");result.capacity=c.getInt("maxTracked");
        require(result.eligible>=0&&result.tracked>=0&&result.capacity>=1&&result.capacity<=200&&result.tracked<=result.capacity,"DATA TIDAK TERSEDIA");
        JSONArray values=reply.getJSONArray("universe");Set<String> seen=new HashSet<>();int trackedEligible=0;
        for(int i=0;i<values.length();i++){
            JSONObject r=values.getJSONObject(i);String symbol=r.optString("symbol","");
            double price=r.optDouble("price",Double.NaN),change=r.optDouble("binance24hChangePct",Double.NaN),q=r.optDouble("quoteVolume24h",Double.NaN);
            require(symbol.matches("[A-Z0-9]{2,25}USDT")&&seen.add(symbol)&&
                "BINANCE_USDM_FUTURES".equals(r.optString("source"))&&"PERPETUAL".equals(r.optString("contractType"))&&
                "TRADING".equals(r.optString("status"))&&"USDT".equals(r.optString("quoteAsset"))&&"USDT".equals(r.optString("marginAsset")),"DATA TIDAK TERSEDIA");
            require(Double.isFinite(price)&&price>0&&price<10&&Double.isFinite(change)&&change>=1&&Double.isFinite(q)&&q>10_000_000,"DATA TIDAK TERSEDIA");
            require(!r.optBoolean("stale",true)&&fresh(r.optLong("tickerObservedAtMs",0),now),"STALE");
            require(r.opt("tracked") instanceof Boolean,"DATA TIDAK TERSEDIA");
            if(r.getBoolean("tracked"))trackedEligible++;
            result.rows.add(r);
        }
        require(result.eligible==result.rows.size()&&trackedEligible==c.getInt("trackedEligible")&&trackedEligible<=result.tracked,"DATA TIDAK TERSEDIA");
        return result;
    }
    /** Search/sort only the fetched snapshot. Stable symbol tie-break; numeric columns are numeric. */
    public ArrayList<JSONObject> select(String query,String column,boolean descending){
        ArrayList<JSONObject> selected=new ArrayList<>();String q=query.trim().toUpperCase(Locale.ROOT);
        for(JSONObject r:rows)if(r.optString("symbol").contains(q))selected.add(r);
        selected.sort((a,b)->{int c;
            if("symbol".equals(column))c=a.optString("symbol").compareTo(b.optString("symbol"));
            else if("tracked".equals(column))c=Boolean.compare(a.optBoolean("tracked"),b.optBoolean("tracked"));
            else c=Double.compare(a.optDouble(column),b.optDouble(column));
            return c==0?a.optString("symbol").compareTo(b.optString("symbol")):(descending?-c:c);
        });return selected;
    }
}

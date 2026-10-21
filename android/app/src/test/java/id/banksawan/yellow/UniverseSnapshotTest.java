package id.banksawan.yellow;
import org.junit.Test;import static org.junit.Assert.*;
import org.json.*;import java.nio.file.*;
public class UniverseSnapshotTest {
    private JSONObject fixture()throws Exception{return new JSONObject(new String(Files.readAllBytes(Paths.get("src/main/assets/universe-preview.json")),java.nio.charset.StandardCharsets.UTF_8));}
    private long now(JSONObject r){return r.optLong("generatedAtMs");}
    private void rejects(JSONObject r,String expected)throws Exception{
        try{UniverseSnapshot.parse(r,now(r));fail("accepted invalid response");}
        catch(UniverseSnapshot.DataException e){assertEquals(expected,e.label);}
    }
    @Test public void parsesActualContractAndLocalSortSearch()throws Exception{
        JSONObject r=fixture();UniverseSnapshot s=UniverseSnapshot.parse(r,now(r));assertEquals(4,s.eligible);assertEquals(2,s.tracked);assertEquals(50,s.capacity);
        assertEquals("PLAYUSDT",s.select("","binance24hChangePct",true).get(0).getString("symbol"));
        assertEquals("FOGOUSDT",s.select("","price",false).get(0).getString("symbol"));
        assertEquals("ARCUSDT",s.select("","quoteVolume24h",false).get(0).getString("symbol"));
        assertEquals(1,s.select("play","symbol",false).size());assertEquals(0,s.select("nomatch","symbol",false).size());
        assertEquals(4,s.rows.size());
    }
    @Test public void oldBackendExplainsZeroRowsAndNowReportsIncompatible()throws Exception{
        JSONObject r=new JSONObject(new String(Files.readAllBytes(Paths.get("../../scanner/test/fixtures/v014/legacy-b31412b.json")),java.nio.charset.StandardCharsets.UTF_8));
        int count=0;JSONArray rows=r.getJSONArray("universe");for(int i=0;i<rows.length();i++)if(Double.isFinite(rows.getJSONObject(i).optDouble("quoteVolume24h",Double.NaN)))count++;
        assertEquals(0,count);assertEquals(376,r.getJSONObject("coverage").getInt("eligible"));rejects(r,"BACKEND BELUM KOMPATIBEL");
        try{UniverseSnapshot.compatible(new JSONObject());fail();}catch(UniverseSnapshot.DataException e){assertEquals("BACKEND BELUM KOMPATIBEL",e.label);}
    }
    @Test public void rejectsMissingBaseOnlyIdentityDuplicateAndCountMismatch()throws Exception{
        JSONObject r=fixture();r.getJSONArray("universe").getJSONObject(0).remove("quoteVolume24h");rejects(r,"DATA TIDAK TERSEDIA");
        r=fixture();r.getJSONArray("universe").getJSONObject(0).put("marginAsset","USDC");rejects(r,"DATA TIDAK TERSEDIA");
        r=fixture();r.getJSONArray("universe").getJSONObject(1).put("symbol","PLAYUSDT");rejects(r,"DATA TIDAK TERSEDIA");
        r=fixture();r.getJSONObject("coverage").put("eligible",376);rejects(r,"DATA TIDAK TERSEDIA");
    }
    @Test public void boundariesStaleAndGenuineEmpty()throws Exception{
        for(String key:new String[]{"price","binance24hChangePct","quoteVolume24h"}){
            JSONObject r=fixture();r.getJSONArray("universe").getJSONObject(0).put(key,key.equals("price")?10:key.equals("binance24hChangePct")?.99:10000000);rejects(r,"DATA TIDAK TERSEDIA");}
        JSONObject r=fixture();r.getJSONArray("universe").getJSONObject(0).put("tickerObservedAtMs",now(r)-30000);rejects(r,"STALE");
        r=fixture();r.put("dataState","STALE");rejects(r,"STALE");
        r=fixture();r.put("universe",new JSONArray());r.getJSONObject("coverage").put("eligible",0).put("trackedEligible",0);
        assertEquals(0,UniverseSnapshot.parse(r,now(r)).eligible);
    }
    @Test public void eligibleCanExceedTrackedCapacity()throws Exception{
        JSONObject r=fixture();JSONArray rows=r.getJSONArray("universe");JSONObject proto=rows.getJSONObject(0);rows=new JSONArray();
        for(int i=0;i<75;i++){JSONObject c=new JSONObject(proto.toString());c.put("symbol","COIN"+i+"USDT").put("tracked",i<50);rows.put(c);}
        r.put("universe",rows);r.getJSONObject("coverage").put("eligible",75).put("covered",50).put("trackedEligible",50);
        assertEquals(75,UniverseSnapshot.parse(r,now(r)).eligible);
    }
}

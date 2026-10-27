package id.banksawan.yellow;

import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=35)
public class AnalysisCompanionTest {
    public static class CapturingActivity extends MainActivity {
        String requestedId;
        @Override void openAnalysis(String eventId){requestedId=eventId;}
    }
    private JSONObject fixture()throws Exception {
        try(InputStream stream=getClass().getResourceAsStream("/analysis-companion-v1.json")){
            assertNotNull(stream);return new JSONObject(new String(stream.readAllBytes(),StandardCharsets.UTF_8));
        }
    }
    private String id(JSONObject reply)throws Exception{return reply.getJSONObject("analysis").getString("eventId");}
    private long now(JSONObject reply)throws Exception{return reply.getJSONObject("analysis").getLong("capturedAtMs")+1000;}
    private void rejects(JSONObject reply,String requested,long time)throws Exception{
        try{AnalysisSnapshot.parse(reply,requested,time);fail("Invalid analysis accepted");}
        catch(IllegalStateException expected){assertEquals("INVALID_ANALYSIS_SNAPSHOT",expected.getMessage());}
    }
    private Field field(String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f;}
    private void collect(View view,ArrayList<TextView> texts){
        if(view instanceof TextView)texts.add((TextView)view);
        if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)collect(group.getChildAt(i),texts);}
    }
    private ArrayList<Button> analysisButtons(MainActivity activity)throws Exception{
        ArrayList<TextView> texts=new ArrayList<>();collect((View)field("list").get(activity),texts);
        ArrayList<Button> buttons=new ArrayList<>();for(TextView text:texts)
            if(text instanceof Button&&"ANALISIS".equals(text.getText().toString()))buttons.add((Button)text);
        return buttons;
    }
    private JSONObject home(String symbol,String eventId)throws Exception{
        return new JSONObject().put("id",eventId).put("symbol",symbol).put("timeframe","1m").put("price",.5338)
            .put("signal","LONG_A").put("barClosedAtMs",Long.parseLong(eventId.split(":")[2]))
            .put("analysisCaptured",true)
            .put("binance24hChangePct",2.5).put("quoteVolume24h",20_000_000)
            .put("firstSeenMs",System.currentTimeMillis()).put("homeExpiresMs",System.currentTimeMillis()+3_600_000);
    }

    @Test public void oneLetterSymbolsKeepFullAnalysisAndHomeIdentity()throws Exception {
        for(String symbol:new String[]{"QUSDT","WUSDT"}) {
            JSONObject reply=new JSONObject(fixture().toString().replace("TESTUSDT",symbol));
            assertEquals(symbol,AnalysisSnapshot.parse(reply,id(reply),now(reply)).data.getString("symbol"));
            try(ActivityController<CapturingActivity> controller=Robolectric.buildActivity(CapturingActivity.class).create()) {
                CapturingActivity activity=controller.get();field("analysisAvailable").set(activity,true);
                activity.applyLiveSnapshot(new JSONArray().put(home(symbol,id(reply))),new JSONArray(),0,0);
                ArrayList<Button> buttons=analysisButtons(activity);assertEquals(1,buttons.size());
                buttons.get(0).performClick();assertEquals(id(reply),activity.requestedId);
            }
        }
    }
    @Test public void actualNodeFixturePassesAndKeepsIdentityAndFrozenPrices()throws Exception{
        JSONObject reply=fixture();AnalysisSnapshot parsed=AnalysisSnapshot.parse(reply,id(reply),now(reply));
        assertEquals("TESTUSDT",parsed.data.getString("symbol"));assertEquals(4,parsed.data.getJSONArray("frames").length());
        assertTrue(parsed.data.getJSONObject("plan").getDouble("stopLoss")<parsed.data.getJSONObject("plan").getDouble("tp1"));
        reply.getJSONObject("analysis").getJSONObject("plan").put("stopLoss",99);
        assertNotEquals(99,parsed.data.getJSONObject("plan").getDouble("stopLoss"),0);
    }
    @Test public void mismatchedSymbolsFutureCandlesAndBadLevelsAreRejected()throws Exception{
        JSONObject reply=fixture();String id=id(reply);long now=now(reply);
        rejects(reply,id.replace("TESTUSDT","OTHERUSDT"),now);
        reply=fixture();reply.getJSONObject("analysis").getJSONArray("frames").getJSONObject(3).put("candleEndMs",now+3_600_000);rejects(reply,id,now);
        reply=fixture();reply.getJSONObject("analysis").getJSONObject("plan").put("stopLoss",2);rejects(reply,id,now);
        reply=fixture();reply.getJSONObject("analysis").put("capturedAtMs",now+3_600_000);rejects(reply,id,now);
        reply=fixture();reply.put("simulation",true);rejects(reply,id,now);
    }
    @Test public void partialSnapshotHasNoScenarioAndCannotSneakInPlanPrices()throws Exception{
        JSONObject reply=fixture(),a=reply.getJSONObject("analysis");String id=id(reply);long now=now(reply);
        a.put("availability","PARTIAL");a.getJSONArray("frames").put(3,new JSONObject().put("timeframe","1h").put("availability","UNAVAILABLE"));
        rejects(reply,id,now);
        a.put("plan",JSONObject.NULL);a.getJSONObject("paper").put("status","NO_PLAN");
        assertEquals("PARTIAL",AnalysisSnapshot.parse(reply,id,now).data.getString("availability"));
    }
    @Test public void buttonIsOptInAndAlternatingHomeCardsKeepTheirOwnEventIds()throws Exception{
        JSONObject reply=fixture();String first=id(reply),second=first.replace("TESTUSDT","OTHERUSDT");
        try(ActivityController<CapturingActivity> controller=Robolectric.buildActivity(CapturingActivity.class).create()){
            CapturingActivity activity=controller.get();JSONArray home=new JSONArray().put(home("TESTUSDT",first)).put(home("OTHERUSDT",second));
            activity.applyLiveSnapshot(home,new JSONArray(),0,0);assertEquals(0,analysisButtons(activity).size());
            field("analysisAvailable").set(activity,true);
            activity.applyLiveSnapshot(new JSONArray().put(home("TESTUSDT",first).put("analysisCaptured",false)),new JSONArray(),0,0);
            assertEquals(0,analysisButtons(activity).size());
            field("analysisAvailable").set(activity,true);activity.applyLiveSnapshot(home,new JSONArray(),0,0);
            ArrayList<Button> buttons=analysisButtons(activity);assertEquals(2,buttons.size());
            buttons.get(0).performClick();assertEquals(first,activity.requestedId);
            buttons.get(1).performClick();assertEquals(second,activity.requestedId);
            buttons.get(0).performClick();assertEquals(first,activity.requestedId);
            activity.applyRefreshFailure(new IllegalStateException("HTTP 503"));assertEquals(0,analysisButtons(activity).size());
            assertEquals(false,field("analysisAvailable").get(activity));
        }
    }
    @Test public void malformedEventCannotCreateAnalysisButton()throws Exception{
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()){
            MainActivity activity=controller.get();field("analysisAvailable").set(activity,true);
            activity.applyLiveSnapshot(new JSONArray().put(home("TESTUSDT","TESTUSDT:1m:12345:LONG_A")),new JSONArray(),0,0);
            assertEquals(0,analysisButtons(activity).size());
            String valid=id(fixture());
            activity.applyLiveSnapshot(new JSONArray().put(home("TESTUSDT",valid.replace("TESTUSDT","OTHERUSDT"))),new JSONArray(),0,0);
            assertEquals(0,analysisButtons(activity).size());
        }
    }
    private JSONObject makePreview(JSONObject event)throws Exception{
        long signalAt=event.getLong("barClosedAtMs");
        return new JSONObject().put("schemaVersion",1).put("method","YELLOW_COMPANION_V1")
            .put("mode","RESEARCH_ONLY").put("eventId",event.getString("id"))
            .put("signalAtMs",signalAt).put("capturedAtMs",signalAt+1000)
            .put("expiresAtMs",signalAt+900_000L).put("referenceEntry",.5338)
            .put("entryLow",.53).put("entryHigh",.54).put("stopLoss",.52)
            .put("tp1",.55).put("tp2",.56).put("tp3",.57)
            .put("trendConflict",false).put("resistanceBeforeTp1",false);
    }
    private ArrayList<TextView> homeTexts(MainActivity activity)throws Exception{
        ArrayList<TextView> texts=new ArrayList<>();
        collect((View)field("list").get(activity),texts);return texts;
    }
    @Test public void compactHomeNeverShowsEntrySlTpButRetainsAnalysisAndTradingView()throws Exception{
        long signalAt=(System.currentTimeMillis()/60_000L-1)*60_000L;
        String id="QUSDT:1m:"+signalAt+":LONG_A";
        JSONObject item=home("QUSDT",id).put("analysisPreview",makePreview(home("QUSDT",id)));
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()){
            MainActivity activity=controller.get();field("analysisAvailable").set(activity,true);
            activity.applyLiveSnapshot(new JSONArray().put(item),new JSONArray(),0,0);
            ArrayList<TextView> texts=homeTexts(activity);
            for(String forbidden:new String[]{"ENTRY:","SL:","TP1:","TP2 / TP3:",
                    "SKENARIO LONG A","resistance sebelum TP1","ENTRY / SL / TP","KEDALUWARSA"})
                assertFalse("HOME must be compact: "+forbidden,
                    texts.stream().anyMatch(t->t.getText().toString().contains(forbidden)));
            for(String required:new String[]{"QUSDT","Harga LONG A:","Chg % 24H","Timeframe","Mulai",
                    "BUKA TRADINGVIEW ↗","ANALISIS"})
                assertTrue("Expected core HOME content: "+required,
                    texts.stream().anyMatch(t->t.getText().toString().contains(required)));
            assertEquals(1,analysisButtons(activity).size());
        }
    }
    @Test public void homePreviewRejectsCrossSymbolBadPricesAndFutureCapture()throws Exception{
        long end=(System.currentTimeMillis()/60_000L-1)*60_000L;
        JSONObject item=home("WUSDT","WUSDT:1m:"+end+":LONG_A");
        JSONObject preview=makePreview(item);
        item.put("analysisPreview",preview);
        assertNotNull(AnalysisSnapshot.homePreview(item,System.currentTimeMillis()));
        preview.put("eventId","QUSDT:1m:"+end+":LONG_A");
        assertNull(AnalysisSnapshot.homePreview(item,System.currentTimeMillis()));
        preview.put("eventId",item.getString("id")).put("stopLoss",.60);
        assertNull(AnalysisSnapshot.homePreview(item,System.currentTimeMillis()));
        preview.put("stopLoss",.52).put("capturedAtMs",System.currentTimeMillis()+600_000);
        assertNull(AnalysisSnapshot.homePreview(item,System.currentTimeMillis()));
    }
    @Test public void expiredHomePreviewDoesNotCrowdHomeOrPretendFreshEntry()throws Exception{
        long end=(System.currentTimeMillis()/60_000L-20)*60_000L;
        JSONObject item=home("QUSDT","QUSDT:1m:"+end+":LONG_A");
        item.put("analysisPreview",makePreview(item));
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()){
            MainActivity activity=controller.get();field("analysisAvailable").set(activity,true);
            activity.applyLiveSnapshot(new JSONArray().put(item),new JSONArray(),0,0);
            assertFalse(homeTexts(activity).stream().anyMatch(t->t.getText().toString()
                .contains("ENTRY KEDALUWARSA")));
            assertFalse(homeTexts(activity).stream().anyMatch(t->t.getText().toString()
                .startsWith("TP1:")));
            assertEquals(1,analysisButtons(activity).size());
        }
    }
    @Test public void genuineGreenLightAppearsAtHomeCornerOnlyForLiveInZoneSnapshot()throws Exception{
        long end=(System.currentTimeMillis()/60_000L-1)*60_000L;
        JSONObject item=home("QUSDT","QUSDT:1m:"+end+":LONG_A");
        item.put("analysisPreview",makePreview(item));
        long now=System.currentTimeMillis();
        JSONObject light=new JSONObject().put("eventId",item.getString("id"))
            .put("status","GREEN").put("reason","KONDISI_TEKNIS_MENDUKUNG")
            .put("checkedAtMs",now).put("tickerPrice",.5338).put("tickerAtMs",now);
        item.put("analysisLight",light);
        assertNotNull(AnalysisSnapshot.homeLight(item,now));
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()){
            MainActivity activity=controller.get();field("analysisAvailable").set(activity,true);
            activity.applyLiveSnapshot(new JSONArray().put(item),new JSONArray(),0,0);
            assertTrue(homeTexts(activity).stream().anyMatch(t->t.getText().toString().equals("MENDUKUNG")));
        }
        light.put("tickerPrice",.9);
        assertNull(AnalysisSnapshot.homeLight(item,now));
        light.put("tickerPrice",.5338).put("tickerAtMs",now-40_000);
        assertNull(AnalysisSnapshot.homeLight(item,now));
        light.put("tickerAtMs",now).put("eventId","WUSDT:1m:"+end+":LONG_A");
        assertNull(AnalysisSnapshot.homeLight(item,now));
    }

    @Test public void expiredOrMissingAnalysisCannotClaimGreenEntry()throws Exception{
        long end=(System.currentTimeMillis()/60_000L-20)*60_000L;
        JSONObject item=home("QUSDT","QUSDT:1m:"+end+":LONG_A");
        item.put("analysisPreview",makePreview(item));
        long now=System.currentTimeMillis();
        JSONObject light=new JSONObject().put("eventId",item.getString("id"))
            .put("status","GREEN").put("reason","KONDISI_TEKNIS_MENDUKUNG")
            .put("checkedAtMs",now).put("tickerPrice",.5338).put("tickerAtMs",now);
        item.put("analysisLight",light);
        assertNull(AnalysisSnapshot.homeLight(item,now));
        light.put("status","YELLOW").put("reason","SKENARIO_KEDALUWARSA");
        assertNotNull(AnalysisSnapshot.homeLight(item,now));
    }

    @Test public void expiredFrozenAnalysisIsLabeledAndEntryRangeCanWrapAtPhoneWidth()throws Exception{
        JSONObject reply=fixture();AnalysisSnapshot snapshot=AnalysisSnapshot.parse(reply,id(reply),now(reply));
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()){
            MainActivity activity=controller.get();LinearLayout content=new LinearLayout(activity);content.setOrientation(LinearLayout.VERTICAL);
            activity.renderAnalysis(content,snapshot,snapshot.data.getLong("expiresAtMs")+1);
            content.measure(View.MeasureSpec.makeMeasureSpec(320,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));
            content.layout(0,0,320,content.getMeasuredHeight());ArrayList<TextView> texts=new ArrayList<>();collect(content,texts);
            assertTrue(texts.stream().anyMatch(t->t.getText().toString().contains("sudah kedaluwarsa")));
            assertTrue(texts.stream().anyMatch(t->t.getText().toString().equals("Zona entry")));
            for(TextView text:texts)if(text.getText().toString().contains(" – "))assertFalse(text.isSingleLine());
            java.lang.reflect.Method price=MainActivity.class.getDeclaredMethod("analysisPrice",double.class);price.setAccessible(true);
            assertEquals("0.000000000001",price.invoke(activity,1e-12));
            assertNotEquals(price.invoke(activity,1e-8),price.invoke(activity,9.99e-9));
        }
    }
}

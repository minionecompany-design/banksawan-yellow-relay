package id.banksawan.yellow;

import android.graphics.Color;
import android.widget.TextView;
import java.lang.reflect.Field;
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
@Config(sdk = 35)
public class RefreshPublicationTest {
    private Object field(MainActivity activity,String name)throws Exception {
        Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(activity);
    }
    private JSONArray universe()throws Exception {
        return new JSONArray().put(new JSONObject().put("symbol","PLAYUSDT").put("price",0.05)
            .put("binance24hChangePct",2).put("quoteVolume24h",20_000_000).put("coverage","SCANNING"));
    }
    @Test public void waitingStatusDoesNotLookHealthy()throws Exception {
        try(ActivityController<MainActivity> c=Robolectric.buildActivity(MainActivity.class).create()) {
            TextView status=(TextView)field(c.get(),"status");
            assertEquals("MENUNGGU DATA",status.getText().toString());
            assertEquals(Color.rgb(248,212,60),status.getCurrentTextColor());
        }
    }
    @Test public void liveFailureAndRecoveryClearStaleRowsAndRestoreHealthyState()throws Exception {
        for(String reason:new String[]{"YELLOW_BACKEND_INCOMPATIBLE","HTTP 503"}) {
            try(ActivityController<MainActivity> c=Robolectric.buildActivity(MainActivity.class).create()) {
                MainActivity a=c.get();JSONArray rows=universe();
                MainActivity.verifyUniverseSnapshot(rows,1,1,50);
                a.applyLiveSnapshot(new JSONArray().put(new JSONObject().put("id","old")),rows,1,1);
                TextView status=(TextView)field(a,"status");
                assertEquals("LIVE SHADOW • 1/1 DIPINDAI",status.getText().toString());
                assertEquals(Color.rgb(41,213,141),status.getCurrentTextColor());
                a.applyRefreshFailure(new IllegalStateException(reason));
                assertEquals(Color.rgb(248,212,60),status.getCurrentTextColor());
                assertTrue(status.getText().toString().contains("TANPA DATA LIVE"));
                assertEquals(reason.equals("YELLOW_BACKEND_INCOMPATIBLE"),field(a,"backendIncompatible"));
                assertEquals(false,field(a,"connectionHealthy"));
                assertEquals(0,((JSONArray)field(a,"home")).length());
                assertEquals(0,((JSONArray)field(a,"universe")).length());
                assertEquals(0L,field(a,"lastRefreshMs"));
                assertEquals(0,field(a,"lastCovered"));assertEquals(0,field(a,"lastEligible"));
                a.applyLiveSnapshot(new JSONArray(),rows,1,1);
                assertEquals(false,field(a,"backendIncompatible"));
                assertEquals(true,field(a,"connectionHealthy"));
                assertEquals(Color.rgb(41,213,141),status.getCurrentTextColor());
                assertEquals(1,((JSONArray)field(a,"universe")).length());
                assertTrue((Long)field(a,"lastRefreshMs")>0);
            }
        }
    }
}

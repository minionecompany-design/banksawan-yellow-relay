package id.banksawan.yellow;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class UniverseSnapshotTest {
    private JSONArray rows(int count,int scanning)throws Exception {
        JSONArray rows=new JSONArray();
        for(int i=0;i<count;i++) rows.put(new JSONObject().put("symbol","COIN"+i+"USDT")
            .put("price",0.05).put("binance24hChangePct",2).put("quoteVolume24h",20_000_000)
            .put("coverage",i<scanning?"SCANNING":"QUEUED"));
        return rows;
    }
    private void rejected(JSONArray rows,int covered,int eligible,int maximum) {
        assertThrows(IllegalStateException.class,
            ()->MainActivity.verifyUniverseSnapshot(rows,covered,eligible,maximum));
    }
    @Test public void oneLetterBaseSymbolsAreValidButEmptyBaseIsRejected()throws Exception {
        JSONArray values=rows(2,2);
        values.getJSONObject(0).put("symbol","QUSDT");values.getJSONObject(1).put("symbol","WUSDT");
        MainActivity.verifyUniverseSnapshot(values,2,2,50);
        values.getJSONObject(0).put("symbol","USDT");rejected(values,2,2,50);
    }
    @Test public void completeCappedBootstrapAndEmptySnapshotsAreValid()throws Exception {
        MainActivity.verifyUniverseSnapshot(rows(47,47),47,47,50);
        MainActivity.verifyUniverseSnapshot(rows(65,50),50,65,50);
        MainActivity.verifyUniverseSnapshot(rows(47,3),3,47,50);
        MainActivity.verifyUniverseSnapshot(rows(0,0),0,0,50);
    }
    @Test public void screenshotCoverageAndDishonestRowsAreRejected()throws Exception {
        assertThrows(IllegalStateException.class,()->MainActivity.verifyCoverage(44,41,50));
        rejected(rows(41,41),44,41,50);
        rejected(rows(47,47),47,48,50);
        rejected(rows(47,46),47,47,50);
        rejected(rows(51,51),51,51,50);
        rejected(rows(1,1),1,1,51);
        JSONArray duplicate=rows(2,2);duplicate.put(1,duplicate.getJSONObject(0));
        rejected(duplicate,2,2,50);
    }
    @Test public void legacyVolumeAndStrictFilterBoundariesAreRejected()throws Exception {
        JSONArray legacy=rows(1,1);legacy.getJSONObject(0).remove("quoteVolume24h");
        rejected(legacy,1,1,50);
        String[] keys={"price","price","binance24hChangePct","quoteVolume24h"};
        double[] values={0,10,1,10_000_000};
        for(int i=0;i<keys.length;i++) {
            JSONArray bad=rows(1,1);bad.getJSONObject(0).put(keys[i],values[i]);rejected(bad,1,1,50);
        }
    }
    @Test public void unavailableAndIncompatibleDataNeverClaimAnEmptyMarket() {
        assertTrue(MainActivity.emptyUniverseMessage(false,true).contains("backend belum sesuai"));
        assertTrue(MainActivity.emptyUniverseMessage(false,false).contains("belum dapat ditentukan"));
        String genuineEmpty=MainActivity.emptyUniverseMessage(true,false);
        assertTrue(genuineEmpty.contains("> +1%"));
        assertTrue(genuineEmpty.contains("0 < harga < 10 USDT"));
        assertTrue(genuineEmpty.contains("volume 24H > 10.000.000 USDT"));
    }
}

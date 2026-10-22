package id.banksawan.yellow;

import android.Manifest;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class YellowNotifierTest {
    private Application app;
    private NotificationManager manager;
    private long closedAt;

    @Before public void setup() {
        app=RuntimeEnvironment.getApplication();
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        app.getSharedPreferences("yellow_notify_claims",Context.MODE_PRIVATE).edit().clear().commit();
        manager=(NotificationManager)app.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancelAll();
        closedAt=System.currentTimeMillis()-1000;
    }

    private String id(String symbol,String tf) {return symbol+":"+tf+":"+closedAt+":LONG_A";}
    private boolean notify(String symbol,String tf) {
        return YellowNotifier.claimAndNotify(app,id(symbol,tf),symbol,tf,
            closedAt,closedAt+300_000,.05,2.0,20_000_000);
    }

    @Test public void fourTimeframesAndTwoSymbolsRemainIndependent() {
        for(String symbol:new String[]{"PLAYUSDT","FOGOUSDT"})
            for(String tf:new String[]{"1m","5m","15m","1h"}) assertTrue(notify(symbol,tf));
        assertEquals(8,manager.getActiveNotifications().length);
    }

    @Test public void duplicatePollingAndFcmEntryPointPostsOnlyOnce() {
        assertTrue(notify("PLAYUSDT","1m"));
        assertFalse(notify("PLAYUSDT","1m"));
        assertFalse(notify("PLAYUSDT","1m"));
        assertEquals(1,manager.getActiveNotifications().length);
        SharedPreferences claims=app.getSharedPreferences("yellow_notify_claims",Context.MODE_PRIVATE);
        assertTrue(claims.contains("claimed_"+id("PLAYUSDT","1m")));
        // Removing a displayed notification must not erase the durable delivery claim.
        manager.cancelAll();
        Context anotherContext=app.createConfigurationContext(app.getResources().getConfiguration());
        assertFalse(YellowNotifier.claimAndNotify(anotherContext,id("PLAYUSDT","1m"),"PLAYUSDT","1m",
            closedAt,closedAt+300_000,.05,2.0,20_000_000));
        assertEquals(0,manager.getActiveNotifications().length);
    }

    @Test public void differentSymbolsWithIdenticalJavaHashMustNotReplaceEachOther() {
        // Both are valid symbol-shaped IDs. No assumption about current exchange listings.
        assertEquals(id("AQUSDT","1m").hashCode(),id("B2USDT","1m").hashCode());
        assertTrue(notify("AQUSDT","1m"));assertTrue(notify("B2USDT","1m"));
        assertEquals(2,manager.getActiveNotifications().length);
    }

    @Test public void concurrentPollingAndFcmClaimsProduceExactlyOneNotification()throws Exception {
        ExecutorService threads=Executors.newFixedThreadPool(4);
        try {
            List<Callable<Boolean>> attempts=new ArrayList<>();
            for(int i=0;i<24;i++)attempts.add(()->notify("PLAYUSDT","15m"));
            int accepted=0;
            for(Future<Boolean> result:threads.invokeAll(attempts))if(result.get())accepted++;
            assertEquals(1,accepted);assertEquals(1,manager.getActiveNotifications().length);
        }finally{threads.shutdownNow();}
    }

    @Test public void rejectedPermissionDoesNotConsumeClaim() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        assertFalse(notify("PLAYUSDT","5m"));
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        assertTrue(notify("PLAYUSDT","5m"));
    }

    @Test public void invalidBoundaryOrSymbolIdentityCannotNotify() {
        String symbol="PLAYUSDT",tf="1m",event=id(symbol,tf);
        assertFalse(YellowNotifier.claimAndNotify(app,event,"FOGOUSDT",tf,closedAt,closedAt+300_000,.05,2,20_000_000));
        assertFalse(YellowNotifier.claimAndNotify(app,event,symbol,tf,closedAt,closedAt+300_000,.05,1,20_000_000));
        assertFalse(YellowNotifier.claimAndNotify(app,event,symbol,tf,closedAt,closedAt+300_000,.05,2,10_000_000));
        assertFalse(YellowNotifier.claimAndNotify(app,event,symbol,tf,closedAt,closedAt+300_000,10,2,20_000_000));
        assertFalse(YellowNotifier.claimAndNotify(app,event,symbol,tf,closedAt,closedAt+300_000,.05,2,Double.NaN));
        assertEquals(0,manager.getActiveNotifications().length);
    }

    @Test public void soundTestDoesNotClaimOrPublishLongA() {
        assertTrue(YellowNotifier.testSound(app));
        assertEquals(1,manager.getActiveNotifications().length);
        Notification notification=manager.getActiveNotifications()[0].getNotification();
        assertEquals("TES SUARA BANKSAWAN YELLOW",notification.extras.getString(Notification.EXTRA_TITLE));
        assertTrue(app.getSharedPreferences("yellow_notify_claims",Context.MODE_PRIVATE).getAll().isEmpty());
    }
}

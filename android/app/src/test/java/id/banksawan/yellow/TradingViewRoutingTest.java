package id.banksawan.yellow;

import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.widget.Button;
import android.widget.LinearLayout;
import java.lang.reflect.Method;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

/** Tests our emitted Intents only; cannot certify the external TradingView app. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class TradingViewRoutingTest {
    public static class WithoutTradingView extends MainActivity {
        @Override public void startActivity(Intent intent) {
            if("com.tradingview.tradingviewapp".equals(intent.getPackage()))
                throw new ActivityNotFoundException("Offline test: TradingView absent");
            super.startActivity(intent);
        }
    }
    private Button button(MainActivity activity,String symbol)throws Exception {
        LinearLayout parent=new LinearLayout(activity);
        Method method=MainActivity.class.getDeclaredMethod("tradingView",String.class,LinearLayout.class);
        method.setAccessible(true);method.invoke(activity,symbol,parent);
        return (Button)parent.getChildAt(0);
    }

    @Test public void alternatingClicksRetainTheirOwnSymbolAfterOtherButtonWasCreated()throws Exception {
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity=controller.get();
            Button play=button(activity,"PLAYUSDT"),fogo=button(activity,"FOGOUSDT");
            Button[] clicks={play,fogo,play,fogo,play};
            String[] expected={"PLAYUSDT","FOGOUSDT","PLAYUSDT","FOGOUSDT","PLAYUSDT"};
            for(int i=0;i<clicks.length;i++) {
                clicks[i].performClick();Intent intent=shadowOf(activity).getNextStartedActivity();
                assertNotNull(intent);assertEquals(Intent.ACTION_VIEW,intent.getAction());
                assertEquals("com.tradingview.tradingviewapp",intent.getPackage());
                assertEquals("https://www.tradingview.com/symbols/"+expected[i]+".P?exchange=BINANCE",intent.getDataString());
            }
        }
    }

    @Test public void explicitBrowserGestureUsesTheClickedSymbol()throws Exception {
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity=controller.get();
            Button play=button(activity,"PLAYUSDT");button(activity,"FOGOUSDT");
            assertTrue(play.performLongClick());
            Intent intent=shadowOf(activity).getNextStartedActivity();
            assertEquals("com.android.chrome",intent.getPackage());
            assertEquals("https://www.tradingview.com/symbols/PLAYUSDT.P?exchange=BINANCE",intent.getDataString());
        }
    }

    @Test public void invalidSymbolCannotLaunchAnExternalActivity()throws Exception {
        try(ActivityController<MainActivity> controller=Robolectric.buildActivity(MainActivity.class).create()) {
            MainActivity activity=controller.get();
            button(activity,"PLAYUSDT?symbol=FOGOUSDT").performClick();
            assertNull(shadowOf(activity).getNextStartedActivity());
        }
    }

    @Test public void missingTradingViewFallsBackWithTheSameSymbolUri()throws Exception {
        try(ActivityController<WithoutTradingView> controller=Robolectric.buildActivity(WithoutTradingView.class).create()) {
            MainActivity activity=controller.get();
            button(activity,"PLAYUSDT").performClick();
            Intent intent=shadowOf(activity).getNextStartedActivity();
            assertNotNull(intent);assertNull(intent.getPackage());
            assertEquals("https://www.tradingview.com/symbols/PLAYUSDT.P?exchange=BINANCE",intent.getDataString());
        }
    }
}

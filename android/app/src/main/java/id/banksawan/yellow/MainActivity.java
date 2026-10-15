package id.banksawan.yellow;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.WindowInsets;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ArrayList;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * BANKSAWAN YELLOW V7 — LIVE SHADOW HOME + Binance-style UNIVERSE.
 * Never fetches Binance itself. LIVE mode reads only the separate YELLOW API.
 * Long A foreground polling and YELLOW-only background FCM share one claim ledger.
 * Without a YELLOW_API_BASE_URL configured, the APK remains an explicit demo.
 */
public class MainActivity extends Activity {
    private final int BG=Color.rgb(9,17,28), CARD=Color.rgb(21,32,47);
    private final int LINE=Color.rgb(48,65,85), MUTED=Color.rgb(162,179,198);
    private final int YELLOW=Color.rgb(248,212,60), GREEN=Color.rgb(41,213,141);
    private LinearLayout list, root, bottom, header;
    private TextView status, banner;
    private long lastRefreshMs = 0L;
    private volatile long lastEventCursorMs = 0L;
    private volatile boolean connectionHealthy = false;
    private int lastCovered = 0;
    private int lastEligible = 0;
    private String tab="home";
    private JSONArray home=new JSONArray(), universe=new JSONArray();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Runnable refreshTask=new Runnable(){@Override public void run(){refresh();handler.postDelayed(this,60_000);}};
    private final Runnable eventsTask=new Runnable(){@Override public void run(){pollLongAEvents();handler.postDelayed(this,10_000);}};

    @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);YellowNotifier.channel(this);buildShell();
        if(BuildConfig.FCM_ENABLED){
            com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic(YellowNotifier.TOPIC);
        }
    }
    @Override protected void onResume(){super.onResume();
        // Seed cursor at open: never replay an old event as a fresh notification.
        lastEventCursorMs=System.currentTimeMillis();
        handler.post(refreshTask);
        // LIVE SHADOW pilot does not notify until TradingView parity and user acceptance.
        if(!BuildConfig.DEMO_MODE && BuildConfig.ALERTS_ENABLED){
            handler.post(eventsTask);requestNotificationPermission();
        }
    }
    @Override protected void onPause(){handler.removeCallbacks(refreshTask);handler.removeCallbacks(eventsTask);super.onPause();}
    @Override protected void onDestroy(){handler.removeCallbacks(refreshTask);handler.removeCallbacks(eventsTask);io.shutdownNow();super.onDestroy();}
    private void requestNotificationPermission(){
        if(Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},1107);
        }
    }
    private void pollLongAEvents(){
        if(BuildConfig.DEMO_MODE || !BuildConfig.ALERTS_ENABLED || !connectionHealthy || lastEventCursorMs<=0) return;
        final long cursor=lastEventCursorMs;
        io.execute(()->{
            try{
                JSONArray events=load("/api/events?afterMs="+cursor,"events");
                long maxSeen=cursor;
                for(int i=0;i<events.length();i++){
                    JSONObject e=events.optJSONObject(i);if(e==null)continue;
                    long detected=e.optLong("detectedAtMs",0);
                    if(detected>maxSeen)maxSeen=detected;
                    long now=System.currentTimeMillis();
                    if(!"LONG_A".equals(e.optString("signal"))||
                      e.optLong("expiresAtMs",0)<=now||detected<=cursor)continue;
                    String symbol=e.optString("symbol","");
                    String tf=e.optString("timeframe","");
                    String id=e.optString("id","");
                    if(!symbol.matches("[A-Z0-9]{2,25}USDT") ||
                       !(tf.equals("1m")||tf.equals("5m")||tf.equals("15m")||tf.equals("1h"))||
                       !id.equals(symbol+":"+tf+":"+e.optLong("barClosedAtMs",-1)+":LONG_A")) continue;
                    YellowNotifier.claimAndNotify(this,id,symbol,tf,
                      e.optLong("barClosedAtMs",-1),e.optLong("expiresAtMs",0),
                      e.optDouble("price",0),e.optDouble("binance24hChangePct",0));
                }
                // Subtract 1ms to accommodate events with identical server timestamps;
                // the durable local event-id claim prevents duplicates.
                final long next=Math.max(cursor,maxSeen-1);
                runOnUiThread(()->lastEventCursorMs=Math.max(lastEventCursorMs,next));
            }catch(Exception ignored){/* Never transform a connection error into a signal. */}
        });
    }
    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private GradientDrawable shape(int color,int stroke){GradientDrawable g=new GradientDrawable();g.setColor(color);
        g.setCornerRadius(dp(16));if(stroke!=0)g.setStroke(dp(1),stroke);return g;}
    private TextView text(String msg,int size,int color,boolean bold){TextView t=new TextView(this);
        t.setText(msg);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(null,Typeface.BOLD);return t;}
    private void buildShell(){
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(BG);
        root.setPadding(dp(16),dp(20),dp(16),dp(8));
        // Preserve the two navigation tabs above Android gesture/navigation controls.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int navBottom = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? insets.getInsets(WindowInsets.Type.navigationBars()).bottom
                : insets.getSystemWindowInsetBottom();
            root.setPadding(dp(16), dp(20), dp(16), dp(8) + navBottom);
            return insets;
        });
        setContentView(root);
        header=new LinearLayout(this);header.setOrientation(LinearLayout.HORIZONTAL);header.setGravity(Gravity.CENTER_VERTICAL);
        ImageView image=new ImageView(this);image.setImageResource(R.drawable.yellow_logo);image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        header.addView(image,new LinearLayout.LayoutParams(dp(70),dp(70)));
        LinearLayout titleBlock=new LinearLayout(this);titleBlock.setOrientation(LinearLayout.VERTICAL);
        titleBlock.setPadding(dp(12),0,0,0);titleBlock.addView(text("BANKSAWAN YELLOW",22,YELLOW,true));
        titleBlock.addView(text("LONG A MTF • Scanner independen",12,MUTED,false));
        header.addView(titleBlock);root.addView(header);
        banner=text("DEMO OFFLINE • BUKAN SINYAL ENTRY",13,YELLOW,true);
        banner.setText(BuildConfig.DEMO_MODE ? "DEMO OFFLINE • BUKAN SINYAL ENTRY" : "LIVE SHADOW • PENELITIAN, BUKAN SINYAL ENTRY");
        banner.setGravity(Gravity.CENTER);banner.setPadding(dp(12),dp(15),dp(12),dp(15));
        banner.setBackground(shape(Color.rgb(57,41,12),YELLOW));
        LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(-1,-2);bp.setMargins(0,dp(18),0,dp(14));root.addView(banner,bp);
        status=text("MENUNGGU DATA",13,GREEN,true);status.setGravity(Gravity.CENTER);
        status.setPadding(dp(8),dp(15),dp(8),dp(15));status.setBackground(shape(CARD,LINE));root.addView(status);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);list.setPadding(0,dp(18),0,dp(18));scroll.addView(list);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        bottom=new LinearLayout(this);bottom.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(bottom);renderTabs();render();
    }
    private void renderTabs(){bottom.removeAllViews();for(String name:new String[]{"home","universe"}){
        boolean selected=tab.equals(name);Button b=new Button(this);b.setText(name.toUpperCase(Locale.ROOT));
        b.setTextColor(selected?BG:MUTED);b.setTextSize(16);b.setAllCaps(false);
        b.setBackground(shape(selected?YELLOW:CARD,selected?YELLOW:LINE));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(55),1);lp.setMargins(dp(3),dp(3),dp(3),dp(3));bottom.addView(b,lp);
        b.setOnClickListener(v->{tab=name;renderTabs();render();});}}
    private String formattedTime(long t){SimpleDateFormat f=new SimpleDateFormat("dd MMM HH:mm",new Locale("id","ID"));
        f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));return f.format(new Date(t))+" WIB";}
    private String number(double n){return String.format(Locale.US,n<1?"%.6f":"%.3f",n);}
    private void line(LinearLayout parent,String label,String value){TextView t=text(label+"   "+value,13,MUTED,false);
        t.setPadding(0,dp(6),0,dp(6));parent.addView(t);}
    private void tradingView(String symbol,LinearLayout parent){
        Button b=new Button(this);b.setText("BUKA TRADINGVIEW ↗");b.setTextColor(BG);
        b.setBackground(shape(Color.rgb(51,179,229),0));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(48));
        p.setMargins(0,dp(14),0,0);parent.addView(b,p);
        b.setOnClickListener(v->{if(!symbol.matches("[A-Z0-9]{2,25}USDT"))return;
            Uri uri=Uri.parse("https://www.tradingview.com/chart/?symbol="+Uri.encode("BINANCE:"+symbol+".P"));
            Intent intent=new Intent(Intent.ACTION_VIEW,uri);intent.addCategory(Intent.CATEGORY_BROWSABLE);
            try{startActivity(intent);}catch(Exception ignored){} });
    }
    private void card(String symbol,JSONObject item,boolean isHome){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(19),dp(19),dp(19),dp(17));
        box.setBackground(shape(CARD,LINE));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
        p.setMargins(0,0,0,dp(13));list.addView(box,p);
        box.addView(text(symbol,24,Color.WHITE,true));
        double price=item.optDouble(isHome?"price":"price",0);
        line(box,isHome?(BuildConfig.DEMO_MODE?"Harga LONG A (DEMO):":"Harga LONG A:"):
            (BuildConfig.DEMO_MODE?"Harga contoh:":"Harga terakhir:"),number(price)+" USDT");
        line(box,BuildConfig.DEMO_MODE?"Perubahan Binance 24H (DEMO):":"Perubahan Binance 24H:",
            String.format(Locale.US,"%+.2f%%",item.optDouble("binance24hChangePct")));
        if(isHome){line(box,"Timeframe LONG A:",item.optString("timeframe","1m").toUpperCase(Locale.ROOT));long first=item.optLong("firstSeenMs",0),expires=item.optLong("homeExpiresMs",0);
            line(box,"Mulai HOME:",formattedTime(first));line(box,"Hilang otomatis:",formattedTime(expires));}
        else line(box,"Prioritas:",item.optString("priority","STANDARD"));
        if (isHome) tradingView(symbol,box);
    }
    /**
     * UNIVERSE is an observation-only, Binance-style market table.
     * No TradingView URL, webview, or click listener is attached to any row.
     * Server values are displayed read-only; the Android app never calls Binance.
     */
    private void renderUniverse() {
        ArrayList<JSONObject> eligible = new ArrayList<>();
        for (int i = 0; i < universe.length(); i++) {
            JSONObject coin = universe.optJSONObject(i);
            if (coin == null) continue;
            String symbol = coin.optString("symbol", "");
            double price = coin.optDouble("price", Double.NaN);
            double change = coin.optDouble("binance24hChangePct", Double.NaN);
            if (!symbol.matches("[A-Z0-9]{2,25}USDT")
                || !Double.isFinite(price) || price <= 0 || price >= 10.0
                || !Double.isFinite(change) || change < 1.0) continue;
            eligible.add(coin);
        }
        eligible.sort((left, right) -> Double.compare(
            right.optDouble("binance24hChangePct"),
            left.optDouble("binance24hChangePct")
        ));

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("USDⓈ-M  " + eligible.size() + " COIN", 21, Color.WHITE, true);
        titleRow.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        TextView updated = text(lastRefreshMs > 0 ? shortTime(lastRefreshMs) : "--:--:--",
            15, GREEN, true);
        updated.setGravity(Gravity.END);
        titleRow.addView(updated);
        list.addView(titleRow);

        if (BuildConfig.DEMO_MODE) {
            TextView demo = text("DEMO OFFLINE • DATA CONTOH, BUKAN HARGA LIVE",
                11, YELLOW, true);
            demo.setPadding(0, dp(5), 0, dp(8));
            list.addView(demo);
        } else {
            // Do not present previously fetched rows as fresh when the server is down.
            boolean fresh = connectionHealthy && lastRefreshMs > 0
                && System.currentTimeMillis() - lastRefreshMs < 180_000L;
            String detail = fresh
                ? "LIVE SHADOW • " + lastCovered + "/" + lastEligible + " DIPINDAI • PILOT MTF"
                : "SERVER OFFLINE • DATA TIDAK TERBARU";
            TextView health = text(detail, 11, fresh ? GREEN : YELLOW, true);
            health.setPadding(0, dp(5), 0, dp(8));
            list.addView(health);
        }

        LinearLayout columns = new LinearLayout(this);
        columns.setOrientation(LinearLayout.HORIZONTAL);
        columns.setGravity(Gravity.TOP);
        TextView colSymbol = text("USDⓈ-M", 12, MUTED, false);
        TextView colPrice = text("Harga\nTerakhir", 12, MUTED, false);
        TextView colChange = text("Prbh% 24j", 12, MUTED, false);
        colPrice.setGravity(Gravity.END);
        colChange.setGravity(Gravity.END);
        columns.addView(colSymbol, new LinearLayout.LayoutParams(0, -2, 1.65f));
        columns.addView(colPrice, new LinearLayout.LayoutParams(0, -2, 1.2f));
        columns.addView(colChange, new LinearLayout.LayoutParams(0, -2, 1.15f));
        list.addView(columns);
        View spacer = new View(this);
        list.addView(spacer, new LinearLayout.LayoutParams(-1, dp(13)));

        for (JSONObject coin : eligible) addUniverseRow(coin);

        if (eligible.isEmpty()) {
            TextView empty = text("Belum ada koin yang memenuhi filter Binance 24H ≥ +1% dan harga <10 USDT.",
                13, MUTED, false);
            empty.setPadding(0, dp(18), 0, 0);
            list.addView(empty);
        }
    }

    private String shortTime(long ms) {
        SimpleDateFormat format = new SimpleDateFormat("HH:mm:ss", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));
        return format.format(new Date(ms));
    }

    private void addUniverseRow(JSONObject coin) {
        String symbol = coin.optString("symbol", "");
        double price = coin.optDouble("price", 0);
        double change = coin.optDouble("binance24hChangePct", 0);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(75));

        LinearLayout symbolColumn = new LinearLayout(this);
        symbolColumn.setOrientation(LinearLayout.VERTICAL);
        TextView ticker = text(symbol, 17, Color.WHITE, true);
        ticker.setMaxLines(2);
        symbolColumn.addView(ticker);
        TextView perp = text("Perp", 12, MUTED, false);
        perp.setPadding(0, dp(3), 0, 0);
        symbolColumn.addView(perp);
        row.addView(symbolColumn, new LinearLayout.LayoutParams(0, -2, 1.65f));

        TextView priceView = text(number(price), 16, Color.WHITE, false);
        priceView.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        row.addView(priceView, new LinearLayout.LayoutParams(0, -2, 1.2f));

        LinearLayout changeColumn = new LinearLayout(this);
        changeColumn.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        TextView changeView = text(String.format(Locale.US, "%+.2f%%", change),
            16, Color.WHITE, true);
        changeView.setGravity(Gravity.CENTER);
        changeView.setPadding(dp(7), dp(10), dp(7), dp(10));
        GradientDrawable greenPill = shape(Color.rgb(11, 191, 123), 0);
        greenPill.setCornerRadius(dp(8));
        changeView.setBackground(greenPill);
        changeColumn.addView(changeView);
        row.addView(changeColumn, new LinearLayout.LayoutParams(0, -2, 1.15f));
        list.addView(row);

        // Intentionally no row click and no TradingView shortcut on UNIVERSE.
    }

    private void render() {
        list.removeAllViews();
        boolean isUniverse = tab.equals("universe");
        header.setVisibility(isUniverse ? View.GONE : View.VISIBLE);
        banner.setVisibility(isUniverse ? View.GONE : View.VISIBLE);
        status.setVisibility(isUniverse ? View.GONE : View.VISIBLE);

        if (isUniverse) {
            renderUniverse();
            return;
        }

        TextView heading = text("HOME", 26, Color.WHITE, true);
        heading.setPadding(0, 0, 0, dp(8));
        list.addView(heading);
        TextView subtitle = text(BuildConfig.DEMO_MODE ? "LONG A • DEMO 24 jam" : "LONG A TERAMATI • RISET 24 jam per simbol", 13, MUTED, false);
        subtitle.setPadding(0, 0, 0, dp(17));
        list.addView(subtitle);

        int count = 0;
        for (int i = 0; i < home.length(); i++) {
            JSONObject item = home.optJSONObject(i);
            if (item == null || item.optLong("homeExpiresMs", 0) <= System.currentTimeMillis())
                continue;
            String symbol = item.optString("symbol", "");
            if (!symbol.matches("[A-Z0-9]{2,25}USDT")) continue;
            double price = item.optDouble("price", Double.NaN);
            double pct = item.optDouble("binance24hChangePct", Double.NaN);
            String tf = item.optString("timeframe", "");
            if (!Double.isFinite(price) || price <= 0 || price >= 10
                || !Double.isFinite(pct) || pct < 1
                || !(tf.equals("1m") || tf.equals("5m") || tf.equals("15m") || tf.equals("1h"))) continue;
            card(symbol, item, true);
            count++;
        }
        if (count == 0) {
            list.addView(text("Belum ada LONG A yang dapat ditampilkan", 14, MUTED, false));
        }
    }
    /** Fail closed on disconnected or stale YELLOW market data; never fall back to demo. */
    private void refresh(){
        if(BuildConfig.DEMO_MODE){setDemo();return;}
        io.execute(()->{
            try{
                JSONObject statusReply=loadJson("/api/status");
                JSONObject guard=statusReply.optJSONObject("requestGuard");
                long now=System.currentTimeMillis();
                long tickerAt=statusReply.optLong("lastTickerDataAtMs",0);
                long klineAt=statusReply.optLong("lastKlineDataAtMs",0);
                int covered=statusReply.optInt("covered",-1);
                int eligible=statusReply.optInt("eligible",-1);
                int maximum=statusReply.optInt("maxTracked",-1);
                boolean tickerFresh=tickerAt>0 && tickerAt<=now+10_000L
                    && now-tickerAt<180_000L;
                boolean klineFresh=covered==0 || (klineAt>0 && klineAt<=now+10_000L
                    && now-klineAt<300_000L);
                if(!statusReply.optBoolean("ok",false)
                    || !"LIVE_SHADOW".equals(statusReply.optString("mode",""))
                    || !statusReply.optBoolean("tickerConnected",false)
                    || !statusReply.optBoolean("klineConnected",false)
                    || guard==null || guard.optBoolean("circuitOpen",true)
                    || covered<0 || eligible<0 || maximum<1 || maximum>24 || covered>maximum
                    || !tickerFresh || !klineFresh){
                    throw new IllegalStateException("YELLOW_MARKET_NOT_READY_OR_STALE");
                }
                JSONObject homeReply=loadJson("/api/home");
                JSONObject universeReply=loadJson("/api/universe");
                verifyLive(homeReply);
                verifyLive(universeReply);
                JSONArray newHome=homeReply.getJSONArray("home");
                JSONArray newUniverse=universeReply.getJSONArray("universe");
                JSONObject coverage=universeReply.getJSONObject("coverage");
                int newCovered=coverage.getInt("covered");
                int newEligible=coverage.getInt("eligible");
                if(newCovered<0||newCovered>24||newEligible<0)
                    throw new IllegalStateException("INVALID_SCANNER_COVERAGE");
                runOnUiThread(()->{
                    home=newHome;universe=newUniverse;
                    lastCovered=newCovered;lastEligible=newEligible;
                    lastRefreshMs=System.currentTimeMillis();
                    connectionHealthy=true;
                    status.setText("LIVE SHADOW • "+newCovered+"/"+newEligible+" DIPINDAI");
                    render();
                });
            }catch(Exception err){
                runOnUiThread(()->{
                    // Clear all last-known prices and signals. Never display stale data as LIVE.
                    connectionHealthy=false;
                    home=new JSONArray();universe=new JSONArray();
                    lastCovered=0;lastEligible=0;lastRefreshMs=0;
                    status.setText("SERVER / FEED TIDAK SIAP • TANPA DATA LIVE");
                    render();
                });
            }
        });
    }
    private void verifyLive(JSONObject response)throws Exception {
        if(response.optBoolean("simulation",true)
            || !"LIVE_SHADOW".equals(response.optString("mode","")))
            throw new IllegalStateException("REJECT_NON_LIVE_API_PAYLOAD");
    }
    private JSONObject loadJson(String route)throws Exception {
      HttpURLConnection c=(HttpURLConnection)new URL(BuildConfig.API_BASE_URL+route).openConnection();
      c.setConnectTimeout(5000);c.setReadTimeout(5000);c.setRequestMethod("GET");
      try{if(c.getResponseCode()!=200)throw new IllegalStateException("HTTP "+c.getResponseCode());
        StringBuilder b=new StringBuilder();try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
          String line;while((line=reader.readLine())!=null)b.append(line);}
        JSONObject response=new JSONObject(b.toString());if(response.optBoolean("simulation",false))throw new IllegalStateException("Simulation endpoint");
        return response;
      }finally{c.disconnect();}
    }
    private void setDemo(){long now=System.currentTimeMillis();
        long anchor=getSharedPreferences("yellow_demo",MODE_PRIVATE).getLong("demoAnchorMs",0);
        if(anchor==0){anchor=now;getSharedPreferences("yellow_demo",MODE_PRIVATE).edit().putLong("demoAnchorMs",anchor).apply();}
        try{home=new JSONArray().put(new JSONObject().put("symbol","WALUSDT").put("timeframe","15m").put("price",0.05123)
          .put("binance24hChangePct",5.8).put("firstSeenMs",anchor-35*60_000).put("homeExpiresMs",anchor+23*60*60_000+25*60_000))
          .put(new JSONObject().put("symbol","ARCUSDT").put("timeframe","1m").put("price",0.03741)
          .put("binance24hChangePct",2.7).put("firstSeenMs",anchor-97*60_000).put("homeExpiresMs",anchor+22*60*60_000+23*60_000));
          universe=new JSONArray().put(new JSONObject().put("symbol","WALUSDT").put("timeframe","15m").put("price",0.05123)
           .put("binance24hChangePct",5.8).put("priority","HIGH"))
           .put(new JSONObject().put("symbol","ARCUSDT").put("timeframe","1m").put("price",0.03741)
           .put("binance24hChangePct",2.7).put("priority","STANDARD"));
          lastRefreshMs=System.currentTimeMillis();status.setText("DEMO OFFLINE • 0 REQUEST BINANCE");render();
        }catch(Exception ignored){}
    }
}

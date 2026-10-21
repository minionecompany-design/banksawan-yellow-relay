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
import android.widget.HorizontalScrollView;
import android.widget.EditText;
import android.text.TextWatcher;
import android.text.Editable;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.content.pm.PackageManager;

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
 * BANKSAWAN YELLOW V8 — RESEARCH NOTIFICATION PROOF, LIVE SHADOW.
 * Never fetches Binance itself. LIVE mode reads only the separate YELLOW API.
 * Long A foreground polling and YELLOW-only background FCM share one claim ledger.
 * Without a YELLOW_API_BASE_URL configured, the APK remains an explicit demo.
 */
public class MainActivity extends Activity {
    private final int BG=Color.rgb(9,17,28), CARD=Color.rgb(21,32,47);
    private final int LINE=Color.rgb(48,65,85), MUTED=Color.rgb(162,179,198);
    private final int YELLOW=Color.rgb(248,212,60), GREEN=Color.rgb(41,213,141);
    private LinearLayout list, root, bottom, header;
    private TextView status;
    private ScrollView scroll;
    private volatile boolean refreshInFlight=false;
    private long lastRefreshMs = 0L;
    private volatile long lastEventCursorMs = 0L;
    private volatile boolean connectionHealthy = false;
    private boolean pendingSoundSelfTest = false;
    private int lastCovered = 0;
    private int lastEligible = 0;
    private String tab="home";
    private UniverseSnapshot universeSnapshot;
    private String universeError="DATA TIDAK TERSEDIA",query="",sortColumn="binance24hChangePct";
    private boolean sortDescending=true;
    private LinearLayout universeRows;
    private TextView resultCount;
    private HorizontalScrollView universeScroller;
    private int universeScrollX=0;

    private JSONArray home=new JSONArray(), universe=new JSONArray();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Runnable refreshTask=new Runnable(){@Override public void run(){refresh();handler.postDelayed(this,5_000);}};
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
    /** Test only Android sound / permission; never creates a LONG A event or HOME card. */
    private void testNotificationSound(){
        if(BuildConfig.DEMO_MODE || !BuildConfig.ALERTS_ENABLED){
            Toast.makeText(this,"Tes suara tersedia pada APK V8 LIVE",Toast.LENGTH_LONG).show();return;
        }
        if(Build.VERSION.SDK_INT>=33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED){
            pendingSoundSelfTest=true;
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},1107);
            return;
        }
        boolean posted=YellowNotifier.testSound(this);
        Toast.makeText(this,posted?
            "Tes notifikasi dikirim. Periksa volume dan mode senyap HP.":
            "Tes gagal: izinkan notifikasi YELLOW pada pengaturan HP.",Toast.LENGTH_LONG).show();
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
        super.onRequestPermissionsResult(code,permissions,results);
        if(code==1107 && pendingSoundSelfTest){
            pendingSoundSelfTest=false;
            if(results.length>0 && results[0]==PackageManager.PERMISSION_GRANTED){
                testNotificationSound();
            }else Toast.makeText(this,"Izin notifikasi belum diberikan.",Toast.LENGTH_LONG).show();
        }
    }

    private void pollLongAEvents(){
        if(BuildConfig.DEMO_MODE || !BuildConfig.ALERTS_ENABLED || !connectionHealthy || lastEventCursorMs<=0) return;
        final long cursor=lastEventCursorMs;
        io.execute(()->{
            try{
                JSONArray events=loadJson("/api/events?afterMs="+cursor).getJSONArray("events");
                long maxSeen=cursor;
                for(int i=0;i<events.length();i++){
                    JSONObject e=events.optJSONObject(i);if(e==null)continue;
                    long detected=e.optLong("detectedAtMs",0);
                    if(detected>maxSeen)maxSeen=detected;
                    long now=System.currentTimeMillis();
                    String signal=e.optString("signal","");
                    if(!("LONG_A".equals(signal)||"LONG_B".equals(signal))||
                      e.optLong("expiresAtMs",0)<=now||detected<=cursor)continue;
                    String symbol=e.optString("symbol","");
                    String tf=e.optString("timeframe","");
                    String id=e.optString("id","");
                    boolean oneB="LONG_B".equals(signal);
                    if(!symbol.matches("[A-Z0-9]{2,25}USDT")||
                       !((oneB&&tf.equals("1m"))||(!oneB&&(tf.equals("5m")||tf.equals("15m")||tf.equals("1h"))))||
                       !id.equals(symbol+":"+tf+":"+e.optLong("barClosedAtMs",-1)+":"+signal))continue;
                    YellowNotifier.claimAndNotify(this,signal,id,symbol,tf,
                      e.optLong("barClosedAtMs",-1),e.optLong("expiresAtMs",0),
                      e.optDouble("price",0),e.optDouble("binance24hChangePct",0),
                      e.optDouble("quoteVolume24h",Double.NaN),
                      oneB?e.optLong("episodeStartedAtMs",0):0,
                      oneB?e.optLong("protectAtMs",0):0,
                      oneB?e.optDouble("firstAPrice",Double.NaN):Double.NaN,
                      oneB?e.optDouble("firstAChangePct",Double.NaN):Double.NaN);
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
        // Android 15 edge-to-edge: HOME/UNIVERSE below status bar and tabs above nav bar.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int topInset = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? insets.getInsets(WindowInsets.Type.statusBars()).top
                : insets.getSystemWindowInsetTop();
            int bottomInset = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? insets.getInsets(WindowInsets.Type.navigationBars()).bottom
                : insets.getSystemWindowInsetBottom();
            root.setPadding(dp(16), topInset + dp(10), dp(16), bottomInset + dp(8));
            return insets;
        });
        setContentView(root);
        header=new LinearLayout(this);header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);header.setPadding(0,dp(3),0,dp(14));
        header.addView(text("BANKSAWAN YELLOW",24,YELLOW,true));
        root.addView(header);
        status=text("MENUNGGU DATA",13,GREEN,true);status.setGravity(Gravity.CENTER);
        status.setPadding(dp(8),dp(12),dp(8),dp(12));status.setBackground(shape(CARD,LINE));root.addView(status);
        scroll=new ScrollView(this);scroll.setFillViewport(true);
        list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);list.setPadding(0,dp(14),0,dp(14));scroll.addView(list);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        bottom=new LinearLayout(this);bottom.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(bottom);renderTabs();render();
    }
    private void renderTabs(){bottom.removeAllViews();for(String name:new String[]{"home","universe"}){
        boolean selected=tab.equals(name);Button b=new Button(this);b.setText(name.toUpperCase(Locale.ROOT));
        b.setTextColor(selected?BG:MUTED);b.setTextSize(16);b.setAllCaps(false);
        b.setBackground(shape(selected?YELLOW:CARD,selected?YELLOW:LINE));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(55),1);lp.setMargins(dp(3),dp(3),dp(3),dp(3));bottom.addView(b,lp);
        b.setOnClickListener(v->{tab=name;scroll.scrollTo(0,0);renderTabs();render();});}}
    private String formattedTime(long t){SimpleDateFormat f=new SimpleDateFormat("dd MMM HH:mm",new Locale("id","ID"));
        f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));return f.format(new Date(t))+" WIB";}
    private String number(double n){return String.format(Locale.US,n<1?"%.6f":"%.3f",n);}
    /** BR-style detail: small left label, medium/bold right value with true column alignment. */
    private void line(LinearLayout parent,String label,String value){
        LinearLayout row=new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0,dp(7),0,dp(7));
        TextView left=text(label,12,MUTED,false);
        left.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
        TextView right=text(value,14,Color.WHITE,true);
        right.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);
        right.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_END);
        row.addView(left,new LinearLayout.LayoutParams(0,-2,1.1f));
        row.addView(right,new LinearLayout.LayoutParams(0,-2,1.35f));
        parent.addView(row);
    }
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
        double price=item.optDouble("price",0);
        String eventType=item.optString("signal","LONG_A");
        line(box,isHome?(BuildConfig.DEMO_MODE?"Harga sinyal (DEMO):":"Harga "+eventType+":"):
            (BuildConfig.DEMO_MODE?"Harga contoh:":"Harga terakhir:"),number(price)+" USDT");
        line(box,BuildConfig.DEMO_MODE?"Perubahan Binance 24H (DEMO):":"Perubahan Binance 24H:",
            String.format(Locale.US,"%+.2f%%",item.optDouble("binance24hChangePct")));
        if(isHome){line(box,"Timeframe "+eventType,item.optString("timeframe","1m").toUpperCase(Locale.ROOT));
            if("LONG_B".equals(eventType)){
                line(box,"LONG A awal (senyap)",formattedTime(item.optLong("episodeStartedAtMs",0)));
                line(box,"PROTECT",formattedTime(item.optLong("protectAtMs",0)));
            }
            long first=item.optLong("firstSeenMs",0);
            line(box,"Mulai HOME",formattedTime(first));}
        else line(box,"Prioritas:",item.optString("priority","STANDARD"));
        if (isHome) tradingView(symbol,box);
    }
    /**
     * UNIVERSE is an observation-only, Binance-style market table.
     * No TradingView URL, webview, or click listener is attached to any row.
     * Server values are displayed read-only; the Android app never calls Binance.
     */
    private void renderUniverse() {
        list.addView(text("UNIVERSE",24,YELLOW,true));
        TextView filters=text("USDⓈ-M USDT PERPETUAL • AKTIF\n0 < harga < 10 • 24H ≥ +1% • Quote 24H > 10M USDT",12,MUTED,false);
        filters.setPadding(0,dp(8),0,dp(12));list.addView(filters);
        boolean fresh=universeSnapshot!=null && (BuildConfig.DEMO_MODE ||
            (connectionHealthy&&System.currentTimeMillis()-universeSnapshot.generatedAtMs<30_000));
        if(!fresh){
            list.addView(text(universeSnapshot!=null?"STALE":universeError,16,YELLOW,true));
            list.addView(text("Eligible Universe: —   •   Actively Tracked: —",13,MUTED,false));
            list.addView(text("Jumlah kandidat belum dapat diverifikasi. Bukan berarti pasar kosong.",13,MUTED,false));return;
        }
        if(universeSnapshot.partial)list.addView(text("DATA TIDAK LENGKAP / STALE • Jumlah di bawah hanya yang terverifikasi",12,YELLOW,true));
        list.addView(text("Eligible Universe: "+universeSnapshot.eligible,18,Color.WHITE,true));
        list.addView(text("Actively Tracked: "+universeSnapshot.tracked+" / "+universeSnapshot.capacity+" kapasitas",14,GREEN,true));
        list.addView(text(BuildConfig.DEMO_MODE?"DEMO OFFLINE • FIXTURE • BUKAN DATA LIVE":
            "Snapshot "+shortTime(universeSnapshot.generatedAtMs)+" WIB",11,YELLOW,false));
        EditText search=new EditText(this);search.setSingleLine(true);search.setTextColor(Color.WHITE);
        search.setHintTextColor(MUTED);search.setHint("Cari simbol, mis. PLAY");search.setText(query);
        search.setContentDescription("Cari simbol UNIVERSE");list.addView(search,new LinearLayout.LayoutParams(-1,dp(52)));
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence t,int st,int count,int after){}
            public void onTextChanged(CharSequence t,int st,int before,int count){query=t.toString();renderUniverseRows();}
            public void afterTextChanged(Editable t){}
        });
        resultCount=text("",12,MUTED,false);list.addView(resultCount);
        universeScroller=new HorizontalScrollView(this);universeScroller.setHorizontalScrollBarEnabled(true);
        universeRows=new LinearLayout(this);universeRows.setOrientation(LinearLayout.VERTICAL);
        universeScroller.addView(universeRows);list.addView(universeScroller);
        universeScroller.setOnScrollChangeListener((v,x,y,oldX,oldY)->universeScrollX=x);
        universeScroller.post(()->universeScroller.scrollTo(universeScrollX,0));renderUniverseRows();
    }
    private final String[] universeKeys={"symbol","price","binance24hChangePct","quoteVolume24h","tracked"};
    private final String[] universeTitles={"Symbol","Last Price\nUSDT","Change %\n24H","Quote Volume\nUSDT / 24H","Status"};
    private final int[] universeWidths={144,128,120,160,112};
    private void renderUniverseRows(){
        if(universeRows==null||universeSnapshot==null)return;
        universeRows.removeAllViews();LinearLayout headings=new LinearLayout(this);
        for(int i=0;i<universeKeys.length;i++){
            final String key=universeKeys[i];TextView h=text(universeTitles[i]+(key.equals(sortColumn)?(sortDescending?" ↓":" ↑"):" ↕"),12,YELLOW,true);
            h.setPadding(dp(8),dp(8),dp(8),dp(8));h.setGravity(i==0?Gravity.START:Gravity.END);
            h.setContentDescription("Urutkan "+universeTitles[i]);headings.addView(h,new LinearLayout.LayoutParams(dp(universeWidths[i]),dp(64)));
            h.setOnClickListener(v->{sortDescending=key.equals(sortColumn)?!sortDescending:!key.equals("symbol");sortColumn=key;renderUniverseRows();});
        }
        headings.setBackgroundColor(CARD);universeRows.addView(headings);
        ArrayList<JSONObject> selected=universeSnapshot.select(query,sortColumn,sortDescending);
        resultCount.setText(selected.size()+" hasil • Geser tabel ↔ • Ketuk judul untuk urutkan");
        for(JSONObject coin:selected)addUniverseRow(coin);
        if(selected.isEmpty())universeRows.addView(text(query.isEmpty()?"Tidak ada kontrak yang lolos filter pada snapshot valid ini.":"Simbol tidak ditemukan pada snapshot ini.",13,MUTED,false));
    }

    private String shortTime(long ms) {
        SimpleDateFormat format = new SimpleDateFormat("HH:mm:ss", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));
        return format.format(new Date(ms));
    }

    private void addUniverseRow(JSONObject coin) {
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setMinimumHeight(dp(64));
        String[] values={coin.optString("symbol"),number(coin.optDouble("price")),
            String.format(Locale.US,"%+.2f%%",coin.optDouble("binance24hChangePct")),
            String.format(Locale.US,"%,.2f",coin.optDouble("quoteVolume24h")),coin.optBoolean("tracked")?"TRACKED":"ELIGIBLE"};
        for(int i=0;i<values.length;i++){
            TextView cell=text(values[i],i==0?15:13,i==2?GREEN:Color.WHITE,i==0||i==2);
            cell.setPadding(dp(8),dp(12),dp(8),dp(12));cell.setGravity(i==0?Gravity.START:Gravity.END);
            row.addView(cell,new LinearLayout.LayoutParams(dp(universeWidths[i]),-2));
        }
        universeRows.addView(row);View divider=new View(this);divider.setBackgroundColor(LINE);
        universeRows.addView(divider,new LinearLayout.LayoutParams(-1,dp(1)));
    }

    private void render() {
        final int previousScroll=scroll.getScrollY();
        scroll.post(()->scroll.scrollTo(0,previousScroll));
        list.removeAllViews();
        boolean isUniverse = tab.equals("universe");
        header.setVisibility(isUniverse ? View.GONE : View.VISIBLE);
        status.setVisibility(isUniverse && connectionHealthy ? View.GONE : View.VISIBLE);

        if (isUniverse) {
            renderUniverse();
            return;
        }

        TextView heading = text("HOME", 22, Color.WHITE, true);
        heading.setPadding(0, 0, 0, dp(8));
        list.addView(heading);
        

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
            String signal = item.optString("signal", "");
            boolean oneB = "LONG_B".equals(signal)&&tf.equals("1m");
            boolean regularA = "LONG_A".equals(signal)&&(tf.equals("5m")||tf.equals("15m")||tf.equals("1h"));
            if (!(oneB||regularA))continue;
            if (oneB && !(item.optLong("episodeStartedAtMs",0)>0 &&
                item.optLong("protectAtMs",0)>item.optLong("episodeStartedAtMs",0) &&
                item.optLong("barClosedAtMs",0)>item.optLong("protectAtMs",0) &&
                item.optLong("barClosedAtMs",0)<=item.optLong("episodeStartedAtMs",0)+120*60000L &&
                item.optLong("barClosedAtMs",0)-item.optLong("protectAtMs",0)<=90*60000L &&
                item.optDouble("firstAPrice",Double.NaN)>0 &&
                item.optDouble("firstAPrice",Double.NaN)<10 &&
                item.optDouble("firstAChangePct",Double.NaN)>=1))continue;
            if (!Double.isFinite(price) || price <= 0 || (!oneB && price >= 10)
                || !Double.isFinite(pct) || (!oneB && pct < 1)
                || !Double.isFinite(item.optDouble("quoteVolume24h",Double.NaN))
                || item.optDouble("quoteVolume24h",0)<=10_000_000
                 ) continue;
            card(symbol, item, true);
            count++;
        }
        if (count == 0) {
            list.addView(text("Belum ada LONG A / LONG B yang dapat ditampilkan", 14, MUTED, false));
        }

    }
    /** Fail closed on disconnected or stale YELLOW market data; never fall back to demo. */
    private void refresh(){
        if(BuildConfig.DEMO_MODE){setDemo();return;}
        if(refreshInFlight)return;
        refreshInFlight=true;
        io.execute(()->{
            try{
                JSONObject statusReply=loadJson("/api/status");
                UniverseSnapshot.compatible(statusReply);
                JSONObject guard=statusReply.optJSONObject("requestGuard");
                long now=System.currentTimeMillis();
                long tickerAt=statusReply.optLong("lastTickerDataAtMs",0);
                long klineAt=statusReply.optLong("lastKlineDataAtMs",0);
                int covered=statusReply.optInt("covered",-1);
                int eligible=statusReply.optInt("eligible",-1);
                int maximum=statusReply.optInt("maxTracked",-1);
                boolean tickerFresh=tickerAt>0 && tickerAt<=now+10_000L
                    && now-tickerAt<30_000L;
                boolean klineFresh=covered==0 || (klineAt>0 && klineAt<=now+10_000L
                    && now-klineAt<300_000L);
                if(!statusReply.optBoolean("ok",false)
                    || !"LIVE_SHADOW".equals(statusReply.optString("mode",""))
                    || !statusReply.optBoolean("tickerConnected",false)
                    || !statusReply.optBoolean("klineConnected",false)
                    || guard==null || guard.optBoolean("circuitOpen",true)
                    || covered<0 || maximum<1 || maximum>200 || covered>maximum
                    || !tickerFresh || !klineFresh){
                    throw new IllegalStateException("YELLOW_MARKET_NOT_READY_OR_STALE");
                }
                JSONObject homeReply=loadJson("/api/home");
                JSONObject universeReply=loadJson("/api/universe");
                verifyLive(homeReply);
                verifyLive(universeReply);
                JSONArray newHome=homeReply.getJSONArray("home");
                UniverseSnapshot parsedSnapshot=null;String parsedError="";
                try{parsedSnapshot=UniverseSnapshot.parse(universeReply,System.currentTimeMillis());}
                catch(UniverseSnapshot.DataException e){parsedError=e.label;}
                final UniverseSnapshot snapshot=parsedSnapshot;final String snapshotError=parsedError;
                JSONArray newUniverse=universeReply.getJSONArray("universe");
                JSONObject coverage=universeReply.getJSONObject("coverage");
                int newCovered=coverage.getInt("covered");
                int newEligible=coverage.optInt("eligible",-1);
                if(newCovered<0||newCovered>maximum||(snapshot!=null&&newEligible<0))
                    throw new IllegalStateException("INVALID_SCANNER_COVERAGE");
                runOnUiThread(()->{
                    home=newHome;universe=newUniverse;universeSnapshot=snapshot;universeError=snapshotError;
                    lastCovered=newCovered;lastEligible=newEligible;
                    lastRefreshMs=System.currentTimeMillis();
                    connectionHealthy=true;
                    status.setText("Eligible: "+(newEligible>=0?String.valueOf(newEligible):"—")+" • Tracked: "+newCovered+" / "+maximum);
                    if(tab.equals("universe") && getCurrentFocus() instanceof EditText)renderUniverseRows();else render();
                });
            }catch(Exception err){
                runOnUiThread(()->{
                    // Clear all last-known prices and signals. Never display stale data as LIVE.
                    connectionHealthy=false;universeSnapshot=null;
                    universeError=err instanceof UniverseSnapshot.DataException?((UniverseSnapshot.DataException)err).label:
                        ("YELLOW_MARKET_NOT_READY_OR_STALE".equals(err.getMessage())?"STALE":"DATA TIDAK TERSEDIA");
                    home=new JSONArray();universe=new JSONArray();
                    lastCovered=0;lastEligible=0;lastRefreshMs=0;
                    status.setText(universeError);
                    render();
                });
            }finally{refreshInFlight=false;}
        });
    }
    private void verifyLive(JSONObject response)throws Exception {
        if(response.optBoolean("simulation",true)
            || !"LIVE_SHADOW".equals(response.optString("mode","")))
            throw new IllegalStateException("REJECT_NON_LIVE_API_PAYLOAD");
    }
    private JSONObject loadJson(String route)throws Exception {
      HttpURLConnection c=(HttpURLConnection)new URL(BuildConfig.API_BASE_URL+route).openConnection();
      c.setUseCaches(false);c.setConnectTimeout(2000);c.setReadTimeout(2000);c.setRequestMethod("GET");
      try{if(c.getResponseCode()!=200)throw new IllegalStateException("HTTP "+c.getResponseCode());
        StringBuilder b=new StringBuilder();try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
          String line;while((line=reader.readLine())!=null)b.append(line);}
        JSONObject response=new JSONObject(b.toString());if(response.optBoolean("simulation",false))throw new IllegalStateException("Simulation endpoint");
        return response;
      }finally{c.disconnect();}
    }
    private void setDemo(){
        try{
            // Packaged synthetic fixture only; no URL, no subscriptions or notifications.
            String json;
            try(java.io.InputStream stream=getAssets().open("universe-preview.json")){
                BufferedReader reader=new BufferedReader(new InputStreamReader(stream,StandardCharsets.UTF_8));
                StringBuilder data=new StringBuilder();String line;while((line=reader.readLine())!=null)data.append(line);json=data.toString();
            }
            JSONObject fixture=new JSONObject(json);long now=System.currentTimeMillis();
            fixture.put("generatedAtMs",now).put("lastTickerDataAtMs",now);
            JSONArray rows=fixture.getJSONArray("universe");
            for(int i=0;i<rows.length();i++)rows.getJSONObject(i).put("tickerObservedAtMs",now);
            universeSnapshot=UniverseSnapshot.parse(fixture,now);universe=rows;
            lastRefreshMs=now;status.setText("DEMO OFFLINE • 0 REQUEST BINANCE");
            if(!(tab.equals("universe")&&getCurrentFocus() instanceof EditText))render();
        }catch(Exception e){universeError="DATA TIDAK TERSEDIA";universeSnapshot=null;render();}
    }
}

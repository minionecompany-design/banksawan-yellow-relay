package id.banksawan.yellow;

import android.app.Activity;
import android.app.AlertDialog;
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
    private boolean backendIncompatible = false;
    private boolean analysisAvailable = false;
    private long analysisRequest = 0;
    private AlertDialog analysisDialog;
    private boolean pendingSoundSelfTest = false;
    private int lastCovered = 0;
    private int lastEligible = 0;
    private String tab="home";
    private JSONArray home=new JSONArray(), universe=new JSONArray();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final ExecutorService analysisIo=Executors.newSingleThreadExecutor();
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
    @Override protected void onDestroy(){handler.removeCallbacks(refreshTask);handler.removeCallbacks(eventsTask);
        analysisRequest++;if(analysisDialog!=null)analysisDialog.dismiss();analysisIo.shutdownNow();io.shutdownNow();super.onDestroy();}
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
                    if(!"LONG_A".equals(e.optString("signal"))||
                      e.optLong("expiresAtMs",0)<=now||detected<=cursor)continue;
                    String symbol=e.optString("symbol","");
                    String tf=e.optString("timeframe","");
                    String id=e.optString("id","");
                    if(!symbol.matches("[A-Z0-9]{1,25}USDT") ||
                       !(tf.equals("1m")||tf.equals("5m")||tf.equals("15m")||tf.equals("1h"))||
                       !id.equals(symbol+":"+tf+":"+e.optLong("barClosedAtMs",-1)+":LONG_A")) continue;
                    YellowNotifier.claimAndNotify(this,id,symbol,tf,
                      e.optLong("barClosedAtMs",-1),e.optLong("expiresAtMs",0),
                      e.optDouble("price",0),e.optDouble("binance24hChangePct",0),
                       e.optDouble("quoteVolume24h",Double.NaN));
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
        status=text("MENUNGGU DATA",13,YELLOW,true);status.setGravity(Gravity.CENTER);
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
        row.setPadding(0,dp(2),0,dp(2));
        TextView left=text(label,12,MUTED,false);
        left.setSingleLine(true);
        left.setEllipsize(android.text.TextUtils.TruncateAt.END);
        left.setIncludeFontPadding(false);
        left.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
        TextView right=text(value,14,Color.WHITE,true);
        right.setSingleLine(true);
        right.setIncludeFontPadding(false);
        right.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);
        right.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_END);
        row.addView(left,new LinearLayout.LayoutParams(0,-2,0.9f));
        row.addView(right,new LinearLayout.LayoutParams(0,-2,1.55f));
        parent.addView(row);
    }
    private static Uri tradingViewSymbolUri(String symbol){
        // A symbol-specific, public HTTPS page is less vulnerable to the
        // last-used chart layout than /chart/?symbol= after TradingView updates.
        // No private/undocumented TradingView app URI scheme is assumed.
        if(symbol==null||!symbol.matches("[A-Z0-9]{1,25}USDT"))return null;
        return new Uri.Builder().scheme("https").authority("www.tradingview.com")
            .appendPath("symbols").appendPath(symbol+".P")
            .appendQueryParameter("exchange","BINANCE").build();
    }
    private void tradingView(String symbol,LinearLayout parent){
        Button b=new Button(this);b.setText("BUKA TRADINGVIEW ↗");b.setTextColor(BG);
        b.setTextSize(12);b.setMinHeight(0);b.setMinimumHeight(0);b.setPadding(dp(8),0,dp(8),0);
        b.setBackground(shape(Color.rgb(51,179,229),0));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(40));
        p.setMargins(0,dp(8),0,0);parent.addView(b,p);
        b.setOnClickListener(v->{
            Uri uri=tradingViewSymbolUri(symbol);if(uri==null)return;
            Intent app=new Intent(Intent.ACTION_VIEW,uri);
            app.addCategory(Intent.CATEGORY_BROWSABLE);
            app.addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT);
            app.setPackage("com.tradingview.tradingviewapp");
            try{startActivity(app);}
            catch(Exception unavailable){
                Intent browser=new Intent(Intent.ACTION_VIEW,uri);
                browser.addCategory(Intent.CATEGORY_BROWSABLE);
                try{startActivity(browser);}catch(Exception ignored){}
            }
        });
        // Same UI: holding the existing button explicitly opens a browser
        // fallback so an app release that ignores a symbol link is diagnosable.
        b.setOnLongClickListener(v->{
            Uri uri=tradingViewSymbolUri(symbol);if(uri==null)return true;
            Intent chrome=new Intent(Intent.ACTION_VIEW,uri);
            chrome.addCategory(Intent.CATEGORY_BROWSABLE);
            chrome.setPackage("com.android.chrome");
            try{startActivity(chrome);}
            catch(Exception unavailable){
                Intent browser=new Intent(Intent.ACTION_VIEW,uri);
                browser.addCategory(Intent.CATEGORY_BROWSABLE);
                try{startActivity(browser);}catch(Exception ignored){}
            }
            return true;
        });
    }
    private void card(String symbol,JSONObject item,boolean isHome){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(12),dp(10),dp(12),dp(10));
        box.setBackground(shape(CARD,LINE));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
        p.setMargins(0,0,0,dp(8));list.addView(box,p);
        box.addView(text(symbol,24,Color.WHITE,true));
        double price=item.optDouble(isHome?"price":"price",0);
        line(box,isHome?(BuildConfig.DEMO_MODE?"Harga LONG A (DEMO):":"Harga LONG A:"):
            (BuildConfig.DEMO_MODE?"Harga contoh:":"Harga terakhir:"),number(price)+" USDT");
        line(box,BuildConfig.DEMO_MODE?"Chg % 24H (DEMO)":"Chg % 24H",
            String.format(Locale.US,"%+.2f%%",item.optDouble("binance24hChangePct")));
        if(isHome){line(box,"Timeframe",item.optString("timeframe","1m").toUpperCase(Locale.ROOT));
            long first=item.optLong("firstSeenMs",0);
            line(box,"Mulai",formattedTime(first));}
        else line(box,"Prioritas:",item.optString("priority","STANDARD"));
        if (isHome) {
            String analysisId=AnalysisSnapshot.homeEventId(item);
            if(analysisAvailable&&!analysisId.isEmpty()){
                JSONObject preview=AnalysisSnapshot.homePreview(item,System.currentTimeMillis());
                if(preview!=null){
                    boolean expired=System.currentTimeMillis()>=preview.optLong("expiresAtMs");
                    TextView heading=text(expired?"LEVEL SAAT SINYAL • ENTRY KEDALUWARSA":
                        "SKENARIO LONG A • OBSERVASI",14,YELLOW,true);
                    heading.setPadding(0,dp(10),0,dp(4));box.addView(heading);
                    analysisHomeLine(box,"ENTRY",analysisPrice(preview.optDouble("entryLow"))+" – "+
                        analysisPrice(preview.optDouble("entryHigh")),Color.WHITE);
                    analysisHomeLine(box,"SL",analysisPrice(preview.optDouble("stopLoss")),Color.rgb(255,155,125));
                    analysisHomeLine(box,"TP1",analysisPrice(preview.optDouble("tp1")),GREEN);
                    analysisHomeLine(box,"TP2 / TP3",analysisPrice(preview.optDouble("tp2"))+" / "+
                        analysisPrice(preview.optDouble("tp3")),GREEN);
                    if(preview.optBoolean("trendConflict",false))
                        analysisHomeNote(box,"PERHATIAN: ada tren TF turun.");
                    if(preview.optBoolean("resistanceBeforeTp1",false))
                        analysisHomeNote(box,"PERHATIAN: resistance sebelum TP1.");
                    if(expired)analysisHomeNote(box,"Level historis, BUKAN entry saat ini.");
                }else if(item.optBoolean("analysisCaptured",false)){
                    analysisHomeNote(box,"ENTRY / SL / TP belum tersedia • data analisis tidak lengkap.");
                }else analysisHomeNote(box,"ENTRY / SL / TP belum tersedia untuk LONG A ini.");
            }
            tradingView(symbol,box);
            if(analysisAvailable&&item.optBoolean("analysisCaptured",false)&&!analysisId.isEmpty())analysisButton(analysisId,box);
        }
    }

    private void analysisHomeLine(LinearLayout parent,String label,String value,int color){
        TextView row=text(label+": "+value,16,color,true);
        row.setPadding(0,dp(3),0,dp(3));parent.addView(row);
    }
    private void analysisHomeNote(LinearLayout parent,String value){
        TextView note=text(value,14,MUTED,false);
        note.setPadding(0,dp(3),0,dp(3));parent.addView(note);
    }

    private void analysisButton(String eventId,LinearLayout parent){
        Button button=new Button(this);button.setText("ANALISIS");button.setTextColor(YELLOW);button.setTextSize(12);
        button.setMinHeight(0);button.setMinimumHeight(0);button.setPadding(dp(8),0,dp(8),0);
        button.setBackground(shape(CARD,LINE));
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,dp(36));params.setMargins(0,dp(6),0,0);
        parent.addView(button,params);button.setOnClickListener(v->openAnalysis(eventId));
    }
    // On-demand, separate executor: analysis requests never queue ahead of event polling.
    void openAnalysis(String eventId){
        if(!AnalysisSnapshot.validId(eventId)||isFinishing()||isDestroyed())return;
        final long request=++analysisRequest;
        if(analysisDialog!=null)analysisDialog.dismiss();
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18),dp(18),dp(18),dp(8));content.setBackgroundColor(BG);
        TextView loading=text("Memuat analisis saat LONG A…",15,YELLOW,true);content.addView(loading);
        ScrollView body=new ScrollView(this);body.addView(content);
        final AlertDialog dialog=new AlertDialog.Builder(this).setView(body).setPositiveButton("TUTUP",null).create();
        analysisDialog=dialog;dialog.show();
        if(dialog.getWindow()!=null)dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(YELLOW);
        analysisIo.execute(()->{
            try{
                JSONObject reply=loadJson("/api/analysis?eventId="+Uri.encode(eventId));
                AnalysisSnapshot snapshot=AnalysisSnapshot.parse(reply,eventId,System.currentTimeMillis());
                runOnUiThread(()->{if(request==analysisRequest&&!isDestroyed()&&dialog.isShowing())
                    renderAnalysis(content,snapshot,System.currentTimeMillis());});
            }catch(Exception unavailable){runOnUiThread(()->{
                if(request!=analysisRequest||isDestroyed()||!dialog.isShowing())return;
                content.removeAllViews();content.addView(text("Analisis belum tersedia untuk sinyal ini.",16,YELLOW,true));
                content.addView(text("Sinyal LONG A tetap dapat diperiksa melalui TradingView.",13,MUTED,false));
            });}
        });
    }
    private String analysisPrice(double value){return java.math.BigDecimal.valueOf(value)
        .round(new java.math.MathContext(10,java.math.RoundingMode.HALF_UP)).stripTrailingZeros().toPlainString();}
    private String optionalPrice(JSONObject object,String key){return object==null||object.isNull(key)?"Belum ada":analysisPrice(object.optDouble(key));}
    private void analysisNote(LinearLayout parent,String message,int color){
        TextView note=text(message,13,color,false);note.setPadding(0,dp(8),0,dp(8));parent.addView(note);
    }
    private void analysisValue(LinearLayout parent,String label,String value){
        TextView title=text(label,12,MUTED,false);title.setPadding(0,dp(7),0,dp(2));parent.addView(title);
        parent.addView(text(value,16,Color.WHITE,true));
    }
    void renderAnalysis(LinearLayout content,AnalysisSnapshot snapshot,long nowMs){
        JSONObject a=snapshot.data;content.removeAllViews();
        content.addView(text(a.optString("symbol")+" • "+a.optString("timeframe").toUpperCase(Locale.ROOT),21,YELLOW,true));
        analysisNote(content,"Analisis saat LONG A • dalam pengujian",YELLOW);
        analysisNote(content,"Sinyal: "+formattedTime(a.optLong("signalAtMs"))+"\nHarga dan level di bawah adalah catatan saat sinyal.",MUTED);
        if(nowMs>=a.optLong("expiresAtMs"))analysisNote(content,"Skenario entry sudah kedaluwarsa.",YELLOW);
        if("PARTIAL".equals(a.optString("availability")))analysisNote(content,"Data empat TF belum lengkap. Skenario entry belum dibuat.",YELLOW);
        JSONArray frames=a.optJSONArray("frames");
        for(int i=0;i<frames.length();i++){
            JSONObject f=frames.optJSONObject(i);String trend=f.optString("trend");
            String label=!"READY".equals(f.optString("availability"))?"DATA BELUM LENGKAP":
                "UP".equals(trend)?"NAIK":"DOWN".equals(trend)?"TURUN":"CAMPURAN";
            line(content,"Tren "+f.optString("timeframe").toUpperCase(Locale.ROOT),label);
            if(f.optString("timeframe").equals(a.optString("timeframe"))&&!f.isNull("relativeVolume")&&f.has("relativeVolume"))
                line(content,"Volume relatif",String.format(Locale.US,"%.2fx",f.optDouble("relativeVolume")));
        }
        JSONObject levels=a.optJSONObject("levels");
        if(levels!=null){
            line(content,"Support",optionalPrice(levels,"support"));line(content,"Resistance",optionalPrice(levels,"resistance"));
            String state=levels.optString("interaction");
            line(content,"Kondisi",state.equals("BREAKOUT")?"BREAKOUT":state.equals("RETEST")?"RETEST":
                state.equals("BREAKDOWN")?"BREAKDOWN":"DALAM RENTANG");
        }
        JSONObject plan=a.optJSONObject("plan");
        if(plan!=null){
            analysisNote(content,"Skenario estimasi saat sinyal",YELLOW);
            analysisValue(content,"Zona entry",analysisPrice(plan.optDouble("entryLow"))+" – "+analysisPrice(plan.optDouble("entryHigh")));
            analysisValue(content,"Stop loss",analysisPrice(plan.optDouble("stopLoss")));
            for(String target:new String[]{"tp1","tp2","tp3"})analysisValue(content,target.toUpperCase(Locale.ROOT),analysisPrice(plan.optDouble(target)));
            line(content,"Jarak SL",String.format(Locale.US,"%.2f%%",plan.optDouble("riskPct")));
        }else analysisNote(content,"Skenario entry / TP / SL belum dapat dihitung dari data ini.",MUTED);
        JSONArray warnings=a.optJSONArray("warnings");
        for(int i=0;i<warnings.length();i++){
            String warning=warnings.optString(i);
            if("TREND_CONFLICT".equals(warning))analysisNote(content,"Ada TF dengan tren turun.",YELLOW);
            if("RESISTANCE_WITHIN_1R".equals(warning))analysisNote(content,"Resistance terdekat berada sebelum target TP1.",YELLOW);
        }
        JSONObject paper=a.optJSONObject("paper");String outcome=paper.optString("status");
        String result=outcome.equals("TP1_BEFORE_SL")?"TP1 lebih dahulu":outcome.equals("SL_BEFORE_TP1")?"SL lebih dahulu":
            outcome.equals("AMBIGUOUS")?"Urutan TP/SL tidak diketahui":outcome.equals("INCOMPLETE_DATA")?"Data lanjutan tidak lengkap":
            outcome.equals("NOT_ENTERED")?"Harga pembukaan di luar zona":outcome.equals("TIMEOUT")?"Batas waktu 120 menit":
            outcome.equals("OPEN")?"Masih diamati":outcome.equals("WAITING_ENTRY")?"Menunggu candle setelah deteksi":"Tanpa skenario";
        analysisNote(content,"Catatan simulasi: "+result+". Pengamatan memakai candle 1M; TP dan SL dalam candle yang sama dicatat ambigu.",MUTED);
        analysisNote(content,"Keputusan entry tetap di tangan Anda. Hasil pengujian belum membuktikan akurasi atau keuntungan.",MUTED);
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
            double quoteVolume = coin.optDouble("quoteVolume24h", Double.NaN);
            if (!symbol.matches("[A-Z0-9]{1,25}USDT")
                || !Double.isFinite(price) || price <= 0 || price >= 10.0
                || !Double.isFinite(change) || change <= 1.0
                || !Double.isFinite(quoteVolume) || quoteVolume <= 10_000_000.0) continue;
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
                : backendIncompatible ? "DATA BACKEND BELUM SESUAI • TANPA DATA LIVE"
                : "SERVER / FEED TIDAK SIAP • DATA TIDAK TERBARU";
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
            TextView empty = text(emptyUniverseMessage(BuildConfig.DEMO_MODE || connectionHealthy, backendIncompatible),
                13, MUTED, false);
            empty.setPadding(0, dp(18), 0, 0);
            list.addView(empty);
        }
    }

    static String emptyUniverseMessage(boolean ready, boolean incompatible) {
        if (incompatible) return "Data backend belum sesuai. Daftar koin belum dapat ditampilkan.";
        if (!ready) return "Data pasar belum tersedia. Jumlah koin yang memenuhi filter belum dapat ditentukan.";
        return "Belum ada koin yang memenuhi filter Binance 24H > +1%, 0 < harga < 10 USDT, dan volume 24H > 10.000.000 USDT.";
    }

    static void verifyCoverage(int covered, int eligible, int maximum) {
        if(covered<0 || eligible<0 || maximum<1 || maximum>50 || covered>maximum || covered>eligible)
            throw new IllegalStateException("YELLOW_BACKEND_INCOMPATIBLE");
    }

    static void verifyUniverseSnapshot(JSONArray rows, int covered, int eligible, int maximum) {
        verifyCoverage(covered,eligible,maximum);
        if(rows==null || rows.length()!=eligible) throw new IllegalStateException("YELLOW_BACKEND_INCOMPATIBLE");
        java.util.HashSet<String> symbols=new java.util.HashSet<>();
        int scanning=0;
        for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.optJSONObject(i);
            if(row==null) throw new IllegalStateException("YELLOW_BACKEND_INCOMPATIBLE");
            String symbol=row.optString("symbol","");
            double price=row.optDouble("price",Double.NaN),change=row.optDouble("binance24hChangePct",Double.NaN);
            double volume=row.optDouble("quoteVolume24h",Double.NaN);
            String coverage=row.optString("coverage","");
            if(!symbol.matches("[A-Z0-9]{1,25}USDT") || !symbols.add(symbol)
                || !Double.isFinite(price) || price<=0 || price>=10
                || !Double.isFinite(change) || change<=1
                || !Double.isFinite(volume) || volume<=10_000_000
                || !("SCANNING".equals(coverage)||"BOOTSTRAPPING".equals(coverage)||"QUEUED".equals(coverage)))
                throw new IllegalStateException("YELLOW_BACKEND_INCOMPATIBLE");
            if("SCANNING".equals(coverage))scanning++;
        }
        if(scanning!=covered)throw new IllegalStateException("YELLOW_BACKEND_INCOMPATIBLE");
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
        TextView perp = text(coin.optBoolean("stale",false) ? "Perp • STALE" : "Perp", 12, MUTED, false);
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
            if (!symbol.matches("[A-Z0-9]{1,25}USDT")) continue;
            double price = item.optDouble("price", Double.NaN);
            double pct = item.optDouble("binance24hChangePct", Double.NaN);
            double quoteVolume = item.optDouble("quoteVolume24h", Double.NaN);
            String tf = item.optString("timeframe", "");
            if (!Double.isFinite(price) || price <= 0 || price >= 10
                || !Double.isFinite(pct) || pct <= 1
                 || !Double.isFinite(quoteVolume) || quoteVolume <= 10_000_000.0
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
        if(refreshInFlight)return;
        refreshInFlight=true;
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
                verifyCoverage(covered,eligible,maximum);
                boolean tickerFresh=tickerAt>0 && tickerAt<=now+10_000L
                    && now-tickerAt<30_000L;
                boolean klineFresh=covered==0 || (klineAt>0 && klineAt<=now+10_000L
                    && now-klineAt<300_000L);
                if(!statusReply.optBoolean("ok",false)
                    || !"LIVE_SHADOW".equals(statusReply.optString("mode",""))
                    || !statusReply.optBoolean("tickerConnected",false)
                    || !statusReply.optBoolean("klineConnected",false)
                    || guard==null || guard.optBoolean("circuitOpen",true)
                    || covered<0 || eligible<0 || maximum<1 || maximum>50 || covered>maximum
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
                verifyUniverseSnapshot(newUniverse,newCovered,newEligible,coverage.optInt("maxTracked",-1));
                final boolean hasAnalysis=homeReply.optBoolean("analysisAvailable",false);
                runOnUiThread(()->{analysisAvailable=hasAnalysis;applyLiveSnapshot(newHome,newUniverse,newCovered,newEligible);});
            }catch(Exception err){
                runOnUiThread(()->applyRefreshFailure(err));
            }finally{refreshInFlight=false;}
        });
    }
    // UI-thread publication shared by the refresh path and offline Activity tests.
    void applyLiveSnapshot(JSONArray newHome,JSONArray newUniverse,int newCovered,int newEligible) {
        home=newHome;universe=newUniverse;
        lastCovered=newCovered;lastEligible=newEligible;
        lastRefreshMs=System.currentTimeMillis();
        connectionHealthy=true;backendIncompatible=false;
        status.setTextColor(GREEN);
        status.setText("LIVE SHADOW • "+newCovered+"/"+newEligible+" DIPINDAI");
        render();
    }
    void applyRefreshFailure(Exception err) {
        // Clear all last-known prices and signals. Never display stale data as LIVE.
        connectionHealthy=false;
        analysisAvailable=false;
        backendIncompatible="YELLOW_BACKEND_INCOMPATIBLE".equals(err.getMessage());
        home=new JSONArray();universe=new JSONArray();
        lastCovered=0;lastEligible=0;lastRefreshMs=0;
        status.setTextColor(YELLOW);
        if(backendIncompatible)status.setText("DATA BACKEND BELUM SESUAI • TANPA DATA LIVE");
        else status.setText("SERVER / FEED TIDAK SIAP • TANPA DATA LIVE");
        render();
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
    private void setDemo(){long now=System.currentTimeMillis();
        long anchor=getSharedPreferences("yellow_demo",MODE_PRIVATE).getLong("demoAnchorMs",0);
        if(anchor==0){anchor=now;getSharedPreferences("yellow_demo",MODE_PRIVATE).edit().putLong("demoAnchorMs",anchor).apply();}
        try{home=new JSONArray().put(new JSONObject().put("symbol","WALUSDT").put("timeframe","15m").put("price",0.05123)
          .put("binance24hChangePct",5.8).put("quoteVolume24h",20_000_000).put("firstSeenMs",anchor-35*60_000).put("homeExpiresMs",anchor+23*60*60_000+25*60_000))
          .put(new JSONObject().put("symbol","ARCUSDT").put("timeframe","1m").put("price",0.03741)
          .put("binance24hChangePct",2.7).put("quoteVolume24h",20_000_000).put("firstSeenMs",anchor-97*60_000).put("homeExpiresMs",anchor+22*60*60_000+23*60_000));
          universe=new JSONArray().put(new JSONObject().put("symbol","WALUSDT").put("timeframe","15m").put("price",0.05123)
           .put("binance24hChangePct",5.8).put("quoteVolume24h",20_000_000).put("priority","HIGH"))
           .put(new JSONObject().put("symbol","ARCUSDT").put("timeframe","1m").put("price",0.03741)
           .put("binance24hChangePct",2.7).put("quoteVolume24h",20_000_000).put("priority","STANDARD"));
          lastRefreshMs=System.currentTimeMillis();status.setText("DEMO OFFLINE • 0 REQUEST BINANCE");render();
        }catch(Exception ignored){}
    }
}

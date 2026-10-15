package id.banksawan.yellow;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
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
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * BANKSAWAN YELLOW V2 — read-only native Android UI, two tabs only.
 * Default APK is OFFLINE DEMO. It does NOT trade, query Binance, or push alerts.
 * A future backend URL can be injected at build time via YELLOW_API_BASE_URL.
 */
public class MainActivity extends Activity {
    private final int BG=Color.rgb(9,17,28), CARD=Color.rgb(21,32,47);
    private final int LINE=Color.rgb(48,65,85), MUTED=Color.rgb(162,179,198);
    private final int YELLOW=Color.rgb(248,212,60), GREEN=Color.rgb(41,213,141);
    private LinearLayout list, root, bottom;
    private TextView status;
    private String tab="home";
    private JSONArray home=new JSONArray(), universe=new JSONArray();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Runnable refreshTask=new Runnable(){@Override public void run(){refresh();handler.postDelayed(this,60_000);}};

    @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);buildShell();}
    @Override protected void onResume(){super.onResume();handler.post(refreshTask);}
    @Override protected void onPause(){handler.removeCallbacks(refreshTask);super.onPause();}
    @Override protected void onDestroy(){handler.removeCallbacks(refreshTask);io.shutdownNow();super.onDestroy();}
    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private GradientDrawable shape(int color,int stroke){GradientDrawable g=new GradientDrawable();g.setColor(color);
        g.setCornerRadius(dp(16));if(stroke!=0)g.setStroke(dp(1),stroke);return g;}
    private TextView text(String msg,int size,int color,boolean bold){TextView t=new TextView(this);
        t.setText(msg);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(null,Typeface.BOLD);return t;}
    private void buildShell(){
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(BG);
        root.setPadding(dp(16),dp(20),dp(16),dp(8));setContentView(root);
        LinearLayout header=new LinearLayout(this);header.setOrientation(LinearLayout.HORIZONTAL);header.setGravity(Gravity.CENTER_VERTICAL);
        ImageView image=new ImageView(this);image.setImageResource(R.drawable.yellow_logo);image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        header.addView(image,new LinearLayout.LayoutParams(dp(70),dp(70)));
        LinearLayout titleBlock=new LinearLayout(this);titleBlock.setOrientation(LinearLayout.VERTICAL);
        titleBlock.setPadding(dp(12),0,0,0);titleBlock.addView(text("BANKSAWAN YELLOW",22,YELLOW,true));
        titleBlock.addView(text("LONG A MTF • Scanner independen",12,MUTED,false));
        header.addView(titleBlock);root.addView(header);
        TextView banner=text("DEMO OFFLINE • BUKAN SINYAL ENTRY",13,YELLOW,true);
        banner.setText(BuildConfig.DEMO_MODE ? "DEMO OFFLINE • BUKAN SINYAL ENTRY" : "LONG A • BUKAN PERINTAH TRANSAKSI");
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
        tradingView(symbol,box);
    }
    private void render(){list.removeAllViews();
        String title=tab.equals("home")?"HOME":"UNIVERSE";
        TextView heading=text(title,26,Color.WHITE,true);heading.setPadding(0,0,0,dp(8));list.addView(heading);
        TextView subtitle=text(tab.equals("home")?"LONG A • 24 jam per simbol":"Binance 24 jam ≥ +1% • Harga <10 USDT",13,MUTED,false);
        subtitle.setPadding(0,0,0,dp(17));list.addView(subtitle);
        JSONArray items=tab.equals("home")?home:universe;int count=0;
        for(int i=0;i<items.length();i++){JSONObject obj=items.optJSONObject(i);if(obj==null)continue;
          if(tab.equals("home") && obj.optLong("homeExpiresMs",0)<=System.currentTimeMillis())continue;
          String symbol=obj.optString("symbol","");if(!symbol.matches("[A-Z0-9]{2,25}USDT"))continue;
          card(symbol,obj,tab.equals("home"));count++;}
        if(count==0)list.addView(text(tab.equals("home")?
            "Belum ada LONG A yang dapat ditampilkan":"Belum ada simbol memenuhi filter",14,MUTED,false));
    }
    private void refresh(){
      if(BuildConfig.DEMO_MODE){setDemo();return;}
      io.execute(()->{
        try{JSONArray newHome=load("/api/home","home"),newUniverse=load("/api/universe","universe");
            runOnUiThread(()->{home=newHome;universe=newUniverse;status.setText("TERHUBUNG • "+universe.length()+" KOIN");render();});
        }catch(Exception err){runOnUiThread(()->status.setText("SERVER BELUM TERHUBUNG"));}
      });
    }
    private JSONArray load(String route,String field)throws Exception {
      HttpURLConnection c=(HttpURLConnection)new URL(BuildConfig.API_BASE_URL+route).openConnection();
      c.setConnectTimeout(5000);c.setReadTimeout(5000);c.setRequestMethod("GET");
      try{if(c.getResponseCode()!=200)throw new IllegalStateException("HTTP "+c.getResponseCode());
        StringBuilder b=new StringBuilder();try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
          String line;while((line=reader.readLine())!=null)b.append(line);}
        JSONObject response=new JSONObject(b.toString());if(response.optBoolean("simulation",false))throw new IllegalStateException("Simulation endpoint");
        return response.getJSONArray(field);
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
          status.setText("DEMO OFFLINE • 0 REQUEST BINANCE");render();
        }catch(Exception ignored){}
    }
}

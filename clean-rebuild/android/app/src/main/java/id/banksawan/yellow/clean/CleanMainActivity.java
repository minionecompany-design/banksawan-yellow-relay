package id.banksawan.yellow.clean;
import android.app.Activity;
import id.banksawan.yellow.BuildConfig;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.HorizontalScrollView;
import android.widget.TextView;
import android.widget.EditText;
import android.text.TextWatcher;
import android.text.Editable;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Locale;
/** Offline QA visual shell. Reference: YELLOW V2 HOME/UNIVERSE theme and table.
 * NO external data calls, fabricated symbols or alerts.
 */
public final class CleanMainActivity extends Activity {
 private static final int BG=Color.rgb(9,17,28),CARD=Color.rgb(21,32,47),
  LINE=Color.rgb(48,65,85),YELLOW=Color.rgb(248,212,60),
  GREEN=Color.rgb(41,213,141),BLUE=Color.rgb(52,177,224),MUTED=Color.rgb(162,179,198);
 private LinearLayout page,bottom,header;private TextView status;
 private ScrollView scroller;private String tab="home";
 private CleanViewModel.Home homeData;
 private JSONObject universeData;
 private String universeQuery="",sortKey="binance24hChangePct";
 private boolean descending=true;
 private boolean qaFixtureMode=false;
 private boolean qaExternalChartTestMode=false;
 private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
 private GradientDrawable shape(int fill,int stroke){
  GradientDrawable g=new GradientDrawable();g.setColor(fill);g.setCornerRadius(dp(12));
  if(stroke!=0)g.setStroke(dp(1),stroke);return g;
 }
 private TextView text(String value,int size,int color,boolean bold){
  TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);
  if(bold)t.setTypeface(null,Typeface.BOLD);return t;
 }
 @Override public void onCreate(Bundle state){
  super.onCreate(state);getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
  root.setBackgroundColor(BG);root.setPadding(dp(16),dp(10),dp(16),dp(8));
  // Android edge-to-edge: keep both header and bottom tabs clear of system bars.
  root.setOnApplyWindowInsetsListener((v,insets)->{
   root.setPadding(dp(16),insets.getSystemWindowInsetTop()+dp(10),
     dp(16),insets.getSystemWindowInsetBottom()+dp(10));
   return insets;
  });
  header=new LinearLayout(this);header.setPadding(0,dp(3),0,dp(14));header.addView(text("BANKSAWAN YELLOW",24,YELLOW,true));root.addView(header);
  status=text("OFFLINE QA • DATA TIDAK TERSEDIA",13,YELLOW,true);
  status.setGravity(Gravity.CENTER);status.setPadding(dp(8),dp(12),dp(8),dp(12));status.setBackground(shape(CARD,LINE));root.addView(status);
  scroller=new ScrollView(this);scroller.setFillViewport(true);
  page=new LinearLayout(this);page.setOrientation(LinearLayout.VERTICAL);page.setPadding(0,dp(14),0,dp(14));scroller.addView(page);
  root.addView(scroller,new LinearLayout.LayoutParams(-1,0,1));
  bottom=new LinearLayout(this);bottom.setOrientation(LinearLayout.HORIZONTAL);root.addView(bottom);
  setContentView(root);root.requestApplyInsets();showPage("home");
  qaFixtureMode=BuildConfig.DEBUG&&getPackageName().equals("id.banksawan.yellow.qa")&&
   getIntent()!=null&&getIntent().getBooleanExtra("yellow.qa.fixture",false);
  if(qaFixtureMode)loadQaHomeFixture();
  // Real Android PendingIntent.send() proof only for explicitly requested QA.
  if(qaFixtureMode&&getIntent().getBooleanExtra("yellow.qa.pendingIntentProbe",false)){
   android.app.PendingIntent play=QaPendingIntentProbe.create(this,"PLAYUSDT","1m",60000L);
   android.app.PendingIntent fogo=QaPendingIntentProbe.create(this,"FOGOUSDT","5m",300000L);
   String chosen=getIntent().getStringExtra("yellow.qa.target");
   try{
    if("PLAYUSDT".equals(chosen))play.send();
    else if("FOGOUSDT".equals(chosen))fogo.send();
    else throw new IllegalArgumentException("INVALID_QA_TARGET");
   }catch(android.app.PendingIntent.CanceledException e){
    throw new IllegalStateException("QA_PENDING_INTENT_FAILURE",e);
   }
  }
 }
 /** Synthetic signals only for explicitly requested isolated debug emulator QA.
  * Never sourced from markets, never published to FCM or notifications. */
 private void loadQaHomeFixture(){
  try{
   JSONObject source=new JSONObject().put("schemaVersion","yellow-clean-v1").put("dataState","OK").put("count",2);
   JSONArray list=new JSONArray();
   boolean reversed=getIntent().getBooleanExtra("yellow.qa.reversed",false);
   String[] symbols=reversed?new String[]{"FOGOUSDT","PLAYUSDT"}:new String[]{"PLAYUSDT","FOGOUSDT"};
   for(String symbol:symbols){
    String tf="PLAYUSDT".equals(symbol)?"1m":"5m";
    long end="PLAYUSDT".equals(symbol)?60000L:300000L;
    list.put(new JSONObject().put("id",symbol+":"+tf+":"+end+":LONG_A")
     .put("symbol",symbol).put("timeframe",tf).put("barClosedAtMs",end)
     .put("signal","LONG_A").put("tradingViewUrl",CleanViewModel.chartUrl(symbol)));
   }
   homeData=CleanViewModel.parseHome(source.put("events",list));
   status.setText("SIMULASI QA • BUKAN LIVE / BUKAN SINYAL PASAR");
   showPage("home");
  }catch(Exception e){throw new IllegalStateException("QA_FIXTURE_INVALID",e);}
 }
 /** An explicit, validated offline fixture can be injected by QA tests only. */
 public void renderContractSnapshots(JSONObject home,JSONObject universe){
  homeData=CleanViewModel.parseHome(home);
  CleanViewModel.parseUniverse(universe);
  universeData=universe;
  showPage(tab);
 }
 private void showPage(String next){
  tab=next;scroller.scrollTo(0,0);page.removeAllViews();bottom.removeAllViews();
  boolean universe="universe".equals(tab);
  header.setVisibility(android.view.View.VISIBLE);
  status.setVisibility(android.view.View.VISIBLE);
  for(String label:new String[]{"home","universe"}){
   boolean chosen=tab.equals(label);Button b=new Button(this);
   b.setText(label.toUpperCase(Locale.ROOT));b.setAllCaps(false);b.setTextSize(17);
   b.setTypeface(null,Typeface.BOLD);
   b.setSingleLine(true);b.setMinWidth(0);b.setMinimumWidth(0);
   b.setPadding(0,0,0,0);
   b.setTextColor(chosen?BG:MUTED);b.setBackground(shape(chosen?YELLOW:CARD,chosen?YELLOW:LINE));
   LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(55),1);p.setMargins(dp(3),dp(3),dp(3),dp(3));
   bottom.addView(b,p);b.setOnClickListener(v->showPage(label));
  }
  if(universe)renderUniverse();else renderHome();
 }
 private void row(LinearLayout card,String name,String value){
  LinearLayout r=new LinearLayout(this);r.setGravity(Gravity.CENTER_VERTICAL);r.setPadding(0,dp(7),0,dp(7));
  TextView left=text(name,14,MUTED,false),right=text(value,15,Color.WHITE,true);right.setGravity(Gravity.END);
  r.addView(left,new LinearLayout.LayoutParams(0,-2,1.1f));r.addView(right,new LinearLayout.LayoutParams(0,-2,1.35f));card.addView(r);
 }
 private LinearLayout card(String title){
  LinearLayout c=new LinearLayout(this);c.setOrientation(LinearLayout.VERTICAL);
  c.setPadding(dp(19),dp(19),dp(19),dp(17));c.setBackground(shape(CARD,LINE));
  LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(13);
  page.addView(c,p);c.addView(text(title,22,Color.WHITE,true));return c;
 }
 private void renderHome(){
  TextView title=text("HOME",24,Color.WHITE,true);
  title.setPadding(0,dp(10),0,dp(14));page.addView(title);
  boolean qa=qaFixtureMode||qaExternalChartTestMode;
  if(qa){
   TextView warning=text("SIMULASI QA — BUKAN SINYAL PASAR",12,YELLOW,true);
   warning.setPadding(0,0,0,dp(8));page.addView(warning);
  }
  if(BuildConfig.DEBUG&&"id.banksawan.yellow.qa".equals(getPackageName())&&!qaFixtureMode){
   Button qaButton=new Button(this);
   if(qaExternalChartTestMode){
    qaButton.setText("TUTUP KARTU SIMULASI");
    qaButton.setOnClickListener(v->{
     qaExternalChartTestMode=false;homeData=null;
     status.setText("OFFLINE QA • DATA TIDAK TERSEDIA");showPage("home");
    });
   }else if(homeData==null||homeData.unavailable){
    qaButton.setText("UJI SHORTCUT PLAY / FOGO (SIMULASI)");
    qaButton.setOnClickListener(v->{qaExternalChartTestMode=true;loadQaHomeFixture();});
   }
   if(qaExternalChartTestMode||homeData==null||homeData.unavailable){
    qaButton.setTextSize(13);qaButton.setAllCaps(false);page.addView(qaButton);
   }
  }
  if(homeData!=null&&!homeData.unavailable&&!homeData.signals.isEmpty()){
   for(CleanViewModel.Signal signal:homeData.signals){
    LinearLayout item=card(signal.symbol);
    row(item,"Harga LONG A:","—");
    row(item,"Perubahan Binance 24H:","—");
    row(item,"Timeframe LONG A:",signal.timeframe.toUpperCase(Locale.ROOT));
    String time=signal.closedAt<1_577_836_800_000L?"—":
       new java.text.SimpleDateFormat("dd MMM HH:mm 'WIB'",new Locale("id","ID")){{
        setTimeZone(java.util.TimeZone.getTimeZone("Asia/Jakarta"));
       }}.format(new java.util.Date(signal.closedAt));
    row(item,"Mulai HOME:",time);
    // Price/change omitted until the event contract carries validated values.
    // No made-up Rp prices, symbol or market data in the offline QA APK.
    Button chart=new Button(this);chart.setText("BUKA TRADINGVIEW ↗");
    chart.setAllCaps(false);chart.setTextSize(16);chart.setTextColor(BG);
    chart.setBackground(shape(BLUE,0));
    chart.setContentDescription("QA_CHART_"+signal.symbol);
    LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(-1,dp(52));
    bp.topMargin=dp(12);item.addView(chart,bp);
    chart.setOnClickListener(v->{
     android.content.Intent intent=new android.content.Intent(
       android.content.Intent.ACTION_VIEW,android.net.Uri.parse(signal.chartUrl));
     intent.addCategory(android.content.Intent.CATEGORY_BROWSABLE);
     if(qaFixtureMode)intent.setClass(this,QaChartCaptureActivity.class);
     try{startActivity(intent);}
     catch(Exception e){android.util.Log.e("YELLOW_CHART","CHART_OPEN_FAILED",e);}
    });
   }
   return;
  }
  LinearLayout unavailable=card(homeData!=null&&!homeData.unavailable?
    "BELUM ADA LONG A":"DATA TIDAK TERSEDIA");
  TextView hint=text("Notifikasi nonaktif • QA offline",14,MUTED,false);
  hint.setPadding(0,dp(10),0,0);unavailable.addView(hint);
 }
 private void renderUniverse(){
  TextView title=text("UNIVERSE",24,Color.WHITE,true);
  title.setPadding(0,dp(10),0,dp(10));page.addView(title);
  if(universeData==null||!"OK".equals(universeData.optString("dataState"))){
   TextView info=text("DATA TIDAK TERSEDIA",17,YELLOW,true);
   info.setPadding(0,dp(16),0,dp(6));page.addView(info);
   page.addView(text("— / 50 DIPINDAI",15,MUTED,false));
   return;
  }
  renderActiveUniverse();
 }
 private String priceUSDT(double price){
  return java.math.BigDecimal.valueOf(price).stripTrailingZeros().toPlainString().replace('.',',');
 }
 private void marketRow(JSONObject coin){
  LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.CENTER_VERTICAL);
  line.setPadding(0,dp(11),0,dp(11));page.addView(line);
  LinearLayout symbolCol=new LinearLayout(this);symbolCol.setOrientation(LinearLayout.VERTICAL);
  String symbol=coin.optString("symbol");
  TextView symbolName=text(symbol,16,Color.WHITE,true);
  symbolName.setSingleLine(true);symbolName.setEllipsize(android.text.TextUtils.TruncateAt.END);
  symbolCol.addView(symbolName);
  TextView perp=text("Perp",11,MUTED,false);symbolCol.addView(perp);
  line.addView(symbolCol,new LinearLayout.LayoutParams(0,-2,1.5f));
  TextView price=text(priceUSDT(coin.optDouble("price")),15,Color.WHITE,true);
  price.setSingleLine(true);price.setGravity(Gravity.END);
  price.setPadding(dp(3),0,dp(6),0);
  line.addView(price,new LinearLayout.LayoutParams(0,-2,0.85f));
  double delta=coin.optDouble("binance24hChangePct");
  TextView change=text(String.format(Locale.US,"%+.2f%%",delta).replace('.',','),14,Color.WHITE,true);
  change.setGravity(Gravity.CENTER);change.setPadding(dp(3),dp(11),dp(3),dp(11));
  change.setBackground(shape(delta>=0?Color.rgb(17,183,127):Color.rgb(213,73,79),0));
  LinearLayout.LayoutParams changeParams=new LinearLayout.LayoutParams(0,-2,0.85f);
  changeParams.leftMargin=dp(5);line.addView(change,changeParams);
 }
 private void renderActiveUniverse(){
  CleanViewModel.Universe parsed=CleanViewModel.parseUniverse(universeData);
  TextView counts=text(parsed.tracked+"/"+parsed.eligible+" DIPINDAI",15,GREEN,true);
  counts.setPadding(0,dp(5),0,dp(16));page.addView(counts);
  LinearLayout headings=new LinearLayout(this);
  headings.setPadding(0,0,0,dp(6));page.addView(headings);
  TextView a=text("USDⓈ-M",12,MUTED,false);
  headings.addView(a,new LinearLayout.LayoutParams(0,-2,1.5f));
  TextView b=text("Harga Terakhir",12,MUTED,false);
  b.setGravity(Gravity.END);headings.addView(b,new LinearLayout.LayoutParams(0,-2,0.85f));
  TextView d=text("Prbh% 24j",12,MUTED,false);
  d.setGravity(Gravity.END);headings.addView(d,new LinearLayout.LayoutParams(0,-2,0.85f));
  JSONArray rows=universeData.optJSONArray("universe");
  ArrayList<JSONObject> selected=new ArrayList<>();
  for(int i=0;i<rows.length();i++){
   JSONObject coin=rows.optJSONObject(i);
   if(coin!=null)selected.add(coin);
  }
  // Eligible universe includes every matching coin, not merely 50 tracked slots.
  selected.sort((x,y)->{
   int score=Double.compare(y.optDouble("binance24hChangePct"),
                            x.optDouble("binance24hChangePct"));
   return score!=0?score:x.optString("symbol").compareTo(y.optString("symbol"));
  });
  for(JSONObject coin:selected)marketRow(coin);
  if(selected.isEmpty())page.addView(text("Belum ada simbol yang memenuhi filter.",15,MUTED,false));
 }
}

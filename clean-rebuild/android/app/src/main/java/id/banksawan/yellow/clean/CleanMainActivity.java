package id.banksawan.yellow.clean;
import android.app.Activity;
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
  GREEN=Color.rgb(41,213,141),MUTED=Color.rgb(162,179,198);
 private LinearLayout page,bottom,header;private TextView status;
 private ScrollView scroller;private String tab="home";
 private CleanViewModel.Home homeData;
 private JSONObject universeData;
 private String universeQuery="",sortKey="binance24hChangePct";
 private boolean descending=true;
 private boolean qaFixtureMode=false;
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
  header=new LinearLayout(this);header.setPadding(0,dp(3),0,dp(14));header.addView(text("BANKSAWAN YELLOW",24,YELLOW,true));root.addView(header);
  status=text("OFFLINE QA • DATA TIDAK TERSEDIA",13,YELLOW,true);
  status.setGravity(Gravity.CENTER);status.setPadding(dp(8),dp(12),dp(8),dp(12));status.setBackground(shape(CARD,LINE));root.addView(status);
  scroller=new ScrollView(this);scroller.setFillViewport(true);
  page=new LinearLayout(this);page.setOrientation(LinearLayout.VERTICAL);page.setPadding(0,dp(14),0,dp(14));scroller.addView(page);
  root.addView(scroller,new LinearLayout.LayoutParams(-1,0,1));
  bottom=new LinearLayout(this);bottom.setOrientation(LinearLayout.HORIZONTAL);root.addView(bottom);
  setContentView(root);showPage("home");
  qaFixtureMode=BuildConfig.DEBUG&&getPackageName().equals("id.banksawan.yellow.qa")&&
   getIntent()!=null&&getIntent().getBooleanExtra("yellow.qa.fixture",false);
  if(qaFixtureMode)loadQaHomeFixture();
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
  header.setVisibility(universe?android.view.View.GONE:android.view.View.VISIBLE);
  status.setVisibility(android.view.View.VISIBLE);
  for(String label:new String[]{"home","universe"}){
   boolean chosen=tab.equals(label);Button b=new Button(this);
   b.setText(label.toUpperCase());b.setAllCaps(false);b.setTextSize(16);
   b.setTextColor(chosen?BG:MUTED);b.setBackground(shape(chosen?YELLOW:CARD,chosen?YELLOW:LINE));
   LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(55),1);p.setMargins(dp(3),dp(3),dp(3),dp(3));
   bottom.addView(b,p);b.setOnClickListener(v->showPage(label));
  }
  if(universe)renderUniverse();else renderHome();
 }
 private void row(LinearLayout card,String name,String value){
  LinearLayout r=new LinearLayout(this);r.setGravity(Gravity.CENTER_VERTICAL);r.setPadding(0,dp(7),0,dp(7));
  TextView left=text(name,12,MUTED,false),right=text(value,14,Color.WHITE,true);right.setGravity(Gravity.END);
  r.addView(left,new LinearLayout.LayoutParams(0,-2,1.1f));r.addView(right,new LinearLayout.LayoutParams(0,-2,1.35f));card.addView(r);
 }
 private LinearLayout card(String title){
  LinearLayout c=new LinearLayout(this);c.setOrientation(LinearLayout.VERTICAL);
  c.setPadding(dp(19),dp(19),dp(19),dp(17));c.setBackground(shape(CARD,LINE));
  LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(13);
  page.addView(c,p);c.addView(text(title,22,Color.WHITE,true));return c;
 }
 private void renderHome(){
  page.addView(text("BANKSAWAN YELLOW • GOLD",14,YELLOW,true));
  TextView h=text("LONG A • 1M / 5M / 15M / 1H",17,Color.WHITE,true);h.setPadding(0,dp(12),0,dp(14));page.addView(h);
  if(qaFixtureMode)page.addView(text("SIMULASI QA — BUKAN SINYAL PASAR",13,YELLOW,true));
  if(homeData!=null&&!homeData.unavailable){
   for(CleanViewModel.Signal signal:homeData.signals){
    LinearLayout item=card(signal.symbol);
    row(item,"Sinyal","LONG A");
    row(item,"Timeframe",signal.timeframe.toUpperCase(Locale.ROOT));
    Button chart=new Button(this);chart.setText("BUKA TRADINGVIEW ↗");
    chart.setContentDescription("QA_CHART_"+signal.symbol);
    chart.setOnClickListener(v->{
     android.content.Intent intent=new android.content.Intent(android.content.Intent.ACTION_VIEW,android.net.Uri.parse(signal.chartUrl));
     intent.addCategory(android.content.Intent.CATEGORY_BROWSABLE);
     if(qaFixtureMode)intent.setClass(this,QaChartCaptureActivity.class);
     try{startActivity(intent);}catch(Exception e){android.util.Log.e("YELLOW_CHART","CHART_OPEN_FAILED",e);}
    });item.addView(chart);
   }
   if(!homeData.signals.isEmpty())return;
  }
  LinearLayout c=card(homeData!=null&&!homeData.unavailable?"BELUM ADA SINYAL":"DATA TIDAK TERSEDIA");
  row(c,"Status backend","DATA TIDAK TERSEDIA");
  row(c,"Notifikasi","NONAKTIF • QA");
  TextView note=text("Tidak ada kartu LONG A yang dibuat tanpa event valid. Tombol TradingView hanya muncul pada kartu simbol yang sah.",13,MUTED,false);
  note.setPadding(0,dp(12),0,0);c.addView(note);
 }
 private void renderUniverse(){
  page.addView(text("BANKSAWAN YELLOW • GOLD",14,YELLOW,true));
  TextView h=text("UNIVERSE",24,Color.WHITE,true);page.addView(h);
  TextView f=text("USDⓈ-M USDT PERPETUAL • AKTIF\n0 < harga < 10 • 24H ≥ +1% • Quote 24H > 10M USDT",12,MUTED,false);
  f.setPadding(0,dp(8),0,dp(12));page.addView(f);
  if(universeData!=null && "OK".equals(universeData.optString("dataState"))){
   renderActiveUniverse();return;
  }
  page.addView(text("DATA TIDAK TERSEDIA",16,YELLOW,true));
  TextView counts=text("Eligible Universe: —\nActively Tracked: — / 50 kapasitas",16,Color.WHITE,true);
  counts.setPadding(0,dp(10),0,dp(10));page.addView(counts);
  page.addView(text("Jumlah kandidat belum dapat diverifikasi. Bukan berarti pasar kosong.",13,MUTED,false));
  EditText search=new EditText(this);search.setSingleLine(true);search.setHint("Cari simbol, mis. PLAY");
  search.setTextColor(Color.WHITE);search.setHintTextColor(MUTED);search.setEnabled(false);
  page.addView(search,new LinearLayout.LayoutParams(-1,dp(52)));
  TextView result=text("— hasil • Geser tabel ↔ • Ketuk judul untuk urutkan",12,MUTED,false);
  result.setPadding(0,dp(8),0,dp(8));page.addView(result);
  HorizontalScrollView viewport=new HorizontalScrollView(this);viewport.setHorizontalScrollBarEnabled(true);
  LinearLayout table=new LinearLayout(this);table.setOrientation(LinearLayout.VERTICAL);viewport.addView(table);
  String[] labels={"Symbol ↕","Last Price\nUSDT ↕","Change %\n24H ↓","Quote Volume\nUSDT / 24H ↕","Status ↕"};
  int[] widths={144,128,120,160,112};
  LinearLayout headings=new LinearLayout(this);headings.setBackgroundColor(CARD);
  for(int i=0;i<labels.length;i++){
   TextView cell=text(labels[i],12,YELLOW,true);cell.setPadding(dp(8),dp(8),dp(8),dp(8));
   cell.setGravity(i==0?Gravity.START:Gravity.END);headings.addView(cell,new LinearLayout.LayoutParams(dp(widths[i]),dp(64)));
  }
  table.addView(headings);TextView unavailable=text("Feed offline: tabel tidak menampilkan simbol palsu.",13,MUTED,false);
  unavailable.setPadding(dp(8),dp(18),dp(8),dp(18));table.addView(unavailable);page.addView(viewport);
 }
 private void renderActiveUniverse(){
  CleanViewModel.Universe parsed=CleanViewModel.parseUniverse(universeData);
  page.addView(text("Eligible Universe: "+parsed.eligible,18,Color.WHITE,true));
  page.addView(text("Actively Tracked: "+parsed.tracked+" / 50 kapasitas",14,GREEN,true));
  EditText search=new EditText(this);search.setSingleLine(true);search.setText(universeQuery);
  search.setHint("Cari simbol, mis. PLAY");search.setTextColor(Color.WHITE);search.setHintTextColor(MUTED);
  page.addView(search,new LinearLayout.LayoutParams(-1,dp(52)));
  TextView count=text("",12,MUTED,false);page.addView(count);
  HorizontalScrollView viewport=new HorizontalScrollView(this);
  viewport.setHorizontalScrollBarEnabled(true);page.addView(viewport);
  LinearLayout rows=new LinearLayout(this);rows.setOrientation(LinearLayout.VERTICAL);viewport.addView(rows);
  String[] keys={"symbol","price","binance24hChangePct","quoteVolume24h","tracked"};
  String[] titles={"Symbol","Last Price USDT","Change % 24H","Quote Volume USDT / 24H","Status"};
  int[] widths={144,128,120,160,112};
  Runnable rebuild=()->{
   rows.removeAllViews();
   LinearLayout headings=new LinearLayout(this);headings.setBackgroundColor(CARD);rows.addView(headings);
   for(int i=0;i<keys.length;i++){
    final String key=keys[i];
    TextView cell=text(titles[i]+(key.equals(sortKey)?(descending?" ↓":" ↑"):" ↕"),12,YELLOW,true);
    cell.setPadding(dp(8),dp(10),dp(8),dp(10));
    headings.addView(cell,new LinearLayout.LayoutParams(dp(widths[i]),dp(68)));
    cell.setOnClickListener(v->{descending=key.equals(sortKey)?!descending:!"symbol".equals(key);
      sortKey=key;showPage("universe");});
   }
   ArrayList<JSONObject> selected=new ArrayList<>();
   JSONArray source=universeData.optJSONArray("universe");
   for(int i=0;i<source.length();i++){
    JSONObject coin=source.optJSONObject(i);
    if(coin!=null&&coin.optString("symbol").contains(universeQuery.toUpperCase(Locale.ROOT)))selected.add(coin);
   }
   selected.sort((a,b)->{
    int cmp;
    if("symbol".equals(sortKey))cmp=a.optString("symbol").compareTo(b.optString("symbol"));
    else if("tracked".equals(sortKey))cmp=Boolean.compare(a.optBoolean("tracked"),b.optBoolean("tracked"));
    else cmp=Double.compare(a.optDouble(sortKey),b.optDouble(sortKey));
    return cmp==0?a.optString("symbol").compareTo(b.optString("symbol")):(descending?-cmp:cmp);
   });
   count.setText(selected.size()+" hasil • Geser tabel ↔ • Ketuk judul untuk urutkan");
   for(JSONObject coin:selected){
    LinearLayout line=new LinearLayout(this);rows.addView(line);
    String[] values={coin.optString("symbol"),String.format(Locale.US,"%.5f",coin.optDouble("price")),
      String.format(Locale.US,"%+.2f%%",coin.optDouble("binance24hChangePct")),
      String.format(Locale.US,"%,.0f",coin.optDouble("quoteVolume24h")),coin.optBoolean("tracked")?"TRACKED":"ELIGIBLE"};
    for(int i=0;i<values.length;i++){
     TextView cell=text(values[i],i==0?15:13,i==2?GREEN:Color.WHITE,i==0);
     cell.setPadding(dp(8),dp(12),dp(8),dp(12));
     line.addView(cell,new LinearLayout.LayoutParams(dp(widths[i]),dp(58)));
    }
   }
   if(selected.isEmpty())rows.addView(text("Tidak ada hasil pada snapshot yang valid.",13,MUTED,false));
  };
  search.addTextChangedListener(new TextWatcher(){
   public void beforeTextChanged(CharSequence s,int st,int count,int after){}
   public void onTextChanged(CharSequence s,int st,int before,int count){universeQuery=s.toString();rebuild.run();}
   public void afterTextChanged(Editable e){}
  });
  rebuild.run();
 }
}

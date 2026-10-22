package id.banksawan.yellow.clean;
import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
/** Offline visual shell only. Two-tab layout mirrors V2 palette and navigation.
 * No source feed, notification, or TradingView launch enabled until QA.
 */
public final class CleanMainActivity extends Activity {
 private static final int BG=Color.rgb(9,17,28),CARD=Color.rgb(21,32,47);
 private static final int YELLOW=Color.rgb(248,212,60),MUTED=Color.rgb(162,179,198);
 private LinearLayout page;private Button homeTab,universeTab;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(BG);
  TextView brand=new TextView(this);brand.setText("BANKSAWAN YELLOW");
  brand.setTextSize(21);brand.setTextColor(YELLOW);brand.setTypeface(null,Typeface.BOLD);
  brand.setGravity(Gravity.CENTER);brand.setPadding(16,32,16,28);root.addView(brand);
  ScrollView viewport=new ScrollView(this);
  page=new LinearLayout(this);page.setPadding(14,10,14,18);page.setOrientation(LinearLayout.VERTICAL);
  viewport.addView(page);root.addView(viewport,new LinearLayout.LayoutParams(-1,0,1));
  LinearLayout tabs=new LinearLayout(this);tabs.setOrientation(LinearLayout.HORIZONTAL);
  homeTab=new Button(this);homeTab.setText("HOME");universeTab=new Button(this);universeTab.setText("UNIVERSE");
  tabs.addView(homeTab,new LinearLayout.LayoutParams(0,-2,1));
  tabs.addView(universeTab,new LinearLayout.LayoutParams(0,-2,1));root.addView(tabs);
  homeTab.setOnClickListener(v->showPage(false));
  universeTab.setOnClickListener(v->showPage(true));
  setContentView(root);showPage(false);
 }
 private void block(String heading,String sub){
  LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);
  GradientDrawable bg=new GradientDrawable();bg.setColor(CARD);bg.setCornerRadius(20);
  card.setBackground(bg);card.setPadding(18,16,18,20);
  TextView title=new TextView(this);title.setText(heading);title.setTextColor(YELLOW);
  title.setTypeface(null,Typeface.BOLD);title.setTextSize(17);card.addView(title);
  TextView body=new TextView(this);body.setText(sub);body.setTextColor(MUTED);
  body.setTextSize(14);body.setPadding(0,12,0,0);card.addView(body);
  LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=14;page.addView(card,lp);
 }
 private void showPage(boolean universe){
  page.removeAllViews();
  homeTab.setEnabled(universe);universeTab.setEnabled(!universe);
  if(universe){
   block("UNIVERSE","Eligible Universe: —\nActively Tracked: — / 50");
   block("DATA TIDAK TERSEDIA","Belum ada feed backend terverifikasi. Daftar simbol tidak direkayasa.");
  }else{
   block("HOME — LONG A","1M  •  5M  •  15M  •  1H");
   block("DATA TIDAK TERSEDIA","Mode pengujian offline. Belum ada kandidat atau notifikasi LIVE.");
  }
 }
}

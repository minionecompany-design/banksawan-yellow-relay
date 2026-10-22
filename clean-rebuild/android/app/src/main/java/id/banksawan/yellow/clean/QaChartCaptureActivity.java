package id.banksawan.yellow.clean;
import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.Gravity;
import android.net.Uri;
/**
 * NON-EXPORTED offline QA sink for verifying the real Android startActivity
 * destination. This is NOT TradingView; nothing is fetched from the Internet.
 */
public final class QaChartCaptureActivity extends Activity {
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  String symbol="";
  Uri data=getIntent()==null?null:getIntent().getData();
  if(data!=null&&"https".equals(data.getScheme())&&"www.tradingview.com".equals(data.getHost())){
   String q=data.getQueryParameter("symbol");
   if(q!=null&&q.matches("BINANCE:[A-Z0-9]{2,25}USDT\\.P"))symbol=q;
  }
  LinearLayout page=new LinearLayout(this);page.setOrientation(LinearLayout.VERTICAL);
  page.setPadding(32,56,32,32);page.setBackgroundColor(Color.rgb(9,17,28));
  TextView title=new TextView(this);title.setText("QA INTENT CAPTURE — BUKAN TRADINGVIEW");
  title.setTextColor(Color.rgb(248,212,60));title.setTextSize(17);title.setGravity(Gravity.CENTER);
  page.addView(title);
  TextView target=new TextView(this);target.setText(symbol.isEmpty()?"INVALID_CHART_TARGET":symbol);
  target.setTextColor(Color.WHITE);target.setTextSize(22);
  target.setPadding(0,40,0,20);page.addView(target);
  setContentView(page);
 }
}

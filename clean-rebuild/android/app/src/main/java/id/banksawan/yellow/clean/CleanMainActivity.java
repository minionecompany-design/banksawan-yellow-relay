package id.banksawan.yellow.clean;
import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.TextView;
import android.widget.LinearLayout;
/** Offline-only startup shell; final UI must match V2 reference by screenshot diffs. */
public final class CleanMainActivity extends Activity {
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
  root.setPadding(24,48,24,24);root.setBackgroundColor(Color.rgb(9,17,28));
  TextView title=new TextView(this);title.setText("BANKSAWAN YELLOW");
  title.setTextColor(Color.rgb(248,212,60));title.setTextSize(22);title.setGravity(Gravity.CENTER);
  root.addView(title);
  TextView status=new TextView(this);
  status.setText("CLEAN REBUILD — OFFLINE QA\nData pasar dan notifikasi belum aktif.");
  status.setTextColor(Color.WHITE);status.setPadding(0,32,0,0);
  root.addView(status);setContentView(root);
 }
}

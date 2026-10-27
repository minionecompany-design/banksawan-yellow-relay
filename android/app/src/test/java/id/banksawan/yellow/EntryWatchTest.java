package id.banksawan.yellow;
import android.view.View;import android.view.ViewGroup;import android.widget.LinearLayout;import android.widget.TextView;
import java.io.InputStream;import java.nio.charset.StandardCharsets;import java.util.ArrayList;
import org.json.JSONObject;import org.junit.Test;import org.junit.runner.RunWith;
import org.robolectric.Robolectric;import org.robolectric.RobolectricTestRunner;import org.robolectric.android.controller.ActivityController;import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class EntryWatchTest {
 private JSONObject sample()throws Exception{
  try(InputStream s=getClass().getResourceAsStream("/entry-watch-v1.json")){
   assertNotNull(s);return new JSONObject(new String(s.readAllBytes(),StandardCharsets.UTF_8));
  }
 }
 private String id(JSONObject a){return a.optJSONObject("entryWatch").optString("eventId");}
 private long now(JSONObject a){return a.optJSONObject("entryLight").optLong("checkedAtMs");}
 private void collect(View v,ArrayList<String> out){
  if(v instanceof TextView)out.add(((TextView)v).getText().toString());
  if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++)collect(((ViewGroup)v).getChildAt(i),out);
 }
 @Test public void realNodeWatchPassesFullIdentityAndPlanValidation()throws Exception{
  JSONObject a=sample();assertNotNull(AnalysisSnapshot.entryWatch(a.getJSONObject("entryWatch"),id(a),now(a)));
  assertEquals("GREEN",AnalysisSnapshot.watchAssessment(a,id(a),now(a)).getString("status"));
  assertNull(AnalysisSnapshot.watchAssessment(a,id(a).replace("QUSDT","WUSDT"),now(a)));
 }
 @Test public void corruptPlanCrossEventLightStaleQuoteAndExpiredGreenAreRejected()throws Exception{
  JSONObject a=sample();a.getJSONObject("entryWatch").getJSONObject("plan").put("stopLoss",2);
  assertNull(AnalysisSnapshot.watchAssessment(a,id(a),now(a)));
  a=sample();a.getJSONObject("entryLight").put("eventId",id(a).replace("QUSDT","WUSDT"));
  assertNull(AnalysisSnapshot.watchAssessment(a,id(a),now(a)));
  a=sample();a.getJSONObject("entryLight").put("tickerAtMs",now(a)-31000);
  assertNull(AnalysisSnapshot.watchAssessment(a,id(a),now(a)));
  a=sample();assertNull(AnalysisSnapshot.watchAssessment(a,id(a),a.getJSONObject("entryWatch").getLong("entryUntilMs")));
 }
 @Test public void currentEntryAndExpiryAreVisibleInDetailsWithoutRevivingASetup()throws Exception{
  JSONObject a=sample();
  try(ActivityController<MainActivity> c=Robolectric.buildActivity(MainActivity.class).create()){
   LinearLayout parent=new LinearLayout(c.get());parent.setOrientation(LinearLayout.VERTICAL);
   c.get().renderEntryWatch(parent,a,id(a),now(a));ArrayList<String> texts=new ArrayList<>();collect(parent,texts);
   assertTrue(texts.stream().anyMatch(t->t.contains("MENDUKUNG")));
   assertTrue(texts.contains("Zona entry baru"));assertTrue(texts.contains("Batas entry"));
   c.get().renderEntryWatch(parent,a,id(a),a.getJSONObject("entryWatch").getLong("entryUntilMs"));
   texts.clear();collect(parent,texts);assertTrue(texts.stream().anyMatch(t->t.contains("BERAKHIR")));
   assertFalse(texts.stream().anyMatch(t->t.contains("MENDUKUNG")));
  }
 }
 @Test public void oldExpiredLightSaysEndedRatherThanWait()throws Exception{
  assertEquals("BERAKHIR",AnalysisSnapshot.lightLabel(new JSONObject().put("status","YELLOW").put("reason","SKENARIO_KEDALUWARSA")));
  assertEquals("BERAKHIR",AnalysisSnapshot.lightLabel(new JSONObject().put("status","OFF").put("reason","SL_TERSENTUH")));
 }
}

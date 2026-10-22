package id.banksawan.yellow.clean;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.HashMap;
import java.util.Map;

/**
 * PRIVATE debug-only QA FCM opt-in screen. No changes to locked HOME/UNIVERSE.
 * Status-bar long press is the deliberate, non-obtrusive entry point.
 *
 * No token upload / logging; only user-initiated local clipboard copy.
 * FCM auto-init remains disabled until explicit permission+consent.
 */
public final class CleanFcmQaActivity extends Activity {
 private static final int PERMISSION_CODE=774;
 private TextView status;
 private Button copyToken,localTest;
 private String tokenInMemory;
 private boolean configured;
 private final int bg=Color.rgb(9,17,28),gold=Color.rgb(248,212,60);

 private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 private TextView label(String s,int size,int color){
  TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);
  t.setPadding(0,dp(9),0,dp(9));return t;
 }
 private Button button(LinearLayout host,String text){
  Button b=new Button(this);b.setAllCaps(false);b.setText(text);host.addView(b);
  return b;
 }
 private boolean isQa(){
  return id.banksawan.yellow.BuildConfig.DEBUG&&"id.banksawan.yellow.qa".equals(getPackageName());
 }
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);
  if(!isQa()){finish();return;}
  getWindow().setStatusBarColor(bg);getWindow().setNavigationBarColor(bg);
  configured=!FirebaseApp.getApps(this).isEmpty();
  ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(bg);
  LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);
  content.setPadding(dp(20),dp(24),dp(20),dp(48));scroll.addView(content);
  content.addView(label("YELLOW CLEAN • TES FCM",23,gold));
  content.addView(label("Khusus QA. Tidak ada sinyal pasar atau entry otomatis.",15,Color.WHITE));
  status=label("",15,Color.rgb(170,191,207));content.addView(status);
  Button enable=button(content,"AKTIFKAN FCM QA (IZIN NOTIFIKASI)");
  enable.setEnabled(configured);enable.setOnClickListener(v->enableWithPermission());
  Button refresh=button(content,"AMBIL TOKEN FIREBASE QA");
  refresh.setEnabled(configured);refresh.setOnClickListener(v->readToken());
  copyToken=button(content,"SALIN TOKEN PERANGKAT (PRIVAT)");
  copyToken.setEnabled(false);copyToken.setOnClickListener(v->copyTokenToClipboard());
  localTest=button(content,"UJI NOTIFIKASI LOKAL • PLAY (SIMULASI)");
  localTest.setOnClickListener(v->postLocalTest());
  Button disable=button(content,"NONAKTIFKAN FCM QA / CABUT IZIN APLIKASI");
  disable.setOnClickListener(v->disableQa());
  button(content,"KEMBALI KE YELLOW").setOnClickListener(v->finish());
  content.addView(label("Token adalah identitas perangkat. Jangan kirim ke chat, screenshot, log, atau repository.\n"+
    "Uji lokal bukan bukti FCM dari server. Ini tidak mengubah APK YELLOW V2.",13,
    Color.rgb(170,191,207)));
  setContentView(scroll);
  refreshStatus();
 }
 private void refreshStatus(){
  boolean allowed=CleanFcmConsent.allowed(this);
  if(!configured)status.setText("Firebase belum terkonfigurasi pada build QA ini. Gunakan APK Firebase QA baru.");
  else if(!allowed)status.setText("FCM QA NONAKTIF • menunggu izin dan persetujuan pengguna.");
  else status.setText("FCM QA DIIZINKAN • penerimaan push server belum diverifikasi.");
  if(localTest!=null)localTest.setEnabled(allowed);
 }
 private void enableWithPermission(){
  if(!configured||!isQa())return;
  if(Build.VERSION.SDK_INT>=33&&
      checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
   requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},PERMISSION_CODE);
   return;
  }
  enableNow();
 }
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
  super.onRequestPermissionsResult(code,permissions,results);
  if(code==PERMISSION_CODE){
   if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)enableNow();
   else{status.setText("Izin ditolak. FCM QA tetap NONAKTIF.");refreshStatus();}
  }
 }
 private void enableNow(){
  if(!configured||!isQa())return;
  try{
   CleanFcmConsent.recordConsent(this,true);
   FirebaseMessaging.getInstance().setAutoInitEnabled(true);
   status.setText("Persetujuan QA tercatat. Meminta token Firebase...");
   readToken();
  }catch(RuntimeException e){
   CleanFcmConsent.recordConsent(this,false);
   status.setText("Gagal mengaktifkan QA: konfigurasi/izin tidak lengkap.");
  }
  refreshStatus();
 }
 private void readToken(){
  if(!configured||!CleanFcmConsent.allowed(this)){refreshStatus();return;}
  FirebaseMessaging.getInstance().getToken()
   .addOnSuccessListener(token->{
    if(!CleanFcmConsent.allowed(this))return;
    tokenInMemory=token;copyToken.setEnabled(token!=null&&!token.isEmpty());
    status.setText("Token perangkat QA tersedia. Belum ada pengiriman FCM dari backend.");
   })
   .addOnFailureListener(error->{
    tokenInMemory=null;copyToken.setEnabled(false);
    status.setText("Token belum tersedia. Periksa layanan Google Play dan koneksi.");
   });
 }
 private void copyTokenToClipboard(){
  if(!CleanFcmConsent.allowed(this)||tokenInMemory==null||tokenInMemory.isEmpty())return;
  ClipboardManager clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
  if(clipboard==null)return;
  clipboard.setPrimaryClip(ClipData.newPlainText("FCM QA DEVICE TOKEN",tokenInMemory));
  status.setText("Token disalin ke clipboard lokal. Jangan tempel di chat.");
 }
 private void postLocalTest(){
  if(!CleanFcmConsent.allowed(this))return;
  long ms=(System.currentTimeMillis()/60000L)*60000L;
  String symbol="PLAYUSDT";
  Map<String,String> data=new HashMap<>();
  data.put("schemaVersion","yellow-clean-v1");
  data.put("signal","LONG_A");data.put("symbol",symbol);data.put("timeframe","1m");
  data.put("barClosedAtMs",Long.toString(ms));
  data.put("eventId",symbol+":1m:"+ms+":LONG_A");
  data.put("tradingViewUrl",CleanViewModel.chartUrl(symbol));
  data.put("simulatedLocal","true");
  try{
   CleanViewModel.Signal event=CleanPushContract.parse(data);
   if(CleanAlertLedger.reserve(this,event,System.currentTimeMillis())){
    CleanFirebaseMessagingService.showLongA(this,event,data);
    status.setText("Notifikasi SIMULASI QA PLAY dibuat di Android; bukan FCM dari server.");
   }else status.setText("Notifikasi simulasi untuk candle yang sama sudah ditangani.");
  }catch(RuntimeException e){status.setText("Simulasi gagal validasi. Tidak ada notifikasi.");}
 }
 private void disableQa(){
  tokenInMemory=null;copyToken.setEnabled(false);
  try{
   CleanFcmConsent.recordConsent(this,false);
   if(configured){
    FirebaseMessaging.getInstance().setAutoInitEnabled(false);
    FirebaseMessaging.getInstance().deleteToken().addOnFailureListener(e->
      status.setText("FCM QA mati di aplikasi; penghapusan token provider belum terkonfirmasi."));
   }
  }catch(RuntimeException e){status.setText("Gagal mencabut token; penerimaan tetap diblokir di perangkat.");}
  refreshStatus();
 }
}

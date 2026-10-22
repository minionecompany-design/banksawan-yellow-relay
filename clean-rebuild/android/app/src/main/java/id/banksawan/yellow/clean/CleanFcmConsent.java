package id.banksawan.yellow.clean;

import android.content.Context;
import android.os.Build;
import android.Manifest;
import android.content.pm.PackageManager;
import id.banksawan.yellow.BuildConfig;

/**
 * Conservative FCM QA gate. Defaults to false on every installation;
 * setting permission in Android settings ALONE never subscribes to FCM.
 * The app has no production activation path or token upload yet.
 */
public final class CleanFcmConsent {
 private static final String PREF="yellow_clean_fcm_qa_consent";
 private static final String ENABLED="explicit_opt_in";
 private CleanFcmConsent(){}
 public static boolean allowed(Context context){
  if(context==null||!BuildConfig.DEBUG||!"id.banksawan.yellow.qa".equals(context.getPackageName()))return false;
  if(Build.VERSION.SDK_INT>=33&&
     context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
   return false;
  return context.getSharedPreferences(PREF,Context.MODE_PRIVATE).getBoolean(ENABLED,false);
 }
 /** Only invoke after an explicit, logged-in QA opt-in and granted OS permission.
  * This saves consent, but does NOT independently activate Firebase registration. */
 public static void recordConsent(Context context,boolean enabled){
  if(context==null||!BuildConfig.DEBUG||!"id.banksawan.yellow.qa".equals(context.getPackageName()))
   throw new SecurityException("QA_ONLY");
  if(enabled&&Build.VERSION.SDK_INT>=33&&
     context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
   throw new SecurityException("NOTIFICATION_PERMISSION_REQUIRED");
  if(!context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putBoolean(ENABLED,enabled).commit())
   throw new IllegalStateException("CONSENT_NOT_DURABLE");
 }
}

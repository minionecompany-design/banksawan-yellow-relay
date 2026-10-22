package id.banksawan.yellow;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import java.util.Map;
import java.util.Locale;

/** Single atomic claim for foreground polling AND Firebase background delivery.
 * No network calls, no old event replay; a claim is committed before posting.
 */
public final class YellowNotifier {
    public static final String TOPIC="banksawan-yellow-v2";
    private static final String CHANNEL="yellow_long_a_v8";
    private static final String TEST_CHANNEL="yellow_sound_test_v8";
    private static final Object CLAIM_LOCK=new Object();
    private YellowNotifier(){}
    public static void channel(Context context){
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
            if(manager!=null){
                NotificationChannel c=new NotificationChannel(CHANNEL,"YELLOW LONG A / LONG B (live)",NotificationManager.IMPORTANCE_HIGH);
                c.setDescription("LONG A 5M/15M/1H and selected LONG B 1M (first A silent)");
                c.setSound(defaultSound(),soundAttributes());
                manager.createNotificationChannel(c);
                NotificationChannel selfTest=new NotificationChannel(TEST_CHANNEL,
                    "YELLOW sound self-test",NotificationManager.IMPORTANCE_HIGH);
                selfTest.setDescription("Manual sound test only; never generates a LONG A signal");
                selfTest.setSound(defaultSound(),soundAttributes());
                manager.createNotificationChannel(selfTest);
            }
        }
    }
    private static Uri defaultSound(){return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);}
    private static AudioAttributes soundAttributes(){return new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();}

    /** Manual Android notification test, entirely local. No network, no event, no HOME. */
    public static boolean testSound(Context context){
        if(Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(
            "android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)return false;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(manager==null)return false;
        channel(context);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?
            new Notification.Builder(context,TEST_CHANNEL):new Notification.Builder(context);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("TES SUARA BANKSAWAN YELLOW")
            .setContentText("Uji notifikasi lokal, BUKAN sinyal LONG A")
            .setAutoCancel(true);
        if(Build.VERSION.SDK_INT<26)builder.setDefaults(Notification.DEFAULT_SOUND);
        manager.notify(787878,builder.build());
        return true;
    }

    /** Existing callers retain the LONG A-only signature. */
    public static boolean claimAndNotify(Context context,String id,String symbol,String timeframe,
             long closedAt,long expiresAt,double price,double change,double quoteVolume24h){
        return claimAndNotify(context,"LONG_A",id,symbol,timeframe,closedAt,expiresAt,
            price,change,quoteVolume24h,0,0,Double.NaN,Double.NaN);
    }
    /** Both foreground and FCM validate B's pinned FIRST A origin independently. */
    public static boolean claimAndNotify(Context context,String signal,String id,String symbol,String timeframe,
             long closedAt,long expiresAt,double price,double change,double quoteVolume24h,
             long firstAAt,long protectAt,double firstAPrice,double firstAChangePct){
        long now=System.currentTimeMillis();
        boolean regularA="LONG_A".equals(signal)&&
            ("5m".equals(timeframe)||"15m".equals(timeframe)||"1h".equals(timeframe));
        boolean oneB="LONG_B".equals(signal)&&"1m".equals(timeframe)&&
            firstAAt>0&&firstAAt%60000==0&&protectAt>firstAAt&&protectAt%60000==0&&
            closedAt>protectAt&&closedAt<=firstAAt+120*60000L&&
            closedAt-protectAt<=90*60000L&&
            Double.isFinite(firstAPrice)&&firstAPrice>0&&firstAPrice<10&&
            Double.isFinite(firstAChangePct)&&firstAChangePct>=1;
        if(id==null||symbol==null||timeframe==null||!(regularA||oneB)||
            !symbol.matches("[A-Z0-9]{2,25}USDT")||
            !id.equals(symbol+":"+timeframe+":"+closedAt+":"+signal)||
            closedAt<=0||closedAt>now||now-closedAt>300_000||expiresAt<=now||
            !Double.isFinite(price)||price<=0||(regularA&&price>=10)||
            !Double.isFinite(change)||(regularA&&change<1)||
            !Double.isFinite(quoteVolume24h)||quoteVolume24h<=10_000_000)return false;
        if(Build.VERSION.SDK_INT>=33 &&
           context.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)
            return false;
        channel(context);
        synchronized(CLAIM_LOCK){
            SharedPreferences prefs=context.getSharedPreferences("yellow_notify_claims",Context.MODE_PRIVATE);
            String key="claimed_"+id;
            if(prefs.contains(key))return false;
            SharedPreferences.Editor editor=prefs.edit();
            // Old dedupe claims are kept only for up to 24 hours.
            for(Map.Entry<String,?> entry:prefs.getAll().entrySet()){
                Object at=entry.getValue();
                if(at instanceof Long && now-(Long)at>86_400_000L)editor.remove(entry.getKey());
            }
            if(!editor.putLong(key,now).commit())return false;
        }
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?
            new Notification.Builder(context,CHANNEL):new Notification.Builder(context);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("BANKSAWAN YELLOW • "+signal+" "+symbol)
            .setContentText(timeframe.toUpperCase(Locale.ROOT)+" • "+String.format(Locale.US,"%.6f USDT • Binance 24H %+.2f%%",price,change))
            .setAutoCancel(true);
        if(Build.VERSION.SDK_INT<26)builder.setDefaults(Notification.DEFAULT_SOUND);
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(manager!=null)manager.notify(id.hashCode(),builder.build());
        return true;
    }
}

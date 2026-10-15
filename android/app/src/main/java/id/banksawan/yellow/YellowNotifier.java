package id.banksawan.yellow;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.Map;
import java.util.Locale;

/** Single atomic claim for foreground polling AND Firebase background delivery.
 * No network calls, no old event replay; a claim is committed before posting.
 */
public final class YellowNotifier {
    public static final String TOPIC="banksawan-yellow-v2";
    private static final String CHANNEL="yellow_long_a_live";
    private static final Object CLAIM_LOCK=new Object();
    private YellowNotifier(){}
    public static void channel(Context context){
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
            if(manager!=null){
                NotificationChannel c=new NotificationChannel(CHANNEL,"YELLOW LONG A (live)",NotificationManager.IMPORTANCE_HIGH);
                c.setDescription("LONG A on closed 1M/5M/15M/1H candle");manager.createNotificationChannel(c);
            }
        }
    }
    public static boolean claimAndNotify(Context context,String id,String symbol,String timeframe,
             long closedAt,long expiresAt,double price,double change){
        long now=System.currentTimeMillis();
        if(id==null||symbol==null||timeframe==null||
            !symbol.matches("[A-Z0-9]{2,25}USDT")||
            !(timeframe.equals("1m")||timeframe.equals("5m")||timeframe.equals("15m")||timeframe.equals("1h"))||
            !id.equals(symbol+":"+timeframe+":"+closedAt+":LONG_A")||
            closedAt<=0||closedAt>now||now-closedAt>300_000||expiresAt<=now||
            !Double.isFinite(price)||price<=0||price>=10||
            !Double.isFinite(change)||change<1)return false;
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
            .setContentTitle("BANKSAWAN YELLOW • LONG A "+symbol)
            .setContentText(timeframe.toUpperCase(Locale.ROOT)+" • "+String.format(Locale.US,"%.6f USDT • Binance 24H %+.2f%%",price,change))
            .setAutoCancel(true);
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(manager!=null)manager.notify(id.hashCode(),builder.build());
        return true;
    }
}

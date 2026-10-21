package id.banksawan.yellow;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Background data-only FCM receiver. Strict 5m TTL, same dedupe as polling. */
public final class YellowFirebaseService extends FirebaseMessagingService {
    @Override public void onNewToken(String token){
        super.onNewToken(token);
        if(BuildConfig.FCM_ENABLED)FirebaseMessaging.getInstance().subscribeToTopic(YellowNotifier.TOPIC);
    }
    @Override public void onMessageReceived(RemoteMessage message){
        if(!BuildConfig.FCM_ENABLED)return;
        Map<String,String> data=message.getData();
        if(!"YELLOW_LONG_A".equals(data.get("event")))return;
        try{
            String symbol=data.get("symbol"),tf=data.get("timeframe"),id=data.get("event_id");
            long closedAt=Long.parseLong(data.get("bar_closed_at_ms"));
            long expiry=Long.parseLong(data.get("expires_at_ms"));
            double price=Double.parseDouble(data.get("price"));
            double change=Double.parseDouble(data.get("binance_change"));
            YellowNotifier.claimAndNotify(this,id,symbol,tf,closedAt,expiry,price,change,Double.parseDouble(data.get("quote_volume_24h")));
        }catch(Exception ignored){/* Malformed messages are not notifications. */}
    }
}

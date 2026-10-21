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
        String eventType=data.get("event");
        String signal="YELLOW_LONG_B".equals(eventType)?"LONG_B":"LONG_A";
        if(!"YELLOW_LONG_A".equals(eventType)&&!"YELLOW_LONG_B".equals(eventType))return;
        try{
            String symbol=data.get("symbol"),tf=data.get("timeframe"),id=data.get("event_id");
            long closedAt=Long.parseLong(data.get("bar_closed_at_ms"));
            long expiry=Long.parseLong(data.get("expires_at_ms"));
            double price=Double.parseDouble(data.get("price"));
            double change=Double.parseDouble(data.get("binance_change"));
            boolean oneB="LONG_B".equals(signal);
            YellowNotifier.claimAndNotify(this,signal,id,symbol,tf,closedAt,expiry,price,change,
                Double.parseDouble(data.get("quote_volume_24h")),
                oneB?Long.parseLong(data.get("episode_started_at_ms")):0,
                oneB?Long.parseLong(data.get("protect_at_ms")):0,
                oneB?Double.parseDouble(data.get("first_a_price")):Double.NaN,
                oneB?Double.parseDouble(data.get("first_a_change_pct")):Double.NaN);
        }catch(Exception ignored){/* Malformed messages are not notifications. */}
    }
}

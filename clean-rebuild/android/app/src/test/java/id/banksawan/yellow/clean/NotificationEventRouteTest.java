package id.banksawan.yellow.clean;
import org.junit.Test;import static org.junit.Assert.*;
public class NotificationEventRouteTest {
 @Test public void routeIsUniqueBySymbolTimeframeAndClosedCandle(){
  String play=NotificationEventRoute.route("PLAYUSDT","1m",60000);
  String fogo=NotificationEventRoute.route("FOGOUSDT","1m",60000);
  String later=NotificationEventRoute.route("PLAYUSDT","1m",120000);
  String five=NotificationEventRoute.route("PLAYUSDT","5m",300000);
  assertNotEquals(play,fogo);
  assertNotEquals(play,later);
  assertNotEquals(play,five);
  assertEquals(play,NotificationEventRoute.route("PLAYUSDT","1m",60000));
  assertEquals("PLAYUSDT:1m:60000:LONG_A",NotificationEventRoute.eventId("PLAYUSDT","1m",60000));
 }
 @Test(expected=IllegalArgumentException.class) public void longBIsNotARoute(){NotificationEventRoute.route("PLAYUSDT","LONG_B",60000);}
 @Test(expected=IllegalArgumentException.class) public void malformedSymbolNotAccepted(){NotificationEventRoute.route("PLAY-USDT","1m",60000);}
 @Test(expected=IllegalArgumentException.class) public void invalidCloseRejected(){NotificationEventRoute.route("PLAYUSDT","1m",0);}
}

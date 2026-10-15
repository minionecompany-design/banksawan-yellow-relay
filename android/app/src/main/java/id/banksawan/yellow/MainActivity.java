        list.addView(columns);
        View spacer = new View(this);
        list.addView(spacer, new LinearLayout.LayoutParams(-1, dp(13)));

        for (JSONObject coin : eligible) addUniverseRow(coin);

        if (eligible.isEmpty()) {
            TextView empty = text("Belum ada koin yang memenuhi filter Binance 24H ≥ +1% dan harga <10 USDT.",
                13, MUTED, false);
            empty.setPadding(0, dp(18), 0, 0);
            list.addView(empty);
        }
    }

    private String shortTime(long ms) {
        SimpleDateFormat format = new SimpleDateFormat("HH:mm:ss", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));
        return format.format(new Date(ms));
    }

    private void addUniverseRow(JSONObject coin) {
        String symbol = coin.optString("symbol", "");
        double price = coin.optDouble("price", 0);
        double change = coin.optDouble("binance24hChangePct", 0);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(75));

        LinearLayout symbolColumn = new LinearLayout(this);
        symbolColumn.setOrientation(LinearLayout.VERTICAL);
        TextView ticker = text(symbol, 17, Color.WHITE, true);
        ticker.setMaxLines(2);
        symbolColumn.addView(ticker);
        TextView perp = text("Perp", 12, MUTED, false);
        perp.setPadding(0, dp(3), 0, 0);
        symbolColumn.addView(perp);
        row.addView(symbolColumn, new LinearLayout.LayoutParams(0, -2, 1.65f));

        TextView priceView = text(number(price), 16, Color.WHITE, false);
        priceView.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        row.addView(priceView, new LinearLayout.LayoutParams(0, -2, 1.2f));

        LinearLayout changeColumn = new LinearLayout(this);
        changeColumn.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        TextView changeView = text(String.format(Locale.US, "%+.2f%%", change),
            16, Color.WHITE, true);
        changeView.setGravity(Gravity.CENTER);
        changeView.setPadding(dp(7), dp(10), dp(7), dp(10));
        GradientDrawable greenPill = shape(Color.rgb(11, 191, 123), 0);
        greenPill.setCornerRadius(dp(8));
        changeView.setBackground(greenPill);
        changeColumn.addView(changeView);
        row.addView(changeColumn, new LinearLayout.LayoutParams(0, -2, 1.15f));
        list.addView(row);

        // Intentionally no row click and no TradingView shortcut on UNIVERSE.
    }

    private void render() {
        list.removeAllViews();
        boolean isUniverse = tab.equals("universe");
        header.setVisibility(isUniverse ? View.GONE : View.VISIBLE);
        banner.setVisibility(isUniverse ? View.GONE : View.VISIBLE);
        status.setVisibility(isUniverse ? View.GONE : View.VISIBLE);

        if (isUniverse) {
            renderUniverse();
            return;
        }

        TextView heading = text("HOME", 26, Color.WHITE, true);
        heading.setPadding(0, 0, 0, dp(8));
        list.addView(heading);
        TextView subtitle = text("LONG A • 24 jam per simbol", 13, MUTED, false);
        subtitle.setPadding(0, 0, 0, dp(17));
        list.addView(subtitle);

        int count = 0;
        for (int i = 0; i < home.length(); i++) {
            JSONObject item = home.optJSONObject(i);
            if (item == null || item.optLong("homeExpiresMs", 0) <= System.currentTimeMillis())
                continue;
            String symbol = item.optString("symbol", "");
            if (!symbol.matches("[A-Z0-9]{2,25}USDT")) continue;
            card(symbol, item, true);
            count++;
        }
        if (count == 0) {
            list.addView(text("Belum ada LONG A yang dapat ditampilkan", 14, MUTED, false));
        }
    }
    private void refresh(){
      if(BuildConfig.DEMO_MODE){setDemo();return;}
      io.execute(()->{
        try{JSONArray newHome=load("/api/home","home"),newUniverse=load("/api/universe","universe");
            runOnUiThread(()->{home=newHome;universe=newUniverse;lastRefreshMs=System.currentTimeMillis();connectionHealthy=true;status.setText("TERHUBUNG • "+universe.length()+" KOIN");render();});
        }catch(Exception err){runOnUiThread(()->{connectionHealthy=false;status.setText("SERVER BELUM TERHUBUNG");render();});}
      });
    }
    private JSONArray load(String route,String field)throws Exception {
      HttpURLConnection c=(HttpURLConnection)new URL(BuildConfig.API_BASE_URL+route).openConnection();
      c.setConnectTimeout(5000);c.setReadTimeout(5000);c.setRequestMethod("GET");
      try{if(c.getResponseCode()!=200)throw new IllegalStateException("HTTP "+c.getResponseCode());
        StringBuilder b=new StringBuilder();try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
          String line;while((line=reader.readLine())!=null)b.append(line);}
        JSONObject response=new JSONObject(b.toString());if(response.optBoolean("simulation",false))throw new IllegalStateException("Simulation endpoint");
        return response.getJSONArray(field);
      }finally{c.disconnect();}
    }
    private void setDemo(){long now=System.currentTimeMillis();
        long anchor=getSharedPreferences("yellow_demo",MODE_PRIVATE).getLong("demoAnchorMs",0);
        if(anchor==0){anchor=now;getSharedPreferences("yellow_demo",MODE_PRIVATE).edit().putLong("demoAnchorMs",anchor).apply();}
        try{home=new JSONArray().put(new JSONObject().put("symbol","WALUSDT").put("timeframe","15m").put("price",0.05123)
          .put("binance24hChangePct",5.8).put("firstSeenMs",anchor-35*60_000).put("homeExpiresMs",anchor+23*60*60_000+25*60_000))
          .put(new JSONObject().put("symbol","ARCUSDT").put("timeframe","1m").put("price",0.03741)
          .put("binance24hChangePct",2.7).put("firstSeenMs",anchor-97*60_000).put("homeExpiresMs",anchor+22*60*60_000+23*60_000));
          universe=new JSONArray().put(new JSONObject().put("symbol","WALUSDT").put("timeframe","15m").put("price",0.05123)
           .put("binance24hChangePct",5.8).put("priority","HIGH"))
           .put(new JSONObject().put("symbol","ARCUSDT").put("timeframe","1m").put("price",0.03741)
           .put("binance24hChangePct",2.7).put("priority","STANDARD"));
          lastRefreshMs=System.currentTimeMillis();status.setText("DEMO OFFLINE • 0 REQUEST BINANCE");render();
        }catch(Exception ignored){}
    }
}

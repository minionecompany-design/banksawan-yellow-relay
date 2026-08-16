const express = require("express");
const admin = require("firebase-admin");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Firebase Admin credential dari Render ENV
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const messaging = admin.messaging();

const TOPIC = "banksawan-yellow";

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "BANKSAWAN YELLOW RELAY"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    firebase: true,
    topic: TOPIC,
    time: Date.now()
  });
});

app.post("/yellow", async (req, res) => {
  try {
    const body = req.body || {};

    const event = String(body.event || "").trim().toUpperCase();
    const symbol = String(body.symbol || "").trim().toUpperCase();
    const tf = String(body.tf || "").trim().toUpperCase();
    const price = String(body.price || "").trim();
    const binanceChange = String(body.binance_change || "").trim();

    if (event !== "YELLOW") {
      return res.status(400).json({
        ok: false,
        error: "event must be YELLOW"
      });
    }

    if (!symbol) {
      return res.status(400).json({
        ok: false,
        error: "symbol required"
      });
    }

    if (!["1M", "5M", "15M", "1H"].includes(tf)) {
      return res.status(400).json({
        ok: false,
        error: "invalid tf"
      });
    }

    const eventAt = String(body.event_at || Date.now());

    const eventId = String(
      body.event_id ||
      `${symbol}_${tf}_${eventAt}`
    );

    const message = {
      topic: TOPIC,

      // DATA ONLY
      data: {
        event: "YELLOW",
        symbol,
        tf,
        price,
        binance_change: binanceChange,
        event_at: eventAt,
        event_id: eventId
      },

      android: {
        priority: "high"
      }
    };

    const messageId = await messaging.send(message);

    return res.json({
      ok: true,
      sent: true,
      topic: TOPIC,
      symbol,
      tf,
      event_id: eventId,
      fcm_message_id: messageId
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      ok: false,
      error: err.message || "relay error"
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BANKSAWAN YELLOW RELAY running on port ${PORT}`);
});

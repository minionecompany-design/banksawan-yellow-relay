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
const RELAY_ENFORCE_EXPIRY = [
  "1",
  "true",
  "yes",
  "on"
].includes(
  String(process.env.RELAY_ENFORCE_EXPIRY || "")
    .trim()
    .toLowerCase()
);

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
    quality_gate_mode: process.env.QUALITY_GATE_MODE || "shadow",
    enforce_expiry: RELAY_ENFORCE_EXPIRY,
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
    const qualityStage = String(
      body.quality_stage || "UNKNOWN"
    ).trim().toUpperCase();
    const qualityScore = String(
      body.quality_score || ""
    ).trim();
    const qualityPhase = String(
      body.quality_phase || "UNKNOWN"
    ).trim().toUpperCase();
    const qualityReasonCodes = String(
      body.quality_reason_codes || "[]"
    ).trim();
    const detectedAt = String(
      body.detected_at || Date.now()
    ).trim();

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
    const eventAtMs = Number(eventAt);

    const eventId = String(
      body.event_id ||
      `${symbol}_${tf}_${eventAt}`
    );

    const expiresAt = String(
      body.expires_at ||
      (
        Number.isFinite(eventAtMs)
          ? eventAtMs + 5 * 60 * 1000
          : Date.now() + 5 * 60 * 1000
      )
    );
    const expiresAtMs = Number(expiresAt);

    if (
      RELAY_ENFORCE_EXPIRY &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs <= Date.now()
    ) {
      return res.status(410).json({
        ok: false,
        error: "event expired",
        event_id: eventId
      });
    }

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
        event_id: eventId,
        expires_at: expiresAt,
        detected_at: detectedAt,
        quality_stage: qualityStage,
        quality_score: qualityScore,
        quality_phase: qualityPhase,
        quality_reason_codes: qualityReasonCodes
      },

      android: {
        priority: "high"
      }
    };

    const ttlSeconds = Number.isFinite(expiresAtMs)
      ? Math.floor((expiresAtMs - Date.now()) / 1000)
      : null;

    if (ttlSeconds && ttlSeconds > 0) {
      message.android.ttl = `${ttlSeconds}s`;
    }

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

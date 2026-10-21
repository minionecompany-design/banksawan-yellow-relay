> Update 18 October 2026: historical checkpoint below is superseded by YELLOW-GOLD-POLICY-REVIEW-20261018.md for current production, Pine v1.3 clarification, PR #12 alert subset and recorder progress. Historical counts are not current status.

# YELLOW GOLD V1 — Evidence checkpoint and approval gates
17 Oct 2026 WIB. DRAFT PR #8: OFFLINE only.

## Verified naturally emitted messages
Railway YELLOW_FCM logs show:
| Symbol | TF | Sent WIB | Actual quality grade |
|---|---|---|---|
| AGTUSDT | 1m | 16 Oct 23:41 | UNVERIFIED |
| TIAUSDT | 15m | 17 Oct 07:15 | UNVERIFIED |
| AVAUSDT | 1m | 17 Oct 14:36 | UNVERIFIED |
| BASEDUSDT | 1m | 17 Oct 14:46 | UNVERIFIED |
| RSRUSDT | 1m | 17 Oct 15:21 | UNVERIFIED |
| FOLKSUSDT | 1m | 17 Oct 15:33 | UNVERIFIED |
| AIOUSDT | 1m | 17 Oct 16:09 | UNVERIFIED |
| METISUSDT | 1m | 17 Oct 16:43 | UNVERIFIED |
| AIOUSDT (new event) | 1m | 17 Oct 16:48 | UNVERIFIED |
| HANAUSDT | 1m | 17 Oct 16:52 | UNVERIFIED |
| ACUUSDT | 1m | 17 Oct 16:56 | UNVERIFIED |
| KMNOUSDT | 1m | 17 Oct 17:07 | UNVERIFIED |
| TAKEUSDT | 1m | 17 Oct 18:02 | UNVERIFIED |

FCM SENT means submission from backend, not proof every phone received sound; user confirmed phone sound for AVA. TradingView AGT 5m A marker is visual only; no separate confirmed 5m FCM event. ZIP screenshot charts do not contain full exact OHLCV candles at signal. Registry JSON deliberately uses null for missing as-of source data.

Offline evaluation of these THIRTEEN verified natural event IDs: 13 inputs, 0 candidates scored, 0 with verified forward 4h outcome, 13 UNVERIFIED. This does NOT mean thirteen failures. Do not invent GOLD grades or profit outcomes.

## Research-only work added
- quality-shadow-v1: original confirmed LONG_A only; independently looks at structure (early base OR continuation), release volume, and timing from the 61 contiguous target-TF CLOSED candles ending at event time. Fails UNVERIFIED when data missing or event price mismatches candle.
- quality-evidence-v1: separately inspects the next 60/240 minutes of contiguous future target-TF CLOSED candles, if supplied; reports max favorable/adverse excursion, end return and first +5% timestamp. Future data NEVER enter quality scoring. Intrabar order and actual tradability UNKNOWN. A 5% MFE is NOT 5% realized profit.
- quality-evidence-cli: offline JSON file only, no HTTP, WebSocket, Binance, database or notification.
- metadata-only event registry: documents genuine FCM event IDs but does not fabricate the necessary candle snapshots.

Run from scanner:
    node src/quality-evidence-cli.js ../docs/YELLOW-GOLD-EVIDENCE-METADATA-20261017.json > gold-evidence.json
    node --test test/quality-shadow-v1.test.js test/quality-evidence-v1.test.js

An eligible source record must have exact symbol + timeframe + event ID + candle close time + original event price and a valid as-of window of >=61 contiguous CLOSED OHLCV candles. A 4-hour outcome additionally requires future closed candles after the event. A later ticker is not historical 24h proof. The user-supplied APR/BTR/USELESS fixture series do not provide validated as-of 24h ticker snapshots for actual new LONG_A detections.

## Safety / false-negative release gate
1. Four original LONG_A TFs remain independent; do NOT require simultaneous 1m+5m+15m+1h signals.
2. No hard cap of 2–5 signals/day: this is a volume objective, not a quota.
3. Compare prospective first-seen candidates and confirmed failures, using a chronological split. Report all false negatives of a GOLD-only policy and timing delay, never only lower message volume.
4. Do NOT blame quality filtering for AGT 5m or AVA 15m mismatch; independently audit TF coverage, Pine v1.3 vs chart v1.3.7, cold start and real-time semantics.
5. Never retroactively announce a signal, replace event-time ticker with present ticker, add Binance REST requests, or hide weak-grade events from an internal audit.
6. No merging, deploying, restarting, changing Railway env or /data, altering HOME/FCM, installing Android, or touching BR without separate explicit approval.

## Next blocker and Work handoff
Existing log/metadata do not include all exact signal-time 61-candle snapshots, so real GOLD sensitivity cannot yet be validated. Next separately propose/test a small bounded passive snapshot recorder that reuses existing in-memory candle book ONLY at future genuine LONG_A moments, no new REST/WS, with retention, size limits, and durable storage. That would modify live code and therefore requires user approval before deployment. Work can help investigate existing Railway volume and source/visual chart parity, but NO action needs an automatic Work session. This PR remains fully disconnected from production delivery.


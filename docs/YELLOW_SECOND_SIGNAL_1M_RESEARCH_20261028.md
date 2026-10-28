# BANKSAWAN YELLOW — SECOND SIGNAL after LONG A 1M (research-only, 28 October 2026)

## Goal requested by owner
LONG A currently finds interesting candidates. Add a **second and explainable observation** that separates:
1. A post-LONG-A move that only bounces a little and then breaks structure with heavy selling (candidate to avoid **at that time**).
2. A candidate that pulls back (even below its LONG A price) then recovers and rises, or rises in controlled stages and breaks out after a base (a candidate to watch and possibly confirm entry).

Do not claim the engine can know that an asset will **never** rise again. Historical winners such as JCT, AIN and BULLA motivate hypothesis design but are not validation.

## Proposed UI and semantics
- HOME: keep **one compact 3-lamp display** per original LONG A, no ENTRY/SL/TP block. Existing TradingView and ANALISIS controls remain.
- **YELLOW / TUNGGU**: immediately after LONG A and through unconfirmed pullback, tentative recovery or controlled ascent. A red event is NOT triggered by a single declining candle or low volume.
- **RED / HINDARI SEKARANG**: at least 2 consecutive *closed* 1M candles below a **frozen pre-signal 20-minute support floor minus 0.2%**, latest candle bearish with >=1.5x previous 20-bar average volume, **5M DOWN and 15M not UP**. Requires current native closed higher-TF context. It is a conservative current-risk warning; later recovery is possible. Numeric gates are deliberately initial hypotheses, NOT trained probabilities.
- **GREEN / KONDISI ENTRY MENDUKUNG**: exclusively from the existing V3 **confirmed PULLBACK or CONTINUATION** path, native complete TF data, fresh eligible Binance quote after confirmation, frozen entry range and <=3min window, no expiry/gaps. Signal path and reason are visible inside ANALISIS. The research gate delegates to V3, does NOT issue trades.
- **OFF / BERAKHIR**: six-hour watch expired, entry window expired, unsupported data continuity, **TP1 already reached**, scenario no longer valid. A candidate reaching TP1 should NOT turn RED as if it failed. Never leave a stale GREEN.
- Existing LONG A lanes **1M/5M/15M/1H all stay active**. The extra second signal is for LONG A **1M only**, and borrows native 5M/15M/1H *context*, not additional 5M/15M/1H entry lanes.

## Prototype implementation — strict offline isolation
- File `scanner/src/second-signal-1m.js` with pure function `secondSignal1m` and explicit event identity.
- No import by `live-main.js`, `live-market.js`, `live-api.js`, Android/FCM. No Railway deployment, new APK, new notification, extra Binance API request or access to Binance orders.
- Past-only floor: 20 valid contiguous 1M bars ending **before** LONG A close; all subsequent bars and native context must have actually closed before calculation. No future pivot labels or peeking at later gainers.
- Current-label function is stateless; **future production use requires durable state, de-duplication, persistence and restart handling**. A later strong reversal can move RED back toward YELLOW; never call RED a definitive future forecast.
- Reuse existing research V3 pullback/continuation confirmation and risk/quote/entry gates. Do NOT secretly loosen thresholds in response to this small, previously seen sample.
- Automated tests include: non1M untouched; first decline YELLOW not RED; structural red requires both relevant TF context and elevated selling; low volume prevents RED; GREEN both paths only on fresh in-range eligible quote; stale/expired/data gap never GREEN; later candles cannot rewrite an earlier decision.

## Acceptance BEFORE any LIVE decision
1. CI passes full scanner + Android safety tests on exact final commit. Replay all archived 28 1M cases without cherry-picking; include all failures/no-entry/censored cases and avoid manufacturing historical GREEN without quote eligibility. 
2. Quantify false RED for any archived candidates subsequently rising (including examples such as JCT/AIN/BULLA **only when data actually exists**). Report delayed/missed pullbacks and missed continuation, independent market episodes, costs and entry-zone fill rate.
3. Get **out-of-sample forward observations** of original LONG A 1M versus new second-signal states, including losers, before claiming the signal filters failures. Evaluate real native TF arrival order and color delay.
4. If later approved: define one current source of truth for status, add display-only reason/path to ANALISIS, snapshot/FCM isolation, Android compatibility, safe persistence and QA. No second lamp row on HOME.
5. **Do not merge, deploy, build signed APK or mark WINNER** from this experiment merely because code/tests pass. This draft exists for Work to audit later.

The core limitation: the "dead after LONG A" class is only observable in hindsight. This research uses **objective present-time risk conditions**, not perfect future classification.

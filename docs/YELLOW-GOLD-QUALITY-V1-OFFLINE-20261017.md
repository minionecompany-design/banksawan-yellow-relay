> Update 18 October 2026: historical checkpoint below is superseded by YELLOW-GOLD-POLICY-REVIEW-20261018.md for current production, Pine v1.3 clarification, PR #12 alert subset and recorder progress. Historical counts are not current status.

# YELLOW GOLD — Quality Shadow V1 (RESEARCH ONLY)
17 October 2026 WIB. Source branch research/yellow-gold-quality-v1-20261017.

## Non-negotiable objective
BANKSAWAN YELLOW remains the ONE main APK. Keep LONG_A from 1m, 5m, 15m and 1h independent; target a few strong candidates on market days, not a hard daily quota. Avoid both noise overload and losing high-potential early signals. Do not rebuild BR.

## Exact scope
This draft introduces three **new** files, with no imports from scanner/live-main, market runtime, HOME, FCM, Android or Railway:
- scanner/src/quality-shadow-v1.js — causal, pure annotator of an already-confirmed LONG_A; grades GOLD_RESEARCH / REVIEW_RESEARCH / WEAK_RESEARCH / UNVERIFIED.
- scanner/src/quality-shadow-cli.js — offline local JSON evidence loader only; no exchange or network.
- scanner/test/quality-shadow-v1.test.js — chronology, future-data exclusion, alternative early/continuation pathways, weak/chase, four independent TFs.

Each LONG_A stays available in research even when ranked weak. The classifier NEVER creates, suppresses, delays or sends notifications. There is no change to Binance REST/WS, 60 local weight/min, 750ms gap, 418/429/451 circuit, YELLOW_MAX_TRACKED=50, FCM, /data, HOME 10 hours, permanent signer or BR. No new dependencies.

## Research hypotheses, NOT production thresholds
Use **three** interpretable tests using candles already known at the exact signal closing time:
1. STRUCTURE: early base/compression breakout OR healthy MA7/MA25 continuation. Either path is sufficient; do not demand that several TFs fire together.
2. RELEASE: current candle strength and either expanded volume or persistent prior volume.
3. TIMING: price is not too extended from MA7, MA25 or over recent bars.

Provisional cutoffs differ by TF and are intentionally uncalibrated. Grades are research labels, not profitable-trade forecasts, and not permission to enter a trade.

## Evidence actually available
Railway FCM logs verified AGTUSDT 1m on 16 Oct 23:41 WIB, TIAUSDT 15m on 17 Oct 07:15 WIB and AVAUSDT 1m on 17 Oct 14:36 WIB; user confirmed AVA phone alert. AGT 5m yellow marker is visible on TradingView screenshots but a matching AGT 5m FCM event has NOT been established. Screenshots/ZIPs offer visual examples, NOT exact historical candle arrays. Old APR/BTR/USELESS archives lack verified historical as-of 24h ticker evidence for those original LONG_A events. Do NOT invent missing historical ticker, replay grades, hit rates, or AGT score.

Pine provided v1.3, chart shows v1.3.7: exact parity still unverified, especially lower TF request.security historical-vs-realtime semantics. 50/eligible tracked does not prove all TF lanes have recovered state or full universe coverage.

## Running tests and offline analysis
From scanner/:
    node --test test/quality-shadow-v1.test.js
    node src/quality-shadow-cli.js /path/to/signal_snapshots.json > quality-results.json

Input JSON is an array of objects containing:
- event: original LONG_A object with id symbol:timeframe:barClosedAtMs:LONG_A, price > 0, actual event endMs.
- bars: 61 or more **consecutive CLOSED target-timeframe** OHLCV candle objects ending exactly at that event's endMs (endMs,open,high,low,close,volume).
- optional label: separately measured subsequent outcome for research.

Missing data are UNVERIFIED rather than classified as poor. Future bars are ignored; no new scanner feed is requested.

## Before proposing production integration
1. Collect genuine as-of natural evidence from already-available data, or separately request authorization for a tiny passive record of the existing in-memory candle book, no extra Binance requests. Persist rejected AND accepted original LONG_A and TF lane readiness; no historical notifications.
2. Verify actual AGT, TIA, AVA, BASE, RSR, FOLKS, AIO, plus failure samples; attempt AKE/FF/NMR/ORCA/MET only if genuine historical data exist. No peak-price hindsight.
3. Use chronological split; tune earlier evidence and test later unseen signals. Show recall of winners, poor signals filtered, missed winners, alert latency, and TF breakdown with honest sample counts. If evidence weak, remain research-only.
4. Resolve v1.3.7 Pine vs backend parity and lane cold-start/restoration before assuming a missed LONG_A was rejected by quality.
5. No hard two-to-five daily cap and no requirement for LONG_A in multiple TFs. Never suppress a single strong standalone 15m/1h signal.
6. Explicit user authorization is required for any live-wiring change, merge, deployment, Android release, environment variable, or alert suppression. BR remains OFF and untouched.

## Work handoff
Repository: minionecompany-design/banksawan-yellow-relay
Production branch: yellow-long-a-v2-20261015
Current Railway project: banksawan-yellow-v2; service: yellow-live-shadow-yc94
Active production deployment source pinned to backend commit f82ab446b9deb5b5c1a57fccfac75f4ccca31422. Android-only later source commit 889cad23d7303084104e9d2b51ef85a1994136cb.
This DRAFT PR is strictly OFFLINE; do not merge/deploy. Work may help review, create reproducible as-of snapshots and evaluate natural samples; assistant supervises scope and interprets results.

Local isolated prototype: 9/9 targeted tests PASS. A prior outdated user-supplied ZIP snapshot ran 118/127 tests with 9 existing duplicate Android contract-path failures; rely on CURRENT branch CI for full-suite verdict, not on that old copy.


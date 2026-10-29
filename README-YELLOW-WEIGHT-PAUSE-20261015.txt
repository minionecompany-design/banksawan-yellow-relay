BANKSAWAN YELLOW — SCOPED REST WEIGHT SOFT PAUSE (15 OKT 2026)
===============================================================
STATUS: RESEARCH / OFFLINE-TESTED ONLY — NOT COMMITTED / NOT DEPLOYED / NOT ACTIVATED

Repo: minionecompany-design/banksawan-yellow-relay
Branch: yellow-long-a-v2-20261015 (NEVER main)
Known reference base for modified source:
  scanner/src/live-request-guard.js SHA: 99fdd16fc26b2c8799eb883c69394e2e8fc7cf93
  scanner/src/live-market.js SHA: 35f596dd49417989d4cafe5da8fc645de0713cc8
  scanner/test/live-request-guard.test.js SHA: 03e25d75482dc8bb795877e4e5e7419404ebd879

INCIDENT CONFIRMED — 15 OCTOBER 2026, 20:37:54 WIB
  YELLOW_HALT REMOTE_WEIGHT_HEADROOM_LOW
  YELLOW_FAULT BOOTSTRAP_WALUSDT_BINANCE_CIRCUIT_OPEN:REMOTE_WEIGHT_HEADROOM_LOW
  YELLOW_HALT BINANCE_CIRCUIT_OPEN
  YELLOW_STOPPED_FAIL_CLOSED BINANCE_CIRCUIT_OPEN
Production Railway status during audit: CRASHED, 0/1.
We DO NOT have evidence from these logs of an actual HTTP 418, 429 or 451.
Binance X-MBX-USED-WEIGHT-1M header reflects IP-wide consumption, not just
this process. Do not assume that BR is on the same outbound IP.

WHAT CHANGED (OFFLINE PATCH ONLY)
1. Remote IP used-weight >=400: do NOT permanently latch / stop whole scanner.
   Instead pause new Binance REST for 90 seconds (longer than rolling 1m).
   WS candle/ticker feeds + already tracked symbols remain operational.
   The successful response that reports weight >=400 is still processed.
2. No additional Binance endpoints. All REST calls retain serial limiter,
   60 local request-weight/minute, minimum spacing 750ms, 9s request timeout.
3. After pause, no request burst: at most one eligible guarded request is
   dispatched at a time. If remote weight is still high, pause again.
4. Partial 4-timeframe bootstrap is NOT admitted as scanning; its restart is
   deferred until REST can safely resume. Cold start can also defer ticker REST
   while WS continues. No synthetic candles are used.
5. Genuine HTTP 418, 429, 451 STILL cause permanent persisted hard latch.
   Existing legacy latch REMOTE_WEIGHT_HEADROOM_LOW remains blocked on startup
   (deliberately NOT auto-unlocked or deleted).
6. Additional observability: requestGuard.remotePaused,
   remotePauseUntilMs, remoteLastObservedWeight, remotePauses.
7. Separate operator-only OFFLINE latch review tool:
   scanner/scripts/review-remote-weight-latch.js
   Default is DRY-RUN only. Applying requires an explicit, separate approval,
   production process stopped, and a backup. It NEVER clears an HTTP ban latch.

FILES IN ZIP (UPLOAD FROM REPO ROOT ONLY AFTER APPROVAL)
  scanner/src/live-request-guard.js
  scanner/src/live-market.js
  scanner/test/live-request-guard.test.js
  scanner/test/live-weight-pause-recovery.test.js
  scanner/test/live-latch-recovery-tool.test.js
  scanner/scripts/review-remote-weight-latch.js
  README-YELLOW-WEIGHT-PAUSE-20261015.txt

NEVER upload while inside the GitHub /scanner directory. Upload from repository
ROOT, so paths start scanner/src, scanner/test, scanner/scripts directly;
do not create scanner/scanner. Only source/tests are included; no Android or BR.

LOCAL TEST EVIDENCE (OFFLINE / NODE 22)
  node --test scanner/test/*.test.js
  PASS 93, FAIL 0 (2026-10-15; assembled snapshot matching above source SHAs).
  node --check scanner/src/live-request-guard.js
  node --check scanner/src/live-market.js
  node --check scanner/scripts/review-remote-weight-latch.js
No Binance REST, WS, or Railway mutation was performed by these tests.
The entire current GitHub checkout has NOT been rebuilt on CI yet.

CRITICAL: EXISTING PRODUCTION LATCH
- Production /data/binance-circuit.json STILL contains a hard latch created
  with the OLD code; new code alone will not restore that stopped process.
- DO NOT delete volume, reset latch, restart or deploy automatically.
- Before any activation, obtain separate user approval and take a backup of
  the exact volume state (including HOME journal). Audit that the stored
  reason is exactly REMOTE_WEIGHT_HEADROOM_LOW and no HTTP 418/429/451 ban
  occurred. Then, only during a controlled maintenance window and after
  approval, use the operator tool with --apply against the correct data dir.
  It makes a timestamped evidence backup and refuses any HTTP_* latch.
- A GitHub commit might trigger Railway auto-deployment, depending on the
  user's integration. Verify that auto-deploy is disabled BEFORE uploading
  this source patch even though the last production image was pinned.

UNPROVEN IN PRODUCTION
- A 90s pause mitigates this incident class, but no local process can fully
  guarantee absence of 429 if other IP users consume quota concurrently.
- Actual candidate outcomes, FCM background delivery, and Pine parity are
  not certified by the offline tests. Observe naturally after authorized rollout.
- BR #205 and main must remain untouched until an explicit separate decision.

REQUIRED NEXT APPROVAL GATES
A. Review patch and confirm Railway auto-deploy disabled.
B. Commit ONLY to yellow-long-a-v2-20261015 and run scoped CI tests.
C. Verify runtime and persistent latch read-only.
D. Separately authorize controlled deployment / persistent latch recovery.
E. Observe no 418/429/451 and wait for new natural candidates.

# YELLOW GOLD — proposed passive-capture wiring, NOT RELEASED

17 October 2026 WIB. This branch stacks on Draft PR #9 (offline passive recorder). Quality classifier remains in independent Draft PR #8. NO PRODUCTION CHANGE.

## What is connected in the proposed code

- live-main imports research-only bridge. Its default is **OFF**; only environment YELLOW_GOLD_EVIDENCE_ENABLED=true would create the bridge. No existing production variable has been changed.

- The bridge attempts best-effort restore from the existing mounted /data directory as a separate yellow-gold-research-v1.json file; legacy HOME, FCM journal, circuit file, lane checkpoints and schema are untouched. Corrupt/offline/full storage disables only research.

- AFTER actual LiveHomeLedger.accept() succeeds on the genuine LONG_A event, the bridge takes 61+ already-available CLOSED target-TF candle bars from exactly that as-of signal, validates event price, and queues an atomic save without awaiting it on the FCM path.

- Every subsequently APPENDED genuinely CLOSED WebSocket candle is offered to the bridge, no extra feed, no REST/WS connections. If MTF pending context delayed an accepted signal, catch up only confirmed bars already in memory.

- Disk writes are coalesced with a five-minute minimum interval after the first write (best-effort; pending data may be lost on an unplanned crash). Optional flush is available in offline tests; no blocking flush is added to production termination.

- The status includes ONLY aggregate researchEvidence counters and enabled/error state, no OHLCV or event IDs.

- Errors in capture, serialization, disk writing or restore NEVER affect accepted HOME/FCM, scanner health, request limiter or Binance circuit.

## Current protection and risks

- Existing one Binance data-plane, 60 REST weight/min and 750ms gap stay untouched. No new Binance calls. BR remains OFF, no Android release, no APK signing.

- 240 records maximum, seven-day TTL and 12 MiB default atomic file cap; if full, capture disables itself rather than touching HOME or evicting the circuit files. Actual 512 MiB mounted volume free space still needs read-only capacity check before a production rollout.

- State across restart is restored only when a valid research file exists; missing observations/gaps are explicitly incomplete, never imputed or counted as failures.

- 1m/5m/15m/1h remain independent, GOLD quality is NOT applied to alerts or HOME. Pine v1.3 vs v1.3.7 and cold-start/missed TF remain separate research tasks.

- The new env opt-in requires a reviewed source deployment/restart to take effect. A deploy can temporarily reduce market coverage and reset cold TF states; schedule only after explicit user approval and safety review.

## Release gates

1. Draft PR #9 must be reviewed as the independent recorder dependency. This PR is stacked ON PR #9; do not merge production branches automatically.

2. GitHub CI full scanner + Android compile, no disconnected tests, verify no additional Binance REST or new WS.

3. Offline test event recording, 4h append and persistence, restart restore, failure injection, no extra notification, and researchEvidence status.

4. Obtain user's EXPLICIT approval for final production merge/deploy/enable, not merely review of this draft.

5. Confirm service volume capacity, auto-deploy OFF, permanent Android signer unchanged, Railway pinned deployment, current maxTracked=50, limiter, recent 418/429/451=0, and no pending staged changes.

6. On approval deploy one reviewed commit, set YELLOW_GOLD_EVIDENCE_ENABLED=true, watch researchEvidence counters and FCM unchanged. If recorder fails, disable the research switch in a separately approved safe action; do not delete /data or reset Binance protection.

7. Observe enough real as-of events and subsequent 4h evidence across four TFs; then evaluate false negatives and consider GOLD-only notification in a SECOND independent release. No guaranteed 2–5/day quota.

## Work handoff

Repository minionecompany-design/banksawan-yellow-relay. Production branch yellow-long-a-v2-20261015. Production Railway banksawan-yellow-v2 / yellow-live-shadow-yc94 deployment f444808c-0ab6-4e25-bbb2-bc089556bcdf was healthy at last check. Source branch research/yellow-gold-capture-wiring-20261017 stacked on research/yellow-gold-passive-capture-20261017; drafts PR #8 classifier / #9 recorder. This branch cannot affect production until separately merged/deployed.

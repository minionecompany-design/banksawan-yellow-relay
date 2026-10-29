# YELLOW v15 — approved LIVE rollout and AIN case replay

## Application and release

The owner explicitly approved deploying v15 and keeping the service LIVE on 27 October 2026, after restart/bootstrap risk was explained. The earlier automatic approval rejection is resolved by that new approval. No merge was required; PR #24 remains DRAFT.

- Exact deployed/signed application source: 86de4bd0ed18ed32ce92ac0942ad2fee24888c0f.
- Application source tree: c40e826c14ec2a3450ad1872940035de80714d71.
- GitHub CI/release run40472614500: SUCCESS at exact source. 245 scoped Node tests, 15 Python release checks, 36 Android tests; zero Android failures/errors/skips.
- Signed APK: id.banksawan.yellow, versionCode15, 0.15.0-v2-pullback-watch.
- APK SHA256: 8004d667a883426945b626b7a2e517d3b56de96a2972791947d576ad0b40de38.
- Original permanent V2 signer: E01D7A096FE4C50736726BAAB406AF91E0444D9FAD462B787D17D937063E8E4F.
- Downloaded source/hash receipts and independent official SDK35 apksigner/aapt upgrade verification passed. The APK was not rebuilt or changed during deployment.

## Deployment

Existing production service yellow-live-shadow-yc94 / 5a0486e7-27d9-43fd-8d05-f80ffe381a26, project f90b3116-25bc-4af8-ade4-0552625d60ca, environment 1fb5e959-c676-49c5-a1de-1dedbcb12410.

Deployment c2827df1-83d4-4d2f-93d7-bcfd282b4e9c reached terminal SUCCESS. Config readback confirms the exact source pin, original volume ea9edf2d-7294-443f-854c-001265c06405 at /data, existing domain/start command/resources/restart policy and no pending patch. Only branch and commit changed. No variable, credential, Pine/FCM identity, strategy lane, guard, domain or volume change. Source is pinned, so this documentation/data follow-up cannot deploy itself.

API contract audit PASS at 2026-10-27T15:44:28.011000+07:00; failures=[]. Coverage 32/32 eligible symbols scanning, allocated 33/50, bootstrapInProgress 0. Both feeds connected and fresh; all 134 guarded REST responses in this runtime were HTTP200, no remote pauses and no open circuit. Analysis enabled/initialized, failures0, pendingJobs0. The v15 entryWatch summary is present with watches0 / greenPublished sample0, consistent with no new post-activation accepted LONG A yet. The audit proves API contract at this snapshot; CEX parity, device receipt/installation and sustained uptime are separate checks.

The seven old analysis records restored without faults or retroactive watches. New entryWatch observations begin only on subsequent accepted LONG A. Old summaries remain baseline paper samples, not v15 GREEN performance. Keeping LIVE does not disable the existing fail-closed Binance protections or guarantee uninterrupted uptime.

## Honest AIN replay result: no entry confirmation

The actual recorded event was AINUSDT:1m:1793053140000:LONG_A, 27 Oct05:19 WIB, price0.07383. Its original detectedAtMs1793053140059 was retained from the saved pre-deploy HOME response. No synthetic LONG A was sent to LIVE.

After deployment, the new bounded research endpoint exported AIN's already buffered native Binance candles: 999x1m, 498x5m, 248x15m, 169x1h, captured at1793090286503. Export made zero new Binance requests. The raw dataset hash and compressed bytes are retained with the local-only replay output for reproducibility. Data beyond a replay decision time is filtered out by the same closedHistory functions; changing future bars is separately regression-tested.

The deployed fixed rules produced **no CONFIRMED entry from05:19 through11:19 WIB**. Final state ENDED / PEMANTAUAN_BERAKHIR, plan=null, paper=null. This DOES NOT meet the user's desired AIN entry near08:34 and is not evidence of improved trading accuracy.

For the chart's08:34 candle (closed08:35), the exported native OHLC matches the screenshot: open0.06351, high0.06422, low0.06279, close0.06419. The observed post-signal low was0.0608 in the candle closed08:30. At08:35, close0.06419 had not exceeded the previous three highs0.0644; relative volume was0.6834, below the frozen1.2 rule. Closed5m close0.06419 also remained below SMA7=0.06763 and SMA25=0.06992. The hypothetical current stop distance from the observed low plus ATR buffer was5.81%, above the fixed5% cap.

At08:44, the reclaim and volume condition did appear (close0.06385 above prior3high0.06344; relative volume1.9038), but closed5m remained DOWN and the hypothetical stop distance was5.30%. The implemented rule therefore stayed PULLBACK / TREN_PENDUKUNG_BELUM_SESUAI. Later recoveries also failed trend or SL-distance gates. Parameters were not changed after seeing this result merely to fit one winning chart.

Replay assumes higher-timeframe delivery at close and processes at close+1s; it does not reconstruct historical feed latency, later24h eligibility, live quotes, actual GREEN publication, device rendering or execution. No GREEN/entry/return is invented for this no-plan result. The selected candle's timestamp is an opening label; confirmation using its close would be available one minute later at the earliest.

## BULLA and remaining evidence

The BULLA 26 Oct10:58 WIB crosshair is a review target. The requested official daily archive returned HTTP404; no complete replay or executable entry is claimed. In the screenshot the chosen candle's low0.08421 differs from the horizontal crosshair price0.08285, so the crosshair alone cannot establish a fill at that price/time.

V15 repairs scenario lifecycle, differentiates ended/waiting states, adds causal pullback observation and separates GREEN paper accounting. Its entry quality remains unproven and the tested AIN example is explicitly missed. Further changes require broader chronological/out-of-sample evaluation and should examine stop anchoring and lagging confirmation rather than force these two charts to fit.

Phone update-in-place, new natural v15 watch capture, actual four-TF device FCM receipt and GREEN observations remain field acceptance gates. No production trading order or forced notification was generated. HOME v14 layout remains unchanged. Install the provided same-signer v15 as an Update without uninstalling.

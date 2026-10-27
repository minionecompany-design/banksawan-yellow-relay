# YELLOW symbol correction and observation rollout — 27 October 2026

The owner authorized correcting single-character symbols and starting the planned LIVE observation. QUSDT and WUSDT were rejected by a minimum-two-character base-asset regex before exchange metadata/tickers could enter the scanner. The same restriction existed in the ledger, checkpoints, FCM validation, analysis IDs, Android HOME/UNIVERSE, notifications and TradingView links.

All affected validators now allow one through 25 uppercase alphanumeric base characters before USDT. Empty bases, URL/path characters, lowercase inputs and identity mismatches remain invalid. Exchange metadata must still confirm a TRADING Binance USD-M USDT perpetual. Price, 24h change, quote-volume policy, four independent LONG A lanes, Pine v1.3 logic, maximum 50 slots, deduplication and retention are unchanged.

Regression coverage checks Q/W ingress from exchange metadata and ticker normalization, UNIVERSE comparison, actual Pine delivery to durable HOME and analysis, all four FCM lanes with mocked HTTP, durable HOME reload, Android UNIVERSE/notifications/analysis identity and TradingView URLs. No synthetic event is sent to the real backend or a phone.

Android candidate: versionCode 12, versionName 0.12.4-v2-analysis-symbols. Package id.banksawan.yellow and original V2 signer remain required. The scoped CI adds an explicitly marked release job, only for pushes to this feature branch with [yellow-release-v12] in the commit message, after both scanner and Android QA succeed. It reuses the original main-branch permanent-signing workflow; private signing material stays in GitHub runners, with cleanup. Source SHA, APK digest and public signer receipts accompany the APK.

Rollout uses the existing Railway service, original /data volume, same API/Firebase, exact reviewed source pin, and YELLOW_ANALYSIS_ENABLED=true. No additional Binance feed or requests are introduced by the companion. The ordinary restart/bootstrap still follows the existing request guard. Existing HOME records have no retrospective analysis; only subsequent accepted LONG A events are captured. Missing timeframe context yields PARTIAL and no plan.

This observation is the existing YELLOW_COMPANION_V1 LONG A companion, not an independent momentum scanner. A detector that triggers without LONG A remains a separate proposal and is not silently activated. No accuracy or profitability claim is established. Same-package device installation and actual new-signal analysis/FCM acceptance remain owner-side gates after signed build and backend verification.

Before deployment, verify CI at the exact source SHA, staged source and analysis flag, no unrelated staged changes, and preserved volume. After deployment, verify terminal SUCCESS, both feeds, guard state, Q/W membership where currently eligible, analysis enabled and summary API. Observe genuine future events; do not force one to manufacture acceptance.

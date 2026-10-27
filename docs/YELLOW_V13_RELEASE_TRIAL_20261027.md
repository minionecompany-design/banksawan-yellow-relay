# YELLOW v13 — controlled observational upgrade (27 October 2026)

- Repo: minionecompany-design/banksawan-yellow-relay
- Existing one YELLOW Android package: `id.banksawan.yellow`; versionCode 13, versionName `0.13.0-v2-entry-sl-tp-lights`.
- Must use the **same original V2 signer**; reject wrong keys, unsigned builds or DEMO/FCM-disabled releases.
- This v13 adds frozen ENTRY zone, SL and TP1/TP2/TP3 directly to original HOME and three corner lamps RED/YELLOW/GREEN with explicit descriptive heuristics.
- HIGH PRIORITY: LONG A is a pattern notification, **not entry authorization**. A green lamp says the basic technical conditions align at the latest known ticker (max 30 seconds old) during the 15-minute frozen scenario window. It is NOT a profit guarantee. Yellow never indicates safe entry.
- Notification delivery and PINED Pine v1.3 1M/5M/15M/1H remain unchanged; no new signal lane. Market must not be queried independently for lamp calculations.
- No automatic order, leverage, market execution, trailing SL, exchange rounding or changed user preferences.
- The preserved Android shell remains HOME / UNIVERSE as before, only HOME card content expands. ANALISIS still available.
- Flag backend contract requires `/api/home.analysisAvailable`, optional `analysisPreview` and `analysisLight`; on old backend, UI keeps working but shows no new preview or lamps.
- The release job itself does not deploy Railway, upload to a phone, merge draft PRs or imply real-money strategy acceptance.
- Before activating backend, confirm scanner + Android CI success, original `/data` volume, unchanged API/FCM settings, no pending service changes, deploy pinned exact commit, verify market readiness and check natural event on phone.
- Sign-off remains based on genuine post-activation LONG A events, including no-plan, ambiguous, no-entry, SL-first and TP1-first observations. The app must not assert `accurate` from passing CI.

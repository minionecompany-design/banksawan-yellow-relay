# YELLOW native-context fix — tested, deployment awaiting approval

The new backend application source is `112023d50ad297eba36b9acd539450fc53ce2de3`, tree `108e40c12d163287aa371d9a5e82cce1e15d692b`. It fixes the one-minute analysis delivery race with native higher-timeframe candle arrival. The entry rule alternative remains offline and unproven.

[GitHub CI run 40507932166](https://github.com/minionecompany-design/banksawan-yellow-relay/actions/runs/40507932166) completed SUCCESS for this exact commit: 254 Node tests, 15 Python release/upgrade checks, Android compile and behavior QA, package/version policy and signing refusal probe all passed. Permanently signed APK generation was skipped intentionally; Android code and APK v15 did not change.

The owner previously authorized LIVE deployment and then asked to continue. A subsequent `accept-deploy` attempt for this tested backend follow-up was nevertheless rejected by the automatic approval flow: “Cancelled — the user did not approve this action. No changes were made.” No retry through a different route was attempted.

Railway readback after the rejection confirms the original v15 deployment `c2827df1-83d4-4d2f-93d7-bcfd282b4e9c` remains SUCCESS and pinned to `86de4bd0ed18ed32ce92ac0942ad2fee24888c0f`. The pending patch `1289441c-d15c-4663-9f73-80ae10cd9aeb` changes only source.commitSha to the tested follow-up. It contains one non-destructive source change, no variables/resources/domain/volume/guard changes. It is staged, not applied. Existing volume `ea9edf2d-7294-443f-854c-001265c06405` remains at /data.

The follow-up must not be described as LIVE until approval succeeds and rollout is verified. New approval should name this exact backend source and existing production service. A normal rollout restarts and bootstraps the existing scanner; conservative restart/gap invalidation remains in force. There is no need for a new Android installation for this backend fix.

The recorded offline candidate comparison remains negative: 15 available cases, only three complete six-hour windows, three candidate confirmations at two unique symbol/time moments, zero paper fills, original AIN target still missed. No increased entry accuracy or profit is claimed. Full inputs/results and limitations are retained under `docs/evidence/entry-research-20261027/`.

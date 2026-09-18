# TikTok Android read-only — final hardening status

Branch: `feature/android-tiktok-local`

## Scope

This document closes the agreed Android TikTok read-only hardening work.

No Phase 14 is defined.

The implemented flow is:

`username -> exact TikTok search result -> profile identity confirmation -> relationship inspection -> persistent CHECK_FOLLOW_BACK result`

## Safety invariants

- Android provider relationship inspection is read-only.
- FOLLOW is disabled in the read-only provider bridge.
- UNFOLLOW is disabled in the read-only provider bridge.
- LIKE, COMMENT, DM and PROFILE_VISIT provider mutations are disabled.
- CHECK_FOLLOW_BACK is the only scheduler-automated TikTok business action.
- UNFOLLOW remains PENDING, `requiresReview=true`, `executeAt=null`.
- DISCOVERY_REVIEW remains human decision-only.
- A stale or losing worker cannot overwrite a newer CHECK_FOLLOW_BACK state.
- CHECK_FOLLOW_BACK terminal completion and relationship observation are transactional.
- A new follow restarts the follow-back window, invalidates an older running check and resets attempts to zero.
- Scheduling races are retried with a bounded maximum of three iterations.
- Dashboard discovery approval history is scoped to resolved DISCOVERY_REVIEW actions.

## Automated validation baseline

Validated before the final live smoke:

- TikTok test files: 18
- TikTok tests: 109/109 passing
- Full project tests: 154/154 passing
- TypeScript type-check: passing
- Known local untracked item: `backups/phase13_atomic_creation_20260917_115951/`

Baseline HEAD before adding the final smoke harness:

`6a3b6fd3f2b714c803e9f2b3140362748bf9697f`

## Final live Android smoke

Script:

`scripts/tiktok-readonly-final-smoke.ts`

The script performs:

1. Opens a real Appium TikTok session.
2. Pauses the autonomous agent loop.
3. Uses the read-only Android provider.
4. Searches an exact username and opens the exact result.
5. Confirms profile identity.
6. Reads the current relationship from TikTok UI XML.
7. Creates isolated temporary database rows under a unique smoke account key.
8. Persists the observed CHECK_FOLLOW_BACK result.
9. Uses `protected=true` on the temporary relationship so no UNFOLLOW review may be created.
10. Deletes temporary history/action/relationship rows in `finally`.
11. Deletes the Appium session.

Expected success markers:

```text
SMOKE_RESULT=PASS
ANDROID_PROVIDER=READ_ONLY
PERSISTENCE=PASS
```

The relationship value must be one of:

- `friends`
- `following`
- `follows_us`
- `not_following`

`unknown` is considered a failed live smoke because the UI could not be classified safely.

## Closure criteria

The Android read-only hardening work is considered closed when:

- the smoke script returns `SMOKE_RESULT=PASS`;
- no unexpected local source modifications are present;
- no TikTok mutation is performed;
- temporary smoke database records are cleaned;
- the branch remains green on the established automated baseline.

After that, further work should be treated as a new planned feature or a separately identified defect, not indefinite hardening of the completed scope.

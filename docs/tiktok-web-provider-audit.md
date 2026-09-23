# TikTok Web/PC provider audit

Branch: `feature/android-tiktok-local`

## Objective

Audit the existing TikTok browser/PC implementation and define how it should be integrated with the TikTok automation core already validated on Android.

The Android path is considered complete and must not be replaced or regressed.

Target architecture:

```text
TikTok Android ─┐
                ├─> TikTok Provider -> RelationshipManager
TikTok Web/PC ──┘                    -> Persistence
                                      -> Scheduler
                                      -> Follow-back checks
                                      -> Manual review queue
```

This audit does not define a new numbered phase.

---

## 1. Existing TikTok Web/PC stack

### Account and session management

Existing files:

- `src/actions/browser/tiktok-manager.ts`
- `src/actions/browser/tiktok-cookies.ts`
- `src/actions/browser/session-manager.ts`
- `src/interfaces/web/routes/tiktok-api.ts`

Existing capabilities:

- add TikTok accounts from cookies;
- parse Cookie Editor JSON or plain cookie strings;
- validate the presence of `sessionid`;
- inject cookies into a Playwright browser context before navigation;
- verify whether an account session is still authenticated;
- launch a TikTok browser session;
- credential-based Playwright login flow;
- expose account operations through `/api/tiktok/*`.

These pieces are reusable.

### Legacy autonomous browser agent

Existing files:

- `src/actions/browser/tiktok-agent.ts`
- `src/interfaces/web/routes/tiktok-agent-api.ts`
- `src/agents/tools/tiktok-tool.ts`
- `web/src/pages/TikTokTab.tsx`

The legacy browser agent independently implements:

- like;
- comment;
- follow;
- save/bookmark;
- its own warm-up;
- its own scheduling;
- daily/hourly counters;
- in-memory session deduplication;
- pause/resume/stop;
- UI statistics and logs.

This is a parallel automation stack and is not currently integrated with the newer TikTok relationship/persistence/scheduler core.

---

## 2. Existing TikTok automation core

Current core files:

- `src/tiktok/providers/tiktok-provider.ts`
- `src/tiktok/provider-registry.ts`
- `src/tiktok/relationship-manager.ts`
- `src/tiktok/persistence-service.ts`
- `src/tiktok/follow-back-handler.ts`
- `src/tiktok/scheduler.ts`
- persistent repositories under `src/memory/repositories/tiktok-*.ts`.

Already validated behavior includes:

- Android read-only relationship inspection;
- persistent successful-follow registration;
- persistent 48-hour follow-back checks;
- atomic queue handling;
- retry/recovery safety;
- manual-only UNFOLLOW review;
- manual-only DISCOVERY_REVIEW;
- stale-worker protection;
- transactional relationship/check completion;
- provider abstraction for Android and dry-run.

This core should remain the source of truth for relationship and follow-back business logic.

---

## 3. Integration gaps found

### GAP A — no `web` provider type

Current `TikTokProviderName` supports only:

```text
android
dry-run
```

The follow-back handler also explicitly accepts only those two provider names.

Required change:

- add `web` to `TikTokProviderName`;
- allow `web` in the follow-back handler provider parser;
- add a dedicated Web provider implementation.

Do not route the legacy autonomous `TikTokAgent` directly into the scheduler.

### GAP B — provider calls are not account-aware enough for Web

A browser check must use the same TikTok account that originally followed the target.

The persistent action already has `accountKey`, but `TikTokTarget` currently carries only:

- `targetKey`;
- `username`;
- `displayName`.

For Web, the provider needs the originating account identity.

Minimal compatible design:

- add optional `accountKey` to `TikTokTarget`;
- make the follow-back handler pass `action.accountKey`;
- Android may ignore it;
- Web uses it to resolve the correct browser TikTok account/session.

For browser-originated follows, use the TikTok browser account id as `accountKey`.

This preserves account isolation without duplicating the relationship model.

### GAP C — browser follows bypass persistent relationship registration

The legacy `TikTokAgent.executeFollow()` clicks Follow and only updates in-memory counters/session sets.

It does not call:

`TikTokRelationshipManager.registerFollow()`

Therefore a successful browser follow currently does not automatically create the persistent 48-hour `CHECK_FOLLOW_BACK`.

Before browser Follow is considered integrated, every confirmed successful Web follow must call the same relationship manager used by the Android/core path with:

- browser account id as `accountKey`;
- stable username-based target key;
- exact username/display name when available;
- `provider='web'`;
- actual follow timestamp.

### GAP D — no Web relationship classifier/provider

There is no current Web implementation of:

`checkRelationship(target)`

The first Web provider capability must be read-only.

Required first flow:

```text
accountKey
  -> resolve TikTok browser account
  -> open authenticated headless Playwright session
  -> navigate directly to exact @username profile
  -> confirm exact profile identity
  -> inspect relationship state
  -> return TikTokRelationshipObservation
  -> close/reuse session safely
```

Relationship states must map to the existing domain only:

- `friends`;
- `following`;
- `follows_us`;
- `not_following`;
- `unknown`.

Do not invent a second Web-only relationship model.

Selectors must be derived from a real read-only browser capture before implementation. Do not assume Android selectors apply to Web.

### GAP E — production wiring of provider/scheduler was not found

The audit found the provider registry, follow-back handler and scheduler implementation plus their tests, but did not find production composition that registers the providers and continuously invokes `runTikTokScheduler()`.

Before Web is enabled, runtime composition must be explicit:

```text
registry
  -> register Android provider when Android dependency is available
  -> register Web provider
  -> create follow-back scheduler handler
  -> schedule persistent scheduler ticks
```

The existing scheduler safety rules must remain unchanged.

### GAP F — BrowserSessionManager is Linux-dependent

`BrowserSessionManager.getAvailableRamMB()` reads:

`/proc/meminfo`

On Windows this read fails and the function returns `0`.

`createSession()` then rejects the browser session because available RAM is reported below 500 MB.

Therefore the existing Playwright session manager is not currently usable for the planned local Windows Web/PC flow without a compatibility fix.

Additional VNC-specific operations are Linux-oriented:

- Xvfb;
- x11vnc;
- websockify;
- `pkill`;
- `ss | grep`.

Recommended compatibility rule:

- headless Playwright sessions must be cross-platform;
- use Node/OS APIs as fallback for RAM detection;
- VNC remains optional and platform-specific;
- initial Web provider/smoke should use `withVnc=false`.

No change is required to the already working Android/Appium path.

### GAP G — browser account cookies are stored in plaintext JSON

Status: **CLOSED**

The original plaintext storage in `data/tiktok-accounts.json` has been replaced by an encrypted cookie vault.

Current design:

- account metadata remains in `data/tiktok-accounts.json`;
- cookie values are stored separately in `data/tiktok-cookie-vault/<accountId>.json`;
- Windows uses DPAPI scoped to `CurrentUser`;
- non-Windows uses AES-256-GCM and requires `TIKTOK_COOKIE_ENCRYPTION_KEY`;
- legacy plaintext cookie fields migrate automatically on load;
- account metadata stores only `cookieSecretRef` and `cookieCount`;
- real Windows smoke validated `windows-dpapi`, removal of plaintext cookie fields, and active-account rehydration.

---

## 4. What can be reused unchanged

| Existing component | Decision |
| --- | --- |
| Cookie parsing/validation | Reuse |
| Playwright cookie conversion | Reuse |
| TikTok account CRUD/API | Reuse |
| Account verification logic | Reuse/adapt only if required |
| BrowserSessionManager session lifecycle | Reuse after Windows compatibility fix |
| Existing persistent TikTok relationships | Reuse |
| Existing action queue | Reuse |
| Existing 48h scheduling | Reuse |
| Existing follow-back handler | Extend only for `web` |
| Existing manual UNFOLLOW review | Reuse unchanged |
| Existing DISCOVERY_REVIEW | Reuse unchanged |
| Existing Android provider | Preserve unchanged |
| Legacy browser agent warm-up/action scheduler | Keep separate initially |
| Legacy browser agent relationship logic | Do not use; none exists |

---

## 5. What must not be duplicated

Do not create Web-specific copies of:

- relationship tables;
- action queues;
- 48-hour timers;
- retry logic;
- stale-running recovery;
- UNFOLLOW review queues;
- discovery review queues;
- dashboard approval semantics.

The provider is responsible for interacting with TikTok.

The automation core remains responsible for business state and persistence.

---

## 6. Recommended implementation order

### Step 1 — Windows-safe headless browser sessions

Status: **PASS**

Validated on Windows (`win32`) with Playwright 1.58.2 / Chromium headless.

Observed result:

```text
BROWSER_HEADLESS_SMOKE=PASS
PLATFORM=win32
PLAYWRIGHT_SESSION=PASS
DOM_RENDER=PASS
VNC_ENABLED=false
SESSION_CLEANUP=PASS
```

Implementation:

- Linux still prefers `/proc/meminfo` for `MemAvailable`;
- Windows/macOS use Node `os.freemem()` / `os.totalmem()`;
- Linux-only orphan cleanup is skipped on non-Linux systems;
- VNC remains explicitly Linux-only;
- cross-platform Web provider work uses `withVnc=false`.

Validated implementation HEAD:

`aab669e50758a70c64922dd3c4275dfb2d9c8933`


### Step 2 — Web provider contract

Status: **PASS**

Completed:

- added `web` to `TikTokProviderName`;
- added optional `accountKey` to `TikTokTarget`;
- follow-back handler now accepts `web` and forwards `action.accountKey`;
- focused provider/follow-back tests pass;
- no provider mutation was enabled.

### Step 3 — read-only Web TikTok diagnostic

Status: **PASS**

Validated on Windows with a visible Playwright mobile emulation profile (`Pixel 5`):

- authenticated session as the imported TikTok Web account;
- exact profile navigation;
- exact profile relationship control;
- `data-e2e="follow-button"` observed for the primary relationship button;
- `Follow` classified from the real DOM;
- no mutation performed;
- challenge handling remained manual-only;
- persistent profile/session reuse was validated.

### Step 4 — `WebTikTokProvider.checkRelationship()`

Status: **PASS**

Implemented and validated:

- exact username required;
- exact profile identity confirmed;
- `Follow` -> `not_following`;
- `Following` -> `following`;
- `Friends` -> `friends`;
- `Follow back` -> `follows_us`;
- ambiguous/challenge/invalid states -> `unknown`;
- `unknown` remains retryable;
- persistent mobile Web session reuse;
- provider `follow()` and `unfollow()` remain blocked/read-only.

### Step 5 — provider runtime wiring

Status: **PASS**

Completed:

- production runtime registers the Web provider;
- scheduler ticks are provider-scoped;
- stale-running recovery is also provider-scoped;
- Android actions are not claimed when Android is not registered;
- overlapping scheduler ticks are deduplicated;
- real database smoke validated `provider=web` scope with SELECT-only behavior;
- no action was created or executed by the database smoke;
- UNFOLLOW remains review-only.

### Step 6 — integrate successful Web Follow

Status: **PASS**

Completed:

- Web Follow requires an exact username before clicking;
- post-click relationship must confirm `following` or `friends`;
- unconfirmed Follow is not persisted;
- confirmed Web Follow uses the common `TikTokRelationshipManager`;
- browser account id is preserved as `accountKey`;
- provider is preserved as `web`;
- the existing persistence layer creates the same `CHECK_FOLLOW_BACK`;
- default follow-back delay remains 48 hours;
- no second timer/scheduler was introduced;
- no automatic UNFOLLOW is created.

### Step 7 — panel/provider controls

Status: **PASS**

Completed:

- provider status API;
- read-only relationship-check API;
- provider/account selection in the TikTok dashboard;
- persistent-profile/session-reuse status;
- challenge policy shown as UNKNOWN + retry;
- provider Follow/Unfollow capabilities shown as disabled;
- cookies are not exposed through provider status;
- dashboard production build passes;
- legacy TikTokAgent controls remain present.

---

## 7. Current decision

The Web/PC provider integration sequence defined by this audit is **complete**.

Completed milestones:

- Step 1 — Windows-safe browser sessions: PASS
- Step 2 — Web provider contract: PASS
- Step 3 — authenticated read-only Web diagnostic: PASS
- Step 4 — `WebTikTokProvider.checkRelationship()`: PASS
- Step 5 — provider runtime wiring: PASS
- Step 6 — confirmed Web Follow -> common relationship/persistence core: PASS
- Step 7 — panel/provider controls: PASS
- GAP G — plaintext cookie storage: **CLOSED**

Cookie security now uses an encrypted vault:

- Windows: DPAPI `CurrentUser`;
- non-Windows: AES-256-GCM with `TIKTOK_COOKIE_ENCRYPTION_KEY`;
- legacy plaintext cookie fields are migrated automatically;
- `data/tiktok-accounts.json` stores metadata + vault reference only;
- cookie values are not exposed by the provider-status API.

Current safety posture remains unchanged:

- Web provider relationship checks are read-only;
- provider Follow/Unfollow remain disabled;
- legacy browser-agent Follow integration persists only confirmed successful follows;
- UNFOLLOW remains manual-review only;
- challenge/CAPTCHA handling remains manual and is never bypassed automatically.

---

## 8. Preserved invariants

Throughout the Web integration:

- Android implementation remains intact;
- no mass follow/unfollow;
- no automatic UNFOLLOW;
- no duplicate 48-hour timer implementation;
- no direct scheduler execution of review actions;
- UNKNOWN relationship remains retryable;
- provider-specific UI details stay inside providers;
- relationship/persistence rules stay in the common core.

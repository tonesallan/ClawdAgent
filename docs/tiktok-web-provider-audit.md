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

`TikTokAccountManager` stores full cookie values in:

`data/tiktok-accounts.json`

This includes authentication session cookies.

This should be treated as a security debt item before a production browser provider is considered complete.

It is not necessary to rewrite account management for the first read-only provider proof, but the integration must not log or expose cookie values.

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

Goal:

`BrowserSessionManager.createSession(undefined, false)`

must work on the local Windows development machine.

Changes should be limited to cross-platform system/resource detection.

Validation:

- type-check;
- create headless session;
- navigate to a harmless page;
- close session cleanly;
- no Android changes.

### Step 2 — Web provider contract

Goal:

- add `web` provider name;
- make targets account-aware;
- extend follow-back handler parser;
- add provider-level tests;
- no browser mutation yet.

### Step 3 — read-only Web TikTok diagnostic

Goal:

capture the real authenticated profile DOM for one exact username.

Validate:

- cookie/session reuse;
- exact profile URL/identity;
- relevant follow relationship controls/text;
- selectors required for classification.

No follow/unfollow/like/comment/save during this diagnostic.

### Step 4 — `WebTikTokProvider.checkRelationship()`

Goal:

implement the Web equivalent of the Android read-only relationship check.

Required properties:

- exact username required;
- exact profile identity confirmed;
- unknown state remains retryable;
- browser session cleaned up;
- no mutation.

### Step 5 — provider runtime wiring

Goal:

register `web` and wire it to the existing follow-back scheduler.

Validate:

`CHECK_FOLLOW_BACK(provider=web) -> Web provider -> RelationshipManager -> Persistence`

UNFOLLOW must remain review-only.

### Step 6 — integrate successful Web Follow

Only after read-only Web checks are stable.

When the browser agent confirms a real successful follow:

`Web Follow -> RelationshipManager.registerFollow(provider=web) -> persistent 48h CHECK_FOLLOW_BACK`

Do not introduce a second timer or follow-back implementation inside `TikTokAgent`.

### Step 7 — panel/provider controls

After provider integration is stable:

- expose provider/account selection;
- show browser-provider status;
- reuse existing relationship/review data;
- keep legacy agent controls compatible while migration is incremental.

---

## 7. Current decision

The immediate next implementation should be **Step 1: make headless BrowserSessionManager cross-platform on Windows**.

Reason:

the Web provider cannot be tested locally until a Playwright session can be created.

After that, the next safe milestone is a **read-only authenticated TikTok Web diagnostic**, not browser follow/comment automation.

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

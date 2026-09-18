import 'dotenv/config';

import {
  eq,
} from 'drizzle-orm';

import {
  MobileAgent,
  type MobileAgentConfig,
} from '../src/actions/mobile/mobile-agent.js';

import {
  createReadOnlyAndroidTikTokProvider,
} from '../src/tiktok/providers/mobile-agent-android-bridge.js';

import {
  createTikTokAction,
} from '../src/memory/repositories/tiktok-actions.js';

import {
  recordTikTokFollowBackCheckResult,
} from '../src/tiktok/persistence-service.js';

import {
  closeDatabase,
  getDb,
  initDatabase,
} from '../src/memory/database.js';

import {
  tiktokActionHistory,
  tiktokActions,
  tiktokUserRelationships,
} from '../src/memory/schema.js';

const username =
  (
    process.env.TIKTOK_SMOKE_USERNAME ??
    'tiktok'
  )
    .trim()
    .replace(/^@/, '');

const deviceId =
  process.env.TIKTOK_SMOKE_DEVICE?.trim();

const appiumUrl =
  (
    process.env.TIKTOK_SMOKE_APPIUM_URL ??
    'http://127.0.0.1:4723'
  ).trim();

if (!deviceId) {
  throw new Error(
    'TIKTOK_SMOKE_DEVICE is required.',
  );
}

const now =
  new Date();

const suffix =
  `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

const accountKey =
  `smoke:${suffix}`;

const targetKey =
  `username:${username}`;

const agentId =
  `tiktok-readonly-smoke-${suffix}`;

const config: MobileAgentConfig = {
  id:
    agentId,
  app:
    'tiktok',
  deviceId,
  appiumUrl,
  actions: [],
  schedule: {},
  activeHours: {
    weekday: {
      start: 0,
      end: 24,
    },
    weekend: {
      start: 0,
      end: 24,
    },
  },
  content: {
    tone:
      'readonly-smoke',
    language:
      'pt-BR',
    topics: [],
    maxLength:
      1,
  },
  safety: {
    minDelaySeconds:
      3600,
    maxActionsPerHour:
      0,
    pauseOnErrorCount:
      1,
    pauseDurationMinutes:
      60,
  },
  testMode:
    true,
};

const agent =
  MobileAgent.createAgent(
    config,
  );

await initDatabase();

const db =
  getDb();

let createdActionId:
  string | null =
    null;

let createdReviewId:
  string | null =
    null;

async function cleanup(): Promise<void> {
  try {
    if (createdReviewId) {
      await db
        .delete(
          tiktokActionHistory,
        )
        .where(
          eq(
            tiktokActionHistory.actionId,
            createdReviewId,
          ),
        );

      await db
        .delete(
          tiktokActions,
        )
        .where(
          eq(
            tiktokActions.id,
            createdReviewId,
          ),
        );
    }

    if (createdActionId) {
      await db
        .delete(
          tiktokActionHistory,
        )
        .where(
          eq(
            tiktokActionHistory.actionId,
            createdActionId,
          ),
        );

      await db
        .delete(
          tiktokActions,
        )
        .where(
          eq(
            tiktokActions.id,
            createdActionId,
          ),
        );
    }

    await db
      .delete(
        tiktokUserRelationships,
      )
      .where(
        eq(
          tiktokUserRelationships.accountKey,
          accountKey,
        ),
      );
  }
  catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `[CLEANUP-WARN] ${message}`,
    );
  }
}

try {
  console.log(
    '[1/5] Starting read-only Android session...',
  );

  await agent.start();

  /*
   * start() begins the legacy warmup loop.
   * Pause immediately so no autonomous action loop can start.
   * A possible first warmup swipe is navigation-only.
   */
  agent.pause();

  const provider =
    createReadOnlyAndroidTikTokProvider(
      agent,
    );

  console.log(
    `[2/5] Opening exact profile @${username}...`,
  );

  const observation =
    await provider.checkRelationship({
      targetKey,
      username,
    });

  console.log(
    '[3/5] Live relationship observed:',
    observation.relationship,
  );

  if (
    observation.details?.readOnly !==
      true
  ) {
    throw new Error(
      'Provider observation is not marked readOnly=true.',
    );
  }

  if (
    observation.relationship ===
      'unknown'
  ) {
    throw new Error(
      'Live relationship classification returned unknown.',
    );
  }

  console.log(
    '[4/5] Seeding temporary persistence rows...',
  );

  const followedAt =
    new Date(
      now.getTime() -
        49 * 60 * 60 * 1000,
    );

  const followBackCheckAt =
    new Date(
      followedAt.getTime() +
        48 * 60 * 60 * 1000,
    );

  const [relationship] =
    await db
      .insert(
        tiktokUserRelationships,
      )
      .values({
        accountKey,
        targetKey,
        username,
        displayName:
          'Smoke Test',
        relationshipState:
          'following',
        followedByUs:
          true,
        followsUs:
          null,
        followedByUsAt:
          followedAt,
        followBackCheckAt,
        processed:
          false,
        protected:
          true,
        metadata: {
          source:
            'readonly_smoke',
        },
        updatedAt:
          now,
      })
      .returning();

  if (!relationship) {
    throw new Error(
      'Failed to seed temporary relationship.',
    );
  }

  const checkAction =
    await createTikTokAction({
      accountKey,
      type:
        'CHECK_FOLLOW_BACK',
      targetKey,
      targetUsername:
        username,
      targetDisplayName:
        'Smoke Test',
      status:
        'running',
      executeAt:
        followBackCheckAt,
      provider:
        'android',
      payload: {
        relationshipId:
          relationship.id,
        reason:
          'readonly_smoke',
      },
    });

  createdActionId =
    checkAction.id;

  const persisted =
    await recordTikTokFollowBackCheckResult({
      checkActionId:
        checkAction.id,
      accountKey,
      targetKey,
      username,
      relationshipState:
        observation.relationship,
      provider:
        'android',
      checkedAt:
        observation.observedAt,
    });

  createdReviewId =
    persisted
      .unfollowReviewAction
      ?.id ??
    null;

  if (
    persisted.relationship
      .processed !==
      true
  ) {
    throw new Error(
      'Persisted relationship was not marked processed.',
    );
  }

  /*
   * The temporary row is protected=true.
   * Even if the observation is FOLLOWING,
   * no UNFOLLOW review may be created.
   */
  if (
    persisted
      .unfollowReviewAction !==
      null
  ) {
    throw new Error(
      'Read-only smoke unexpectedly created an UNFOLLOW review.',
    );
  }

  console.log(
    '[5/5] Persistence completed and no UNFOLLOW review was created.',
  );

  console.log('');
  console.log(
    'SMOKE_RESULT=PASS',
  );
  console.log(
    `USERNAME=@${username}`,
  );
  console.log(
    `RELATIONSHIP=${observation.relationship}`,
  );
  console.log(
    'ANDROID_PROVIDER=READ_ONLY',
  );
  console.log(
    'PERSISTENCE=PASS',
  );
}
finally {
  await cleanup();

  await agent.stop();

  MobileAgent.removeAgent(
    agentId,
  );

  await closeDatabase();
}

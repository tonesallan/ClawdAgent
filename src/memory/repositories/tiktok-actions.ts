import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
} from 'drizzle-orm';
import { getDb } from '../database.js';
import {
  tiktokActionHistory,
  tiktokActions,
} from '../schema.js';
import {
  TIKTOK_ACTION_STATUSES,
  TIKTOK_ACTION_TYPES,
} from '../../tiktok/domain.js';
import type {
  TikTokActionStatus,
  TikTokActionType,
} from '../../tiktok/domain.js';

export type TikTokAction = typeof tiktokActions.$inferSelect;

export interface CreateTikTokActionInput {
  accountKey: string;
  type: TikTokActionType;
  targetKey?: string | null;
  targetUsername?: string | null;
  targetDisplayName?: string | null;
  status: TikTokActionStatus;
  executeAt?: Date | null;
  priority?: number;
  maxAttempts?: number;
  provider?: string;
  payload?: Record<string, unknown>;
}

function assertTikTokActionCreationSafety(
  input: CreateTikTokActionInput,
): void {
  const requiresReview =
    input.payload?.requiresReview === true;

  if (
    input.type ===
    TIKTOK_ACTION_TYPES.UNFOLLOW
  ) {
    if (
      input.status !==
        TIKTOK_ACTION_STATUSES.PENDING ||
      input.executeAt != null ||
      !requiresReview
    ) {
      throw new Error(
        'TikTok UNFOLLOW must remain a pending manual review with executeAt=null and requiresReview=true.',
      );
    }

    return;
  }

  if (
    input.type ===
    TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW
  ) {
    if (
      input.status !==
        TIKTOK_ACTION_STATUSES.PENDING ||
      input.executeAt != null ||
      !requiresReview
    ) {
      throw new Error(
        'TikTok DISCOVERY_REVIEW must remain a pending manual review with executeAt=null and requiresReview=true.',
      );
    }
  }
}


export async function createTikTokAction(
  input: CreateTikTokActionInput,
): Promise<TikTokAction> {
  assertTikTokActionCreationSafety(
    input,
  );

  const db = getDb();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tiktokActions)
      .values({
        accountKey: input.accountKey,
        type: input.type,
        targetKey: input.targetKey ?? null,
        targetUsername: input.targetUsername ?? null,
        targetDisplayName: input.targetDisplayName ?? null,
        status: input.status,
        executeAt: input.executeAt ?? null,
        priority: input.priority ?? 5,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        provider: input.provider ?? 'android',
        payload: input.payload ?? {},
        updatedAt: new Date(),
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create TikTok action.');
    }

    await tx.insert(tiktokActionHistory).values({
      actionId: row.id,
      status: row.status,
      provider: row.provider,
      metadata: {
        event: 'created',
      },
    });

    return row;
  });
}

const OPEN_TIKTOK_ACTION_STATUSES:
  readonly TikTokActionStatus[] = [
    'pending',
    'scheduled',
    'running',
  ];

export interface CreateOrReuseOpenTikTokActionResult {
  action: TikTokAction;
  created: boolean;
}

/**
 * Atomically creates or reuses one logically equivalent OPEN
 * TikTok action.
 *
 * Correctness is enforced by the PostgreSQL partial UNIQUE
 * index:
 *
 * account_key + type + target_key
 *
 * only while status is pending/scheduled/running.
 *
 * ON CONFLICT DO NOTHING lets concurrent creators race safely:
 * exactly one INSERT wins and every loser reads the winner.
 */
export async function createOrReuseOpenTikTokAction(
  input:
    CreateTikTokActionInput & {
      targetKey: string;
    },
): Promise<CreateOrReuseOpenTikTokActionResult> {

  assertTikTokActionCreationSafety(
    input,
  );

  if (
    !OPEN_TIKTOK_ACTION_STATUSES.includes(
      input.status,
    )
  ) {
    throw new Error(
      'createOrReuseOpenTikTokAction requires an open status.',
    );
  }

  if (!input.targetKey) {
    throw new Error(
      'createOrReuseOpenTikTokAction requires targetKey.',
    );
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(tiktokActions)
      .values({
        accountKey: input.accountKey,
        type: input.type,
        targetKey: input.targetKey,
        targetUsername:
          input.targetUsername ?? null,
        targetDisplayName:
          input.targetDisplayName ?? null,
        status: input.status,
        executeAt: input.executeAt ?? null,
        priority: input.priority ?? 5,
        attempts: 0,
        maxAttempts:
          input.maxAttempts ?? 3,
        provider:
          input.provider ?? 'android',
        payload:
          input.payload ?? {},
        updatedAt:
          new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      await tx
        .insert(tiktokActionHistory)
        .values({
          actionId:
            created.id,
          status:
            created.status,
          provider:
            created.provider,
          metadata: {
            event:
              'created',
          },
        });

      return {
        action:
          created,
        created:
          true,
      };
    }

    /*
     * PostgreSQL waits for the winning concurrent INSERT to
     * finish before ON CONFLICT returns. Under READ COMMITTED
     * this following statement then sees the committed winner.
     */
    const [existing] = await tx
      .select()
      .from(tiktokActions)
      .where(
        and(
          eq(
            tiktokActions.accountKey,
            input.accountKey,
          ),
          eq(
            tiktokActions.type,
            input.type,
          ),
          eq(
            tiktokActions.targetKey,
            input.targetKey,
          ),
          inArray(
            tiktokActions.status,
            [
              'pending',
              'scheduled',
              'running',
            ],
          ),
        ),
      )
      .orderBy(
        asc(
          tiktokActions.createdAt,
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error(
        'Open TikTok action conflict occurred but the winning row could not be loaded.',
      );
    }

    return {
      action:
        existing,
      created:
        false,
    };
  });
}

export async function getTikTokAction(
  id: string,
): Promise<TikTokAction | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(tiktokActions)
    .where(eq(tiktokActions.id, id))
    .limit(1);

  return row ?? null;
}

export async function findOpenTikTokAction(
  accountKey: string,
  type: TikTokActionType,
  targetKey: string,
): Promise<TikTokAction | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(tiktokActions)
    .where(
      and(
        eq(tiktokActions.accountKey, accountKey),
        eq(tiktokActions.type, type),
        eq(tiktokActions.targetKey, targetKey),
        inArray(
          tiktokActions.status,
          ['pending', 'scheduled', 'running'],
        ),
      ),
    )
    .orderBy(asc(tiktokActions.createdAt))
    .limit(1);

  return row ?? null;
}

export interface RescheduleTikTokActionOptions {
  /**
   * Optimistic concurrency guard.
   *
   * When provided, the reschedule only succeeds if the action
   * is still in this status at UPDATE time.
   */
  expectedStatus?: TikTokActionStatus;

  /**
   * Optional execution error preserved while the action
   * waits for another attempt.
   */
  error?: string | null;

  /**
   * Retry count already consumed before rescheduling.
   */
  attempts?: number;

  /**
   * Extra immutable audit metadata.
   */
  metadata?: Record<string, unknown>;
}

export async function rescheduleTikTokAction(
  id: string,
  executeAt: Date,
  payload?: Record<string, unknown>,
  options: RescheduleTikTokActionOptions = {},
): Promise<TikTokAction | null> {

  const db = getDb();

  return db.transaction(async (tx) => {

    const [current] =
      await tx
        .select({
          type:
            tiktokActions.type,
        })
        .from(
          tiktokActions,
        )
        .where(
          eq(
            tiktokActions.id,
            id,
          ),
        )
        .limit(1);

    if (!current) {
      return null;
    }

    if (
      current.type ===
      TIKTOK_ACTION_TYPES.UNFOLLOW
    ) {
      throw new Error(
        'TikTok UNFOLLOW review cannot be rescheduled or given executeAt.',
      );
    }

    if (
      current.type ===
      TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW
    ) {
      throw new Error(
        'TikTok DISCOVERY_REVIEW cannot be rescheduled or given executeAt.',
      );
    }

    if (
      current.type ===
        TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK
    ) {
      if (
        options.expectedStatus !==
          TIKTOK_ACTION_STATUSES.SCHEDULED &&
        options.expectedStatus !==
          TIKTOK_ACTION_STATUSES.RUNNING
      ) {
        throw new Error(
          'TikTok CHECK_FOLLOW_BACK reschedule requires expectedStatus=scheduled or running.',
        );
      }
    }

    const [row] =
      await tx
        .update(tiktokActions)
        .set({
          status:
            'scheduled',

          executeAt,

          ...(payload !== undefined
            ? {
                payload,
              }
            : {}),

          error:
            options.error ?? null,

          ...(options.attempts !== undefined
            ? {
                attempts:
                  options.attempts,
              }
            : {}),

          updatedAt:
            new Date(),
        })
        .where(
          options.expectedStatus !== undefined
            ? and(
                eq(
                  tiktokActions.id,
                  id,
                ),
                eq(
                  tiktokActions.status,
                  options.expectedStatus,
                ),
              )
            : eq(
                tiktokActions.id,
                id,
              ),
        )
        .returning();

    if (!row) {
      return null;
    }

    await tx
      .insert(tiktokActionHistory)
      .values({
        actionId:
          row.id,

        status:
          'scheduled',

        provider:
          row.provider,

        error:
          options.error ?? null,

        metadata: {
          ...(options.metadata ?? {}),

          event:
            'rescheduled',

          executeAt:
            executeAt.toISOString(),
        },
      });

    return row;
  });
}
export interface TransitionTikTokActionInput {
  status: TikTokActionStatus;
  result?: Record<string, unknown> | null;
  error?: string | null;
  attempts?: number;
  metadata?: Record<string, unknown>;
}

export async function transitionTikTokAction(
  id: string,
  input: TransitionTikTokActionInput,
): Promise<TikTokAction | null> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [current] =
      await tx
        .select({
          type:
            tiktokActions.type,
          status:
            tiktokActions.status,
        })
        .from(
          tiktokActions,
        )
        .where(
          eq(
            tiktokActions.id,
            id,
          ),
        )
        .limit(1);

    if (!current) {
      return null;
    }

    if (
      current.type ===
        TIKTOK_ACTION_TYPES.UNFOLLOW &&
      input.status !==
        TIKTOK_ACTION_STATUSES.PENDING &&
      input.status !==
        TIKTOK_ACTION_STATUSES.CANCELLED
    ) {
      throw new Error(
        'TikTok UNFOLLOW review may only remain pending or be cancelled manually.',
      );
    }

    if (
      current.type ===
        TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW &&
      input.status !==
        TIKTOK_ACTION_STATUSES.PENDING &&
      input.status !==
        TIKTOK_ACTION_STATUSES.SUCCESS &&
      input.status !==
        TIKTOK_ACTION_STATUSES.CANCELLED
    ) {
      throw new Error(
        'TikTok DISCOVERY_REVIEW may only remain pending or resolve to success/cancelled.',
      );
    }

    const transitionWhere =
      current.type ===
        TIKTOK_ACTION_TYPES.UNFOLLOW ||
      current.type ===
        TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW
        ? and(
            eq(
              tiktokActions.id,
              id,
            ),
            eq(
              tiktokActions.status,
              TIKTOK_ACTION_STATUSES.PENDING,
            ),
          )
        : current.type ===
              TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK &&
            (
              input.status ===
                TIKTOK_ACTION_STATUSES.SUCCESS ||
              input.status ===
                TIKTOK_ACTION_STATUSES.FAILED
            )
          ? and(
              eq(
                tiktokActions.id,
                id,
              ),
              eq(
                tiktokActions.status,
                TIKTOK_ACTION_STATUSES.RUNNING,
              ),
            )
          : eq(
              tiktokActions.id,
              id,
            );

    const [row] = await tx
      .update(tiktokActions)
      .set({
        status: input.status,
        result: input.result ?? null,
        error: input.error ?? null,
        attempts: input.attempts,
        updatedAt: new Date(),
      })
      .where(
        transitionWhere,
      )
      .returning();

    if (!row) {
      return null;
    }

    await tx.insert(tiktokActionHistory).values({
      actionId: row.id,
      status: input.status,
      provider: row.provider,
      result: input.result ?? null,
      error: input.error ?? null,
      metadata: input.metadata ?? {},
    });

    return row;
  });
}

/**
 * Only due SCHEDULED CHECK_FOLLOW_BACK actions are returned here.
 *
 * PENDING actions are intentionally excluded because they can represent
 * actions waiting for manual review. Non-automated scheduled action
 * types are also excluded at the query level so legacy/invalid rows
 * cannot consume the scheduler batch limit and starve legitimate
 * CHECK_FOLLOW_BACK work.
 */
export async function listDueScheduledTikTokActions(
  now = new Date(),
  limit = 50,
  providers?: readonly string[],
): Promise<TikTokAction[]> {
  const db = getDb();

  if (
    providers !== undefined &&
    providers.length === 0
  ) {
    return [];
  }

  const conditions = [
    eq(
      tiktokActions.type,
      TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
    ),
    eq(
      tiktokActions.status,
      'scheduled',
    ),
    lte(
      tiktokActions.executeAt,
      now,
    ),
  ];

  if (
    providers !== undefined
  ) {
    conditions.push(
      inArray(
        tiktokActions.provider,
        [...providers],
      ),
    );
  }

  return db
    .select()
    .from(tiktokActions)
    .where(
      and(
        ...conditions,
      ),
    )
    .orderBy(
      asc(tiktokActions.priority),
      asc(tiktokActions.executeAt),
      asc(tiktokActions.createdAt),
    )
    .limit(limit);
}

/**
 * Number of successful executions of one action type
 * since the supplied timestamp.
 *
 * Uses immutable action history instead of the mutable
 * current action status.
 */
export async function countTikTokSuccessfulActionsSince(
  accountKey: string,
  type: TikTokActionType,
  since: Date,
): Promise<number> {

  const db = getDb();

  /*
   * Quotas count successful ACTIONS, not history rows.
   *
   * This prevents one logical action from consuming quota
   * more than once if duplicate SUCCESS history entries are
   * ever recorded.
   *
   * updatedAt is explicitly written by transitionTikTokAction
   * when the action reaches SUCCESS.
   */
  const [row] =
    await db
      .select({
        value: count(),
      })
      .from(tiktokActions)
      .where(
        and(
          eq(
            tiktokActions.accountKey,
            accountKey,
          ),
          eq(
            tiktokActions.type,
            type,
          ),
          eq(
            tiktokActions.status,
            'success',
          ),
          gte(
            tiktokActions.updatedAt,
            since,
          ),
        ),
      );

  return Number(row?.value ?? 0);
}

/**
 * Timestamp of the most recent successful action for an
 * account/action type.
 */
export async function getLastTikTokSuccessfulActionAt(
  accountKey: string,
  type: TikTokActionType,
): Promise<Date | null> {

  const db = getDb();

  const [row] =
    await db
      .select({
        updatedAt:
          tiktokActions.updatedAt,
      })
      .from(tiktokActions)
      .where(
        and(
          eq(
            tiktokActions.accountKey,
            accountKey,
          ),
          eq(
            tiktokActions.type,
            type,
          ),
          eq(
            tiktokActions.status,
            'success',
          ),
        ),
      )
      .orderBy(
        desc(
          tiktokActions.updatedAt,
        ),
      )
      .limit(1);

  return row?.updatedAt ?? null;
}

/**
 * Lists actions waiting for explicit human review.
 *
 * PENDING rows are never returned by the automatic scheduler.
 */
export async function listPendingTikTokActionsByType(
  accountKey: string,
  type: TikTokActionType,
  limit = 50,
): Promise<TikTokAction[]> {

  const db = getDb();

  const safeLimit =
    Math.min(
      200,
      Math.max(
        1,
        Math.floor(limit),
      ),
    );

  return db
    .select()
    .from(tiktokActions)
    .where(
      and(
        eq(
          tiktokActions.accountKey,
          accountKey,
        ),
        eq(
          tiktokActions.type,
          type,
        ),
        eq(
          tiktokActions.status,
          'pending',
        ),
      ),
    )
    .orderBy(
      asc(
        tiktokActions.createdAt,
      ),
    )
    .limit(
      safeLimit,
    );
}

/**
 * Lists TikTok actions across all configured accounts.
 *
 * Intended for authenticated dashboard/review surfaces.
 * This function does not execute or schedule any action.
 */
export async function listTikTokActionsByTypeAcrossAccounts(
  type: TikTokActionType,
  statuses?: TikTokActionStatus[],
  limit = 100,
): Promise<TikTokAction[]> {

  const db = getDb();

  const safeLimit =
    Math.min(
      500,
      Math.max(
        1,
        Math.floor(limit),
      ),
    );

  if (
    statuses &&
    statuses.length > 0
  ) {

    return db
      .select()
      .from(tiktokActions)
      .where(
        and(
          eq(
            tiktokActions.type,
            type,
          ),
          inArray(
            tiktokActions.status,
            statuses,
          ),
        ),
      )
      .orderBy(
        desc(
          tiktokActions.createdAt,
        ),
      )
      .limit(
        safeLimit,
      );
  }

  return db
    .select()
    .from(tiktokActions)
    .where(
      eq(
        tiktokActions.type,
        type,
      ),
    )
    .orderBy(
      desc(
        tiktokActions.createdAt,
      ),
    )
    .limit(
      safeLimit,
    );
}

// PHASE12_ATOMIC_QUEUE_HARDENING

export interface RecoverStaleTikTokRunningActionsResult {
  recovered: number;
  failed: number;
}

/**
 * Atomically claims one due SCHEDULED action.
 *
 * Only one scheduler can successfully move the row from
 * SCHEDULED -> RUNNING.
 *
 * attempts is incremented only after the claim succeeds.
 */
export async function claimDueTikTokScheduledAction(
  id: string,
  now = new Date(),
): Promise<TikTokAction | null> {

  const db = getDb();

  return db.transaction(
    async tx => {

      /*
       * Read the current attempts value first.
       *
       * This SELECT itself is not the lock. The UPDATE below is
       * the atomic gate because it still requires:
       *
       * status = scheduled
       * executeAt <= now
       */
      const [current] =
        await tx
          .select({
            type:
              tiktokActions.type,
            attempts:
              tiktokActions.attempts,
          })
          .from(
            tiktokActions,
          )
          .where(
            and(
              eq(
                tiktokActions.id,
                id,
              ),

              eq(
                tiktokActions.status,
                'scheduled',
              ),

              lte(
                tiktokActions.executeAt,
                now,
              ),
            ),
          )
          .limit(1);

      if (!current) {
        return null;
      }

      if (
        current.type !==
        TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK
      ) {
        throw new Error(
          'Only CHECK_FOLLOW_BACK may be claimed by the automatic TikTok scheduler.',
        );
      }

      const nextAttempts =
        (current.attempts ?? 0) +
        1;

      const [row] =
        await tx
          .update(
            tiktokActions,
          )
          .set({
            status:
              'running',

            attempts:
              nextAttempts,

            error:
              null,

            updatedAt:
              now,
          })
          .where(
            and(
              eq(
                tiktokActions.id,
                id,
              ),

              eq(
                tiktokActions.status,
                'scheduled',
              ),

              eq(
                tiktokActions.type,
                TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
              ),

              lte(
                tiktokActions.executeAt,
                now,
              ),
            ),
          )
          .returning();

      /*
       * Another scheduler won the race.
       */
      if (!row) {
        return null;
      }

      await tx
        .insert(
          tiktokActionHistory,
        )
        .values({
          actionId:
            row.id,

          status:
            'running',

          provider:
            row.provider,

          metadata: {
            event:
              'claimed',

            claimedAt:
              now.toISOString(),

            attempts:
              nextAttempts,
          },
        });

      return row;
    },
  );
}

/**
 * Atomically moves one still-due SCHEDULED action into the
 * future without consuming attempts.
 *
 * This is used for policy deferrals.
 *
 * The executeAt <= dueAt condition prevents two scheduler
 * instances from writing duplicate deferrals after one of them
 * already moved the action into the future.
 */
export async function deferDueTikTokScheduledAction(
  id: string,
  dueAt: Date,
  retryAt: Date,
  metadata: Record<string, unknown> = {},
): Promise<TikTokAction | null> {

  const db = getDb();

  return db.transaction(
    async tx => {

      const [current] =
        await tx
          .select({
            type:
              tiktokActions.type,
          })
          .from(
            tiktokActions,
          )
          .where(
            and(
              eq(
                tiktokActions.id,
                id,
              ),

              eq(
                tiktokActions.status,
                'scheduled',
              ),

              lte(
                tiktokActions.executeAt,
                dueAt,
              ),
            ),
          )
          .limit(1);

      if (!current) {
        return null;
      }

      if (
        current.type !==
        TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK
      ) {
        throw new Error(
          'Only CHECK_FOLLOW_BACK may be deferred by the automatic TikTok scheduler.',
        );
      }

      const [row] =
        await tx
          .update(
            tiktokActions,
          )
          .set({
            status:
              'scheduled',

            executeAt:
              retryAt,

            error:
              null,

            updatedAt:
              dueAt,
          })
          .where(
            and(
              eq(
                tiktokActions.id,
                id,
              ),

              eq(
                tiktokActions.status,
                'scheduled',
              ),

              eq(
                tiktokActions.type,
                TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
              ),

              lte(
                tiktokActions.executeAt,
                dueAt,
              ),
            ),
          )
          .returning();

      if (!row) {
        return null;
      }

      await tx
        .insert(
          tiktokActionHistory,
        )
        .values({
          actionId:
            row.id,

          status:
            'scheduled',

          provider:
            row.provider,

          metadata: {
            ...metadata,

            event:
              'deferred',

            dueAt:
              dueAt.toISOString(),

            executeAt:
              retryAt.toISOString(),
          },
        });

      return row;
    },
  );
}

/**
 * Recovers stale RUNNING actions left behind by an interrupted
 * scheduler.
 *
 * Recovery is itself atomic.
 *
 * If two scheduler instances discover the same stale row, only
 * one can change it because the UPDATE still requires:
 *
 * status = running
 * updatedAt <= staleBefore
 */
export async function recoverStaleTikTokRunningActions(
  type: TikTokActionType,
  now = new Date(),
  staleAfterSeconds = 15 * 60,
  retryDelaySeconds = 60,
  limit = 50,
  providers?: readonly string[],
): Promise<RecoverStaleTikTokRunningActionsResult> {

  if (
    type !==
    TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK
  ) {
    throw new Error(
      'Only CHECK_FOLLOW_BACK may be recovered by the automatic TikTok scheduler.',
    );
  }

  const db = getDb();

  const safeStaleSeconds =
    Number.isFinite(
      staleAfterSeconds,
    )
      ? Math.max(
          1,
          Math.floor(
            staleAfterSeconds,
          ),
        )
      : 15 * 60;

  const safeRetryDelaySeconds =
    Number.isFinite(
      retryDelaySeconds,
    )
      ? Math.max(
          1,
          Math.floor(
            retryDelaySeconds,
          ),
        )
      : 60;

  const safeLimit =
    Number.isFinite(
      limit,
    )
      ? Math.min(
          200,
          Math.max(
            1,
            Math.floor(
              limit,
            ),
          ),
        )
      : 50;

  const staleBefore =
    new Date(
      now.getTime() -
      safeStaleSeconds * 1000,
    );

  if (
    providers !== undefined &&
    providers.length === 0
  ) {
    return {
      recovered: 0,
      failed: 0,
    };
  }

  const staleConditions = [
    eq(
      tiktokActions.type,
      type,
    ),
    eq(
      tiktokActions.status,
      'running',
    ),
    lte(
      tiktokActions.updatedAt,
      staleBefore,
    ),
  ];

  if (
    providers !== undefined
  ) {
    staleConditions.push(
      inArray(
        tiktokActions.provider,
        [...providers],
      ),
    );
  }

  const rows =
    await db
      .select()
      .from(
        tiktokActions,
      )
      .where(
        and(
          ...staleConditions,
        ),
      )
      .orderBy(
        asc(
          tiktokActions.updatedAt,
        ),
      )
      .limit(
        safeLimit,
      );

  let recovered =
    0;

  let failed =
    0;

  for (
    const action of
      rows
  ) {

    const attempts =
      action.attempts ??
      0;

    const maxAttempts =
      action.maxAttempts ??
      3;

    const error =
      'Recovered stale RUNNING TikTok action after scheduler interruption.';

    if (
      attempts >=
      maxAttempts
    ) {

      const changed =
        await db.transaction(
          async tx => {

            const [row] =
              await tx
                .update(
                  tiktokActions,
                )
                .set({
                  status:
                    'failed',

                  error,

                  updatedAt:
                    now,
                })
                .where(
                  and(
                    eq(
                      tiktokActions.id,
                      action.id,
                    ),

                    eq(
                      tiktokActions.status,
                      'running',
                    ),

                    lte(
                      tiktokActions.updatedAt,
                      staleBefore,
                    ),
                  ),
                )
                .returning();

            if (!row) {
              return false;
            }

            await tx
              .insert(
                tiktokActionHistory,
              )
              .values({
                actionId:
                  row.id,

                status:
                  'failed',

                provider:
                  row.provider,

                error,

                metadata: {
                  event:
                    'transition',

                  reason:
                    'stale_running_exhausted',

                  recoveredAt:
                    now.toISOString(),

                  staleBefore:
                    staleBefore.toISOString(),

                  staleAfterSeconds:
                    safeStaleSeconds,
                },
              });

            return true;
          },
        );

      if (changed) {
        failed += 1;
      }

      continue;
    }

    const retryAt =
      new Date(
        now.getTime() +
        safeRetryDelaySeconds *
          1000,
      );

    const changed =
      await db.transaction(
        async tx => {

          const [row] =
            await tx
              .update(
                tiktokActions,
              )
              .set({
                status:
                  'scheduled',

                executeAt:
                  retryAt,

                error,

                updatedAt:
                  now,
              })
              .where(
                and(
                  eq(
                    tiktokActions.id,
                    action.id,
                  ),

                  eq(
                    tiktokActions.status,
                    'running',
                  ),

                  lte(
                    tiktokActions.updatedAt,
                    staleBefore,
                  ),
                ),
              )
              .returning();

          if (!row) {
            return false;
          }

          await tx
            .insert(
              tiktokActionHistory,
            )
            .values({
              actionId:
                row.id,

              status:
                'scheduled',

              provider:
                row.provider,

              error,

              metadata: {
                event:
                  'rescheduled',

                reason:
                  'stale_running_recovered',

                recoveredAt:
                  now.toISOString(),

                staleBefore:
                  staleBefore.toISOString(),

                staleAfterSeconds:
                  safeStaleSeconds,

                retryDelaySeconds:
                  safeRetryDelaySeconds,

                executeAt:
                  retryAt.toISOString(),
              },
            });

          return true;
        },
      );

    if (changed) {
      recovered += 1;
    }
  }

  return {
    recovered,
    failed,
  };
}

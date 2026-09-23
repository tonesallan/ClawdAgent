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

export async function createTikTokAction(
  input: CreateTikTokActionInput,
): Promise<TikTokAction> {
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
          eq(
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
    const [row] = await tx
      .update(tiktokActions)
      .set({
        status: input.status,
        result: input.result ?? null,
        error: input.error ?? null,
        attempts: input.attempts,
        updatedAt: new Date(),
      })
      .where(eq(tiktokActions.id, id))
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
 * Only SCHEDULED actions are returned here.
 *
 * PENDING actions are intentionally excluded because they can represent
 * actions waiting for manual review. This prevents a queued UNFOLLOW
 * from becoming automatically executable merely because it exists.
 */
export async function listDueScheduledTikTokActions(
  now = new Date(),
  limit = 50,
): Promise<TikTokAction[]> {
  const db = getDb();

  return db
    .select()
    .from(tiktokActions)
    .where(
      and(
        eq(tiktokActions.status, 'scheduled'),
        lte(tiktokActions.executeAt, now),
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

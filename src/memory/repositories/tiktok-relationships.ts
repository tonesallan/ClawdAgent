import { and, eq } from 'drizzle-orm';
import { getDb } from '../database.js';
import { tiktokUserRelationships } from '../schema.js';
import type { TikTokRelationshipState } from '../../tiktok/domain.js';

export type TikTokUserRelationship =
  typeof tiktokUserRelationships.$inferSelect;

export interface RegisterSystemFollowInput {
  accountKey: string;
  targetKey: string;
  username?: string | null;
  displayName?: string | null;
  followedAt: Date;
  followBackCheckAt: Date;
  metadata?: Record<string, unknown>;
}

export async function getTikTokRelationship(
  accountKey: string,
  targetKey: string,
): Promise<TikTokUserRelationship | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(tiktokUserRelationships)
    .where(
      and(
        eq(tiktokUserRelationships.accountKey, accountKey),
        eq(tiktokUserRelationships.targetKey, targetKey),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function registerTikTokSystemFollow(
  input: RegisterSystemFollowInput,
): Promise<TikTokUserRelationship> {
  const db = getDb();

  const [row] = await db
    .insert(tiktokUserRelationships)
    .values({
      accountKey: input.accountKey,
      targetKey: input.targetKey,
      username: input.username ?? null,
      displayName: input.displayName ?? null,
      relationshipState: 'following',
      followedByUs: true,
      followedByUsAt: input.followedAt,
      followBackCheckAt: input.followBackCheckAt,
      processed: false,
      metadata: input.metadata ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        tiktokUserRelationships.accountKey,
        tiktokUserRelationships.targetKey,
      ],
      set: {
        username: input.username ?? null,
        displayName: input.displayName ?? null,
        relationshipState: 'following',
        followedByUs: true,
        followedByUsAt: input.followedAt,
        followBackCheckAt: input.followBackCheckAt,
        processed: false,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new Error('Failed to persist TikTok relationship.');
  }

  return row;
}

export interface RecordRelationshipCheckInput {
  accountKey: string;
  targetKey: string;
  relationshipState: TikTokRelationshipState;
  followsUs: boolean | null;
  checkedAt?: Date;
  processed?: boolean;
}

export async function recordTikTokRelationshipCheck(
  input: RecordRelationshipCheckInput,
): Promise<TikTokUserRelationship | null> {
  const db = getDb();

  const [row] = await db
    .update(tiktokUserRelationships)
    .set({
      relationshipState: input.relationshipState,
      followsUs: input.followsUs,

      /*
       * Keep the denormalized followedByUs flag aligned with the
       * authoritative observed relationship state.
       *
       * UNKNOWN preserves the previous value because the current
       * following state could not be established safely.
       */
      ...(
        input.relationshipState !== 'unknown'
          ? {
              followedByUs:
                input.relationshipState === 'following' ||
                input.relationshipState === 'friends',
            }
          : {}
      ),

      lastCheckedAt: input.checkedAt ?? new Date(),
      processed: input.processed ?? true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tiktokUserRelationships.accountKey, input.accountKey),
        eq(tiktokUserRelationships.targetKey, input.targetKey),
      ),
    )
    .returning();

  return row ?? null;
}

export async function setTikTokRelationshipProtected(
  accountKey: string,
  targetKey: string,
  protectedValue: boolean,
): Promise<TikTokUserRelationship | null> {
  const db = getDb();

  const [row] = await db
    .update(tiktokUserRelationships)
    .set({
      protected: protectedValue,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tiktokUserRelationships.accountKey, accountKey),
        eq(tiktokUserRelationships.targetKey, targetKey),
      ),
    )
    .returning();

  return row ?? null;
}
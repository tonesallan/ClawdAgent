import {
  and,
  eq,
} from 'drizzle-orm';

import {
  getDb,
} from '../database.js';

import {
  tiktokActionHistory,
  tiktokActions,
  tiktokUserRelationships,
} from '../schema.js';

import {
  TIKTOK_ACTION_STATUSES,
  TIKTOK_ACTION_TYPES,
  type TikTokRelationshipState,
} from '../../tiktok/domain.js';

export interface CompleteTikTokFollowBackCheckInput {
  checkActionId: string;
  accountKey: string;
  targetKey: string;
  relationshipState:
    TikTokRelationshipState;
  followsUs: boolean | null;
  followedBack: boolean;
  checkedAt: Date;
}

export async function completeTikTokFollowBackCheck(
  input:
    CompleteTikTokFollowBackCheckInput,
) {
  const db =
    getDb();

  return db.transaction(
    async tx => {
      const [action] =
        await tx
          .update(
            tiktokActions,
          )
          .set({
            status:
              TIKTOK_ACTION_STATUSES.SUCCESS,
            result: {
              followedBack:
                input.followedBack,
              relationshipState:
                input.relationshipState,
              checkedAt:
                input.checkedAt.toISOString(),
            },
            error:
              null,
            updatedAt:
              new Date(),
          })
          .where(
            and(
              eq(
                tiktokActions.id,
                input.checkActionId,
              ),
              eq(
                tiktokActions.type,
                TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
              ),
              eq(
                tiktokActions.status,
                TIKTOK_ACTION_STATUSES.RUNNING,
              ),
            ),
          )
          .returning();

      if (!action) {
        return null;
      }

      const [relationship] =
        await tx
          .update(
            tiktokUserRelationships,
          )
          .set({
            relationshipState:
              input.relationshipState,
            followsUs:
              input.followsUs,
            followedByUs:
              input.relationshipState ===
                'following' ||
              input.relationshipState ===
                'friends',
            lastCheckedAt:
              input.checkedAt,
            processed:
              true,
            updatedAt:
              new Date(),
          })
          .where(
            and(
              eq(
                tiktokUserRelationships.accountKey,
                input.accountKey,
              ),
              eq(
                tiktokUserRelationships.targetKey,
                input.targetKey,
              ),
            ),
          )
          .returning();

      if (!relationship) {
        throw new Error(
          `TikTok relationship not found: ${input.targetKey}`,
        );
      }

      await tx
        .insert(
          tiktokActionHistory,
        )
        .values({
          actionId:
            action.id,
          status:
            TIKTOK_ACTION_STATUSES.SUCCESS,
          provider:
            action.provider,
          result: {
            followedBack:
              input.followedBack,
            relationshipState:
              input.relationshipState,
            checkedAt:
              input.checkedAt.toISOString(),
          },
          metadata: {
            event:
              'follow_back_checked',
          },
        });

      return {
        action,
        relationship,
      };
    },
  );
}

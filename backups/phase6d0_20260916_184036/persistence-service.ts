import {
  DEFAULT_FOLLOW_BACK_CHECK_HOURS,
  DEFAULT_TIKTOK_ACCOUNT_KEY,
  TIKTOK_ACTION_STATUSES,
  TIKTOK_ACTION_TYPES,
  TIKTOK_RELATIONSHIP_STATES,
} from './domain.js';

import {
  getTikTokRelationship,
  recordTikTokRelationshipCheck,
  registerTikTokSystemFollow,
} from '../memory/repositories/tiktok-relationships.js';

import {
  createTikTokAction,
  findOpenTikTokAction,
  rescheduleTikTokAction,
  transitionTikTokAction,
} from '../memory/repositories/tiktok-actions.js';

import {
  getTikTokNumberConfiguration,
} from '../memory/repositories/tiktok-configuration.js';

export interface RegisterSuccessfulFollowInput {
  accountKey?: string;
  targetKey: string;
  username?: string | null;
  displayName?: string | null;
  provider?: string;
  followedAt?: Date;
  metadata?: Record<string, unknown>;
}

export async function registerSuccessfulTikTokFollow(
  input: RegisterSuccessfulFollowInput,
) {
  const accountKey =
    input.accountKey ?? DEFAULT_TIKTOK_ACCOUNT_KEY;

  const followedAt =
    input.followedAt ?? new Date();

  const waitHours =
    await getTikTokNumberConfiguration(
      'follow_back_check_hours',
      DEFAULT_FOLLOW_BACK_CHECK_HOURS,
      {
        min: 1,
        max: 24 * 30,
      },
    );

  const followBackCheckAt =
    new Date(
      followedAt.getTime() +
      waitHours * 60 * 60 * 1000,
    );

  const relationship =
    await registerTikTokSystemFollow({
      accountKey,
      targetKey: input.targetKey,
      username: input.username,
      displayName: input.displayName,
      followedAt,
      followBackCheckAt,
      metadata: {
        ...(input.metadata ?? {}),
        source: 'system_follow',
      },
    });

  const existingCheck =
    await findOpenTikTokAction(
      accountKey,
      TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
      input.targetKey,
    );

  const payload = {
    relationshipId: relationship.id,
    reason: 'follow_back_wait_elapsed',
    followedAt: followedAt.toISOString(),
    waitHours,
  };

  const checkAction =
    existingCheck
      ? await rescheduleTikTokAction(
          existingCheck.id,
          followBackCheckAt,
          payload,
        )
      : await createTikTokAction({
          accountKey,
          type: TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
          targetKey: input.targetKey,
          targetUsername: input.username,
          targetDisplayName: input.displayName,
          status: TIKTOK_ACTION_STATUSES.SCHEDULED,
          executeAt: followBackCheckAt,
          provider: input.provider ?? 'android',
          payload,
        });

  if (!checkAction) {
    throw new Error(
      'Failed to schedule CHECK_FOLLOW_BACK.',
    );
  }

  return {
    relationship,
    checkAction,
    followedAt,
    followBackCheckAt,
    waitHours,
  };
}

export interface RecordFollowBackCheckResultInput {
  checkActionId: string;
  accountKey?: string;
  targetKey: string;
  username?: string | null;
  displayName?: string | null;
  followedBack: boolean;
  checkedAt?: Date;
  provider?: string;
}

/**
 * Persists the RESULT of a relationship check.
 *
 * IMPORTANT:
 * This function never executes UNFOLLOW.
 *
 * If the person still does not follow back, an UNFOLLOW action is only
 * created as PENDING with requiresReview=true.
 *
 * The scheduler repository returns only SCHEDULED actions, therefore
 * this review item cannot become automatically executable.
 */
export async function recordTikTokFollowBackCheckResult(
  input: RecordFollowBackCheckResultInput,
) {
  const accountKey =
    input.accountKey ?? DEFAULT_TIKTOK_ACCOUNT_KEY;

  const checkedAt =
    input.checkedAt ?? new Date();

  const currentRelationship =
    await getTikTokRelationship(
      accountKey,
      input.targetKey,
    );

  if (!currentRelationship) {
    throw new Error(
      `TikTok relationship not found: ${input.targetKey}`,
    );
  }

  const relationship =
    await recordTikTokRelationshipCheck({
      accountKey,
      targetKey: input.targetKey,
      relationshipState: input.followedBack
        ? TIKTOK_RELATIONSHIP_STATES.FRIENDS
        : TIKTOK_RELATIONSHIP_STATES.FOLLOWING,
      followsUs: input.followedBack,
      checkedAt,
      processed: true,
    });

  await transitionTikTokAction(
    input.checkActionId,
    {
      status: TIKTOK_ACTION_STATUSES.SUCCESS,
      result: {
        followedBack: input.followedBack,
        checkedAt: checkedAt.toISOString(),
      },
      metadata: {
        event: 'follow_back_checked',
      },
    },
  );

  if (
    input.followedBack ||
    currentRelationship.protected
  ) {
    return {
      relationship,
      unfollowReviewAction: null,
    };
  }

  const existingUnfollow =
    await findOpenTikTokAction(
      accountKey,
      TIKTOK_ACTION_TYPES.UNFOLLOW,
      input.targetKey,
    );

  if (existingUnfollow) {
    return {
      relationship,
      unfollowReviewAction: existingUnfollow,
    };
  }

  const unfollowReviewAction =
    await createTikTokAction({
      accountKey,
      type: TIKTOK_ACTION_TYPES.UNFOLLOW,
      targetKey: input.targetKey,
      targetUsername:
        input.username ??
        currentRelationship.username,
      targetDisplayName:
        input.displayName ??
        currentRelationship.displayName,
      status: TIKTOK_ACTION_STATUSES.PENDING,
      executeAt: null,
      provider: input.provider ?? 'android',
      payload: {
        requiresReview: true,
        reason: 'no_follow_back_after_wait',
        sourceActionId: input.checkActionId,
        checkedAt: checkedAt.toISOString(),
      },
    });

  return {
    relationship,
    unfollowReviewAction,
  };
}
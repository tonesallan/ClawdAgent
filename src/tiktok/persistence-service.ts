import {
  DEFAULT_FOLLOW_BACK_CHECK_HOURS,
  DEFAULT_TIKTOK_ACCOUNT_KEY,
  TIKTOK_ACTION_STATUSES,
  TIKTOK_ACTION_TYPES,
  TIKTOK_RELATIONSHIP_STATES,
  type TikTokRelationshipState,
} from './domain.js';

import {
  registerTikTokSystemFollow,
} from '../memory/repositories/tiktok-relationships.js';

import {
  completeTikTokFollowBackCheck,
} from '../memory/repositories/tiktok-follow-back.js';

import {
  createOrReuseOpenTikTokAction,
  rescheduleTikTokAction,
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

  const payload = {
    relationshipId: relationship.id,
    reason: 'follow_back_wait_elapsed',
    followedAt: followedAt.toISOString(),
    waitHours,
  };

  const {
    action: openCheckAction,
    created: checkCreated,
  } =
    await createOrReuseOpenTikTokAction({
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

  /*
   * Existing behaviour is preserved:
   * a repeated successful follow refreshes/reschedules the
   * already-open follow-back check instead of creating another.
   */
  let checkAction =
    openCheckAction;

  if (!checkCreated) {
    const openStatus =
      openCheckAction.status;

    if (
      openStatus !==
        TIKTOK_ACTION_STATUSES.SCHEDULED &&
      openStatus !==
        TIKTOK_ACTION_STATUSES.RUNNING
    ) {
      throw new Error(
        `Cannot refresh CHECK_FOLLOW_BACK from open status: ${openStatus}`,
      );
    }

    const refreshedCheck =
      await rescheduleTikTokAction(
        openCheckAction.id,
        followBackCheckAt,
        payload,
        {
          expectedStatus:
            openStatus,
          attempts:
            0,
        },
      );

    if (!refreshedCheck) {
      throw new Error(
        'Failed to schedule CHECK_FOLLOW_BACK.',
      );
    }

    checkAction =
      refreshedCheck;
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
  /**
   * Preferred input for new callers.
   *
   * followedBack remains temporarily supported below for
   * backward compatibility with earlier tests/callers.
   */
  relationshipState?: TikTokRelationshipState;
  followedBack?: boolean;
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

  /*
   * Preserve the complete observed state.
   *
   * Legacy followedBack callers are still accepted so
   * previous integration tests do not break.
   */
  const relationshipState =
    input.relationshipState ??
    (
      input.followedBack === true
        ? TIKTOK_RELATIONSHIP_STATES.FRIENDS
        : input.followedBack === false
          ? TIKTOK_RELATIONSHIP_STATES.FOLLOWING
          : null
    );

  if (!relationshipState) {
    throw new Error(
      'Follow-back check requires relationshipState or followedBack.',
    );
  }

  /*
   * UNKNOWN is never persisted as a completed 48h decision.
   * The scheduler must retry it instead.
   */
  if (
    relationshipState ===
    TIKTOK_RELATIONSHIP_STATES.UNKNOWN
  ) {
    throw new Error(
      'UNKNOWN relationship cannot complete CHECK_FOLLOW_BACK.',
    );
  }

  const followedBack =
    relationshipState ===
      TIKTOK_RELATIONSHIP_STATES.FRIENDS ||
    relationshipState ===
      TIKTOK_RELATIONSHIP_STATES.FOLLOWS_US;

  const followsUs =
    followedBack
      ? true
      : relationshipState ===
          TIKTOK_RELATIONSHIP_STATES.FOLLOWING ||
        relationshipState ===
          TIKTOK_RELATIONSHIP_STATES.NOT_FOLLOWING
        ? false
        : null;

  const completedCheck =
    await completeTikTokFollowBackCheck({
      checkActionId:
        input.checkActionId,
      accountKey,
      targetKey:
        input.targetKey,
      relationshipState,
      followsUs,
      followedBack,
      checkedAt,
    });

  if (!completedCheck) {
    throw new Error(
      `CHECK_FOLLOW_BACK is no longer running: ${input.checkActionId}`,
    );
  }

  const relationship =
    completedCheck.relationship;

  /*
   * Only FOLLOWING may generate an UNFOLLOW review candidate.
   *
   * FRIENDS/FOLLOWS_US: followed back.
   * NOT_FOLLOWING: already not being followed.
   * UNKNOWN: rejected above.
   */
  if (
    relationshipState !==
      TIKTOK_RELATIONSHIP_STATES.FOLLOWING ||
    relationship.protected
  ) {
    return {
      relationship,
      unfollowReviewAction: null,
    };
  }

  const {
    action: unfollowReviewAction,
  } =
    await createOrReuseOpenTikTokAction({
      accountKey,
      type: TIKTOK_ACTION_TYPES.UNFOLLOW,
      targetKey: input.targetKey,
      targetUsername:
        input.username ??
        relationship.username,
      targetDisplayName:
        input.displayName ??
        relationship.displayName,
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
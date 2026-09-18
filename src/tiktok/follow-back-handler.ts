import {
  TIKTOK_ACTION_TYPES,
  TIKTOK_RELATIONSHIP_STATES,
  type TikTokRelationshipState,
} from './domain.js';

import {
  TikTokProviderRegistry,
} from './provider-registry.js';

import {
  TikTokRelationshipManager,
} from './relationship-manager.js';

import type {
  TikTokProviderName,
  TikTokObservedRelationship,
  TikTokTarget,
} from './providers/tiktok-provider.js';

import type {
  TikTokSchedulerHandler,
} from './scheduler.js';

function mapObservedRelationship(
  relationship: TikTokObservedRelationship,
): TikTokRelationshipState {

  switch (relationship) {

    case 'friends':
      return TIKTOK_RELATIONSHIP_STATES.FRIENDS;

    case 'follows_us':
      return TIKTOK_RELATIONSHIP_STATES.FOLLOWS_US;

    case 'following':
      return TIKTOK_RELATIONSHIP_STATES.FOLLOWING;

    case 'not_following':
      return TIKTOK_RELATIONSHIP_STATES.NOT_FOLLOWING;

    case 'unknown':
    default:
      return TIKTOK_RELATIONSHIP_STATES.UNKNOWN;
  }
}

function parseProviderName(
  provider: string | null,
): TikTokProviderName {

  if (
    provider === 'android' ||
    provider === 'web' ||
    provider === 'dry-run'
  ) {
    return provider;
  }

  throw new Error(
    `Unsupported TikTok provider: ${provider ?? 'null'}`,
  );
}

export function createFollowBackSchedulerHandler(
  registry: TikTokProviderRegistry,
  relationshipManager:
    TikTokRelationshipManager,
): TikTokSchedulerHandler {

  return async (action) => {

    if (
      action.type !==
      TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK
    ) {
      throw new Error(
        `Unexpected action type: ${action.type}`,
      );
    }

    if (!action.targetKey) {
      throw new Error(
        'CHECK_FOLLOW_BACK has no targetKey.',
      );
    }

    const providerName =
      parseProviderName(action.provider);

    const provider =
      registry.get(providerName);

    const target: TikTokTarget = {
      targetKey: action.targetKey,
      accountKey:
        action.accountKey,
      username:
        action.targetUsername ?? null,
      displayName:
        action.targetDisplayName ?? null,
    };

    /*
     * Read-only inspection through provider.
     * No follow/unfollow is executed here.
     */
    const observation =
      await provider.checkRelationship(
        target,
      );

    const relationshipState =
      mapObservedRelationship(
        observation.relationship,
      );

    /*
     * UNKNOWN has no reliable business meaning and must
     * remain retryable.
     *
     * NOT_FOLLOWING is a valid observation: we are already
     * not following the target, therefore it is persisted
     * but must never create an UNFOLLOW review action.
     */
    if (
      relationshipState ===
        TIKTOK_RELATIONSHIP_STATES.UNKNOWN
    ) {
      throw new Error(
        `Relationship state is not safe to classify: ${relationshipState}`,
      );
    }

    const result =
      await relationshipManager
        .recordRelationshipCheck({
          checkActionId: action.id,
          accountKey: action.accountKey,
          targetKey: action.targetKey,
          relationshipState,
          provider: provider.name,
          checkedAt:
            observation.observedAt,
        });

    return {
      result: {
        relationship:
          observation.relationship,
        provider:
          observation.provider,
        observedAt:
          observation.observedAt
            .toISOString(),
        unfollowReviewCreated:
          result.unfollowReviewAction !== null,
      },
    };
  };
}
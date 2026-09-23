import {
  getTikTokAction,
  listTikTokActionsByTypeAcrossAccounts,
  transitionTikTokAction,
  type TikTokAction,
} from '../memory/repositories/tiktok-actions.js';

import {
  TIKTOK_ACTION_STATUSES,
  TIKTOK_ACTION_TYPES,
} from './domain.js';

import {
  resolveTikTokDiscoveryReview,
  type TikTokDiscoveryReviewDecision,
} from './hashtag-review-queue.js';

export type TikTokManualReviewKind =
  | 'discovery'
  | 'unfollow';

export interface TikTokManualReviewItem {
  id: string;
  kind: TikTokManualReviewKind;
  accountKey: string;
  provider: string;
  targetKey: string | null;
  username: string | null;
  displayName: string | null;
  reason: string | null;
  query: string | null;
  hashtags: string[];
  createdAt: string;
}

function readPayload(
  action: TikTokAction,
): Record<string, unknown> {

  return (
    action.payload ??
    {}
  ) as Record<string, unknown>;
}

function readDiscoveryFields(
  action: TikTokAction,
): {
  query: string | null;
  hashtags: string[];
  username: string | null;
} {

  const payload =
    readPayload(
      action,
    );

  const candidate =
    (
      payload.candidate ??
      {}
    ) as Record<string, unknown>;

  const query =
    typeof payload.query ===
      'string'
      ? payload.query
      : null;

  const rawHashtags =
    candidate.hashtags;

  const hashtags =
    Array.isArray(
      rawHashtags,
    )
      ? rawHashtags
          .filter(
            (
              value,
            ): value is string =>
              typeof value ===
              'string',
          )
          .map(
            value =>
              value.replace(
                /^#/,
                '',
              ),
          )
      : [];

  const usernameValue =
    candidate.username ??
    candidate.authorUsername ??
    candidate.author;

  const username =
    typeof usernameValue ===
      'string'
      ? usernameValue.replace(
          /^@/,
          '',
        )
      : null;

  return {
    query,
    hashtags,
    username,
  };
}

function mapReviewAction(
  action: TikTokAction,
): TikTokManualReviewItem {

  if (
    action.type ===
    TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW
  ) {
    const discovery =
      readDiscoveryFields(
        action,
      );

    return {
      id:
        action.id,
      kind:
        'discovery',
      accountKey:
        action.accountKey,
      provider:
        action.provider,
      targetKey:
        action.targetKey,
      username:
        discovery.username ??
        action.targetUsername,
      displayName:
        action.targetDisplayName,
      reason:
        'discovery_candidate_review',
      query:
        discovery.query,
      hashtags:
        discovery.hashtags,
      createdAt:
        action.createdAt
          .toISOString(),
    };
  }

  const payload =
    readPayload(
      action,
    );

  return {
    id:
      action.id,
    kind:
      'unfollow',
    accountKey:
      action.accountKey,
    provider:
      action.provider,
    targetKey:
      action.targetKey,
    username:
      action.targetUsername,
    displayName:
      action.targetDisplayName,
    reason:
      typeof payload.reason ===
        'string'
        ? payload.reason
        : null,
    query:
      null,
    hashtags:
      [],
    createdAt:
      action.createdAt
        .toISOString(),
  };
}

export async function listPendingTikTokManualReviews(): Promise<TikTokManualReviewItem[]> {

  const [
    discoveryReviews,
    unfollowReviews,
  ] = await Promise.all([
    listTikTokActionsByTypeAcrossAccounts(
      TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW,
      [
        TIKTOK_ACTION_STATUSES.PENDING,
      ],
      200,
    ),

    listTikTokActionsByTypeAcrossAccounts(
      TIKTOK_ACTION_TYPES.UNFOLLOW,
      [
        TIKTOK_ACTION_STATUSES.PENDING,
      ],
      200,
    ),
  ]);

  return [
    ...discoveryReviews,
    ...unfollowReviews,
  ]
    .sort(
      (
        left,
        right,
      ) =>
        right.createdAt.getTime() -
        left.createdAt.getTime(),
    )
    .map(
      mapReviewAction,
    );
}

export async function resolveTikTokManualDiscoveryReview(
  actionId: string,
  decision:
    TikTokDiscoveryReviewDecision,
): Promise<TikTokAction> {

  return resolveTikTokDiscoveryReview(
    actionId,
    decision,
    decision ===
      'approved'
      ? 'approved_via_tiktok_panel'
      : 'rejected_via_tiktok_panel',
  );
}

export async function cancelTikTokUnfollowReview(
  actionId: string,
): Promise<TikTokAction> {

  const action =
    await getTikTokAction(
      actionId,
    );

  if (!action) {
    throw new Error(
      `TikTok review not found: ${actionId}`,
    );
  }

  if (
    action.type !==
    TIKTOK_ACTION_TYPES.UNFOLLOW
  ) {
    throw new Error(
      `Action is not an UNFOLLOW review: ${actionId}`,
    );
  }

  if (
    action.status !==
    TIKTOK_ACTION_STATUSES.PENDING
  ) {
    throw new Error(
      `UNFOLLOW review is not pending: ${actionId}`,
    );
  }

  const cancelled =
    await transitionTikTokAction(
      actionId,
      {
        status:
          TIKTOK_ACTION_STATUSES.CANCELLED,
        result: {
          reviewDecision:
            'cancelled',
          reviewedAt:
            new Date()
              .toISOString(),
          engagementCreated:
            false,
          engagementExecuted:
            false,
        },
        metadata: {
          event:
            'manual_unfollow_review_cancelled',
        },
      },
    );

  if (!cancelled) {
    throw new Error(
      `Failed to cancel UNFOLLOW review: ${actionId}`,
    );
  }

  return cancelled;
}

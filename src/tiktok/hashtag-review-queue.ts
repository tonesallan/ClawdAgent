import {
  createHash,
} from 'node:crypto';

import {
  TIKTOK_ACTION_STATUSES,
  TIKTOK_ACTION_TYPES,
} from './domain.js';

import {
  createTikTokAction,
  findOpenTikTokAction,
  getTikTokAction,
  listPendingTikTokActionsByType,
  transitionTikTokAction,
  type TikTokAction,
} from '../memory/repositories/tiktok-actions.js';

import {
  filterTikTokDiscoveredHashtagCandidates,
  type TikTokHashtagDiscoveryCandidate,
} from './hashtag-discovery-service.js';

import type {
  TikTokHashtagConfiguration,
} from './hashtag-policy.js';

export type TikTokDiscoveryReviewDecision =
  | 'approved'
  | 'rejected';

export interface EnqueueTikTokDiscoveryReviewInput {
  accountKey: string;

  query: string;

  candidate:
    TikTokHashtagDiscoveryCandidate;

  provider?: string;

  discoveredAt?: Date;
}

export interface QueueTikTokHashtagDiscoveryInput {
  accountKey: string;

  query: string;

  candidates:
    TikTokHashtagDiscoveryCandidate[];

  configuration:
    TikTokHashtagConfiguration;

  provider?: string;

  discoveredAt?: Date;
}

export interface TikTokDiscoveryReviewQueueItem {
  action:
    TikTokAction;

  candidate:
    TikTokHashtagDiscoveryCandidate;

  created:
    boolean;
}

export interface TikTokDiscoveryReviewQueueResult {
  acceptedCount:
    number;

  createdCount:
    number;

  reusedCount:
    number;

  items:
    TikTokDiscoveryReviewQueueItem[];
}

function getDiscoveryReviewTargetKey(
  candidate:
    TikTokHashtagDiscoveryCandidate,
): string {

  const hash =
    createHash(
      'sha256',
    )
      .update(
        candidate.fingerprint,
        'utf8',
      )
      .digest(
        'hex',
      );

  /*
   * target_key is varchar(250).
   *
   * This deterministic key is intentionally short and stable
   * while the review is still open.
   */
  return `discovery:${hash}`;
}

export async function enqueueTikTokDiscoveryReview(
  input:
    EnqueueTikTokDiscoveryReviewInput,
): Promise<TikTokDiscoveryReviewQueueItem> {

  const targetKey =
    getDiscoveryReviewTargetKey(
      input.candidate,
    );

  /*
   * Reuse an existing open review for the same visual candidate.
   *
   * This prevents repeated discovery cycles from filling the
   * queue with identical PENDING items.
   */
  const existing =
    await findOpenTikTokAction(
      input.accountKey,
      TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW,
      targetKey,
    );

  if (existing) {

    return {
      action:
        existing,

      candidate:
        input.candidate,

      created:
        false,
    };
  }

  const discoveredAt =
    input.discoveredAt ??
    new Date();

  const action =
    await createTikTokAction({
      accountKey:
        input.accountKey,

      type:
        TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW,

      targetKey,

      /*
       * Deliberately PENDING.
       *
       * It has no executeAt and therefore cannot enter the
       * automatic scheduler.
       */
      status:
        TIKTOK_ACTION_STATUSES.PENDING,

      executeAt:
        null,

      provider:
        input.provider ??
        'android',

      priority:
        10,

      maxAttempts:
        1,

      payload: {
        requiresReview:
          true,

        reviewKind:
          'hashtag_discovery_candidate',

        source:
          input.candidate.source,

        query:
          input.query,

        discoveredAt:
          discoveredAt.toISOString(),

        candidate:
          input.candidate,
      },
    });

  return {
    action,
    candidate:
      input.candidate,
    created:
      true,
  };
}

export async function queueTikTokHashtagDiscoveryForReview(
  input:
    QueueTikTokHashtagDiscoveryInput,
): Promise<TikTokDiscoveryReviewQueueResult> {

  /*
   * This applies the existing hashtag policy first.
   *
   * Disabled policy therefore creates ZERO review items.
   */
  const accepted =
    filterTikTokDiscoveredHashtagCandidates(
      input.candidates,
      input.configuration,
    );

  const items:
    TikTokDiscoveryReviewQueueItem[] = [];

  for (
    const candidate of
      accepted
  ) {

    items.push(
      await enqueueTikTokDiscoveryReview({
        accountKey:
          input.accountKey,

        query:
          input.query,

        candidate,

        provider:
          input.provider,

        discoveredAt:
          input.discoveredAt,
      }),
    );
  }

  return {
    acceptedCount:
      accepted.length,

    createdCount:
      items.filter(
        item =>
          item.created,
      ).length,

    reusedCount:
      items.filter(
        item =>
          !item.created,
      ).length,

    items,
  };
}

export async function listPendingTikTokDiscoveryReviews(
  accountKey: string,
  limit = 50,
): Promise<TikTokAction[]> {

  return listPendingTikTokActionsByType(
    accountKey,
    TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW,
    limit,
  );
}

export async function resolveTikTokDiscoveryReview(
  actionId: string,
  decision:
    TikTokDiscoveryReviewDecision,

  reason?: string,
): Promise<TikTokAction> {

  const action =
    await getTikTokAction(
      actionId,
    );

  if (!action) {

    throw new Error(
      `TikTok discovery review not found: ${actionId}`,
    );
  }

  if (
    action.type !==
    TIKTOK_ACTION_TYPES.DISCOVERY_REVIEW
  ) {

    throw new Error(
      `Action is not a discovery review: ${actionId}`,
    );
  }

  if (
    action.status !==
    TIKTOK_ACTION_STATUSES.PENDING
  ) {

    throw new Error(
      `Discovery review is not pending: ${actionId}`,
    );
  }

  const reviewedAt =
    new Date();

  /*
   * IMPORTANT:
   *
   * APPROVED means only that the candidate was approved during
   * human review.
   *
   * It does NOT create or execute FOLLOW, LIKE, COMMENT, DM,
   * PROFILE_VISIT or any other TikTok engagement.
   *
   * Any future engagement must be created as a separate action
   * with its own policy/review/limits.
   */
  const status =
    decision ===
      'approved'
      ? TIKTOK_ACTION_STATUSES.SUCCESS
      : TIKTOK_ACTION_STATUSES.CANCELLED;

  const resolved =
    await transitionTikTokAction(
      action.id,
      {
        status,

        result: {
          reviewDecision:
            decision,

          reviewedAt:
            reviewedAt.toISOString(),

          reason:
            reason ?? null,

          engagementCreated:
            false,

          engagementExecuted:
            false,
        },

        metadata: {
          event:
            'discovery_review_resolved',

          reviewDecision:
            decision,
        },
      },
    );

  if (!resolved) {

    throw new Error(
      `Failed to resolve discovery review: ${actionId}`,
    );
  }

  return resolved;
}
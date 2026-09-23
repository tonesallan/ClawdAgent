import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  TikTokAction,
} from '../../src/memory/repositories/tiktok-actions.js';

const actionMocks =
  vi.hoisted(() => ({
    createOrReuseOpenTikTokAction:
      vi.fn(),
    findOpenTikTokAction:
      vi.fn(),
    getTikTokAction:
      vi.fn(),
    listPendingTikTokActionsByType:
      vi.fn(),
    transitionTikTokAction:
      vi.fn(),
  }));

vi.mock(
  '../../src/memory/repositories/tiktok-actions.js',
  () => actionMocks,
);

import {
  listPendingTikTokDiscoveryReviews,
  resolveTikTokDiscoveryReview,
} from '../../src/tiktok/hashtag-review-queue.js';

function createAction(
  overrides: Partial<TikTokAction> = {},
): TikTokAction {
  return {
    id: 'review-1',
    accountKey: 'default',
    type: 'DISCOVERY_REVIEW',
    targetKey: 'discovery:abc',
    targetUsername: null,
    targetDisplayName: null,
    status: 'pending',
    executeAt: null,
    priority: 10,
    attempts: 0,
    maxAttempts: 1,
    provider: 'android',
    payload: {
      requiresReview: true,
      reviewKind:
        'hashtag_discovery_candidate',
    },
    result: null,
    error: null,
    createdAt: new Date(
      '2026-09-17T20:00:00.000Z',
    ),
    updatedAt: new Date(
      '2026-09-17T20:00:00.000Z',
    ),
    ...overrides,
  } as TikTokAction;
}

describe(
  'TikTok discovery review resolution safety',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('rejects a pending UNFOLLOW even if its id is passed to the discovery resolver', async () => {
      actionMocks
        .getTikTokAction
        .mockResolvedValue(
          createAction({
            id: 'unfollow-review-1',
            type: 'UNFOLLOW',
            targetKey:
              'username:tiktok',
            status: 'pending',
            executeAt: null,
            payload: {
              requiresReview: true,
              reason:
                'no_follow_back_after_wait',
            },
          }),
        );

      await expect(
        resolveTikTokDiscoveryReview(
          'unfollow-review-1',
          'approved',
          'attempted_via_dashboard',
        ),
      ).rejects.toThrow(
        'Action is not a discovery review: unfollow-review-1',
      );

      expect(
        actionMocks
          .transitionTikTokAction,
      ).not.toHaveBeenCalled();

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).not.toHaveBeenCalled();
    });

    it('approves discovery as decision-only without creating or executing engagement', async () => {
      const pending =
        createAction();

      actionMocks
        .getTikTokAction
        .mockResolvedValue(
          pending,
        );

      actionMocks
        .transitionTikTokAction
        .mockImplementation(
          async (
            id: string,
            input: any,
          ) => ({
            ...pending,
            id,
            status:
              input.status,
            result:
              input.result,
          }),
        );

      const resolved =
        await resolveTikTokDiscoveryReview(
          'review-1',
          'approved',
          'approved_via_dashboard',
        );

      expect(
        actionMocks
          .transitionTikTokAction,
      ).toHaveBeenCalledTimes(1);

      const [
        transitionedId,
        transitionInput,
      ] =
        actionMocks
          .transitionTikTokAction
          .mock.calls[0];

      expect(
        transitionedId,
      ).toBe(
        'review-1',
      );

      expect(
        transitionInput.status,
      ).toBe(
        'success',
      );

      expect(
        transitionInput.result,
      ).toMatchObject({
        reviewDecision:
          'approved',
        reason:
          'approved_via_dashboard',
        engagementCreated:
          false,
        engagementExecuted:
          false,
      });

      expect(
        transitionInput.metadata,
      ).toEqual({
        event:
          'discovery_review_resolved',
        reviewDecision:
          'approved',
      });

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).not.toHaveBeenCalled();

      expect(resolved).toMatchObject({
        id: 'review-1',
        status: 'success',
        result: {
          reviewDecision:
            'approved',
          engagementCreated:
            false,
          engagementExecuted:
            false,
        },
      });
    });

    it('rejects discovery as decision-only without creating or executing engagement', async () => {
      const pending =
        createAction();

      actionMocks
        .getTikTokAction
        .mockResolvedValue(
          pending,
        );

      actionMocks
        .transitionTikTokAction
        .mockImplementation(
          async (
            id: string,
            input: any,
          ) => ({
            ...pending,
            id,
            status:
              input.status,
            result:
              input.result,
          }),
        );

      await resolveTikTokDiscoveryReview(
        'review-1',
        'rejected',
        'rejected_via_dashboard',
      );

      const transitionInput =
        actionMocks
          .transitionTikTokAction
          .mock.calls[0][1];

      expect(
        transitionInput.status,
      ).toBe(
        'cancelled',
      );

      expect(
        transitionInput.result,
      ).toMatchObject({
        reviewDecision:
          'rejected',
        reason:
          'rejected_via_dashboard',
        engagementCreated:
          false,
        engagementExecuted:
          false,
      });

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).not.toHaveBeenCalled();
    });

    it('refuses to resolve a discovery review that is no longer pending', async () => {
      actionMocks
        .getTikTokAction
        .mockResolvedValue(
          createAction({
            status: 'success',
          }),
        );

      await expect(
        resolveTikTokDiscoveryReview(
          'review-1',
          'approved',
        ),
      ).rejects.toThrow(
        'Discovery review is not pending: review-1',
      );

      expect(
        actionMocks
          .transitionTikTokAction,
      ).not.toHaveBeenCalled();
    });

    it('lists only pending DISCOVERY_REVIEW actions for the requested account', async () => {
      actionMocks
        .listPendingTikTokActionsByType
        .mockResolvedValue([]);

      const result =
        await listPendingTikTokDiscoveryReviews(
          'default',
          25,
        );

      expect(
        actionMocks
          .listPendingTikTokActionsByType,
      ).toHaveBeenCalledWith(
        'default',
        'DISCOVERY_REVIEW',
        25,
      );

      expect(result).toEqual([]);
    });

    it('does not silently succeed when the review transition fails', async () => {
      actionMocks
        .getTikTokAction
        .mockResolvedValue(
          createAction(),
        );

      actionMocks
        .transitionTikTokAction
        .mockResolvedValue(
          null,
        );

      await expect(
        resolveTikTokDiscoveryReview(
          'review-1',
          'approved',
        ),
      ).rejects.toThrow(
        'Failed to resolve discovery review: review-1',
      );
    });
  },
);

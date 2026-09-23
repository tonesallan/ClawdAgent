import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const actionMocks =
  vi.hoisted(
    () => ({
      getTikTokAction:
        vi.fn(),
      listTikTokActionsByTypeAcrossAccounts:
        vi.fn(),
      transitionTikTokAction:
        vi.fn(),
    }),
  );

const discoveryMocks =
  vi.hoisted(
    () => ({
      resolveTikTokDiscoveryReview:
        vi.fn(),
    }),
  );

vi.mock(
  '../../src/memory/repositories/tiktok-actions.js',
  () =>
    actionMocks,
);

vi.mock(
  '../../src/tiktok/hashtag-review-queue.js',
  () =>
    discoveryMocks,
);

import {
  cancelTikTokUnfollowReview,
  listPendingTikTokManualReviews,
  resolveTikTokManualDiscoveryReview,
} from '../../src/tiktok/manual-review-service.js';

function createDiscoveryAction() {
  return {
    id:
      'discovery-1',
    accountKey:
      'web-account-1',
    type:
      'DISCOVERY_REVIEW',
    targetKey:
      'discovery:abc',
    targetUsername:
      null,
    targetDisplayName:
      null,
    status:
      'pending',
    executeAt:
      null,
    priority:
      10,
    attempts:
      0,
    maxAttempts:
      1,
    provider:
      'web',
    payload: {
      requiresReview:
        true,
      query:
        '#ai',
      candidate: {
        username:
          '@candidate',
        hashtags: [
          '#ai',
          'automation',
        ],
      },
    },
    result:
      null,
    error:
      null,
    createdAt:
      new Date(
        '2026-09-21T03:00:00.000Z',
      ),
    updatedAt:
      new Date(
        '2026-09-21T03:00:00.000Z',
      ),
  };
}

function createUnfollowAction() {
  return {
    id:
      'unfollow-1',
    accountKey:
      'web-account-1',
    type:
      'UNFOLLOW',
    targetKey:
      'username:tiktok',
    targetUsername:
      'tiktok',
    targetDisplayName:
      'TikTok',
    status:
      'pending',
    executeAt:
      null,
    priority:
      5,
    attempts:
      0,
    maxAttempts:
      3,
    provider:
      'web',
    payload: {
      requiresReview:
        true,
      reason:
        'no_follow_back_after_wait',
      sourceActionId:
        'check-1',
    },
    result:
      null,
    error:
      null,
    createdAt:
      new Date(
        '2026-09-21T04:00:00.000Z',
      ),
    updatedAt:
      new Date(
        '2026-09-21T04:00:00.000Z',
      ),
  };
}

describe(
  'TikTok manual review service',
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      },
    );

    it('lists discovery and unfollow reviews without exposing arbitrary payloads', async () => {
      actionMocks
        .listTikTokActionsByTypeAcrossAccounts
        .mockImplementation(
          async (
            type:
              string,
          ) =>
            type ===
              'DISCOVERY_REVIEW'
              ? [
                  createDiscoveryAction(),
                ]
              : [
                  createUnfollowAction(),
                ],
        );

      const reviews =
        await listPendingTikTokManualReviews();

      expect(
        actionMocks
          .listTikTokActionsByTypeAcrossAccounts,
      ).toHaveBeenNthCalledWith(
        1,
        'DISCOVERY_REVIEW',
        [
          'pending',
        ],
        200,
      );

      expect(
        actionMocks
          .listTikTokActionsByTypeAcrossAccounts,
      ).toHaveBeenNthCalledWith(
        2,
        'UNFOLLOW',
        [
          'pending',
        ],
        200,
      );

      expect(
        reviews,
      ).toEqual([
        {
          id:
            'unfollow-1',
          kind:
            'unfollow',
          accountKey:
            'web-account-1',
          provider:
            'web',
          targetKey:
            'username:tiktok',
          username:
            'tiktok',
          displayName:
            'TikTok',
          reason:
            'no_follow_back_after_wait',
          query:
            null,
          hashtags:
            [],
          createdAt:
            '2026-09-21T04:00:00.000Z',
        },
        {
          id:
            'discovery-1',
          kind:
            'discovery',
          accountKey:
            'web-account-1',
          provider:
            'web',
          targetKey:
            'discovery:abc',
          username:
            'candidate',
          displayName:
            null,
          reason:
            'discovery_candidate_review',
          query:
            '#ai',
          hashtags: [
            'ai',
            'automation',
          ],
          createdAt:
            '2026-09-21T03:00:00.000Z',
        },
      ]);

      expect(
        JSON.stringify(
          reviews,
        ),
      ).not.toContain(
        'sourceActionId',
      );

      expect(
        JSON.stringify(
          reviews,
        ),
      ).not.toContain(
        'requiresReview',
      );
    });

    it('resolves discovery review as decision-only through the existing review service', async () => {
      const action =
        createDiscoveryAction();

      discoveryMocks
        .resolveTikTokDiscoveryReview
        .mockResolvedValue(
          action,
        );

      const result =
        await resolveTikTokManualDiscoveryReview(
          'discovery-1',
          'approved',
        );

      expect(
        discoveryMocks
          .resolveTikTokDiscoveryReview,
      ).toHaveBeenCalledWith(
        'discovery-1',
        'approved',
        'approved_via_tiktok_panel',
      );

      expect(
        result,
      ).toBe(
        action,
      );
    });

    it('cancels a pending UNFOLLOW review without creating or executing engagement', async () => {
      const pending =
        createUnfollowAction();

      const cancelled = {
        ...pending,
        status:
          'cancelled',
      };

      actionMocks
        .getTikTokAction
        .mockResolvedValue(
          pending,
        );

      actionMocks
        .transitionTikTokAction
        .mockResolvedValue(
          cancelled,
        );

      const result =
        await cancelTikTokUnfollowReview(
          'unfollow-1',
        );

      expect(
        actionMocks
          .transitionTikTokAction,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        actionMocks
          .transitionTikTokAction,
      ).toHaveBeenCalledWith(
        'unfollow-1',
        expect.objectContaining({
          status:
            'cancelled',
          result:
            expect.objectContaining({
              reviewDecision:
                'cancelled',
              engagementCreated:
                false,
              engagementExecuted:
                false,
            }),
          metadata: {
            event:
              'manual_unfollow_review_cancelled',
          },
        }),
      );

      expect(
        result.status,
      ).toBe(
        'cancelled',
      );
    });

    it('refuses to cancel a non-UNFOLLOW action through the UNFOLLOW endpoint', async () => {
      actionMocks
        .getTikTokAction
        .mockResolvedValue(
          createDiscoveryAction(),
        );

      await expect(
        cancelTikTokUnfollowReview(
          'discovery-1',
        ),
      ).rejects.toThrow(
        'Action is not an UNFOLLOW review: discovery-1',
      );

      expect(
        actionMocks
          .transitionTikTokAction,
      ).not.toHaveBeenCalled();
    });
  },
);

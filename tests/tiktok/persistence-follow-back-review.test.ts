import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const relationshipMocks =
  vi.hoisted(() => ({
    getTikTokRelationship:
      vi.fn(),
    recordTikTokRelationshipCheck:
      vi.fn(),
    registerTikTokSystemFollow:
      vi.fn(),
  }));

const actionMocks =
  vi.hoisted(() => ({
    createOrReuseOpenTikTokAction:
      vi.fn(),
    rescheduleTikTokAction:
      vi.fn(),
    transitionTikTokAction:
      vi.fn(),
  }));

const followBackMocks =
  vi.hoisted(() => ({
    completeTikTokFollowBackCheck:
      vi.fn(),
  }));


const configurationMocks =
  vi.hoisted(() => ({
    getTikTokNumberConfiguration:
      vi.fn(),
  }));

vi.mock(
  '../../src/memory/repositories/tiktok-relationships.js',
  () => relationshipMocks,
);

vi.mock(
  '../../src/memory/repositories/tiktok-actions.js',
  () => actionMocks,
);

vi.mock(
  '../../src/memory/repositories/tiktok-follow-back.js',
  () => followBackMocks,
);


vi.mock(
  '../../src/memory/repositories/tiktok-configuration.js',
  () => configurationMocks,
);

import {
  recordTikTokFollowBackCheckResult,
} from '../../src/tiktok/persistence-service.js';

const checkedAt =
  new Date(
    '2026-09-17T20:00:00.000Z',
  );

function currentRelationship(
  protectedValue = false,
) {
  return {
    id: 'relationship-1',
    accountKey: 'default',
    targetKey: 'username:tiktok',
    username: 'tiktok',
    displayName: 'TikTok',
    relationshipState: 'following',
    followedByUs: true,
    followsUs: false,
    followedByUsAt: new Date(
      '2026-09-15T20:00:00.000Z',
    ),
    lastCheckedAt: null,
    followBackCheckAt: checkedAt,
    processed: false,
    protected: protectedValue,
    metadata: {},
    createdAt: new Date(
      '2026-09-15T20:00:00.000Z',
    ),
    updatedAt: new Date(
      '2026-09-15T20:00:00.000Z',
    ),
  };
}

describe(
  'TikTok follow-back persistence review safety',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      relationshipMocks
        .getTikTokRelationship
        .mockResolvedValue(
          currentRelationship(false),
        );

      followBackMocks
        .completeTikTokFollowBackCheck
        .mockResolvedValue({
          action: {
            id:
              'check-1',
            type:
              'CHECK_FOLLOW_BACK',
            status:
              'success',
          },
          relationship: {
            ...currentRelationship(false),
            processed:
              true,
            lastCheckedAt:
              checkedAt,
          },
        });

      actionMocks
        .createOrReuseOpenTikTokAction
        .mockResolvedValue({
          action: {
            id: 'unfollow-review-1',
            type: 'UNFOLLOW',
            status: 'pending',
            executeAt: null,
          },
          created: true,
        });
    });

    it('creates only a pending manual UNFOLLOW review for unprotected FOLLOWING', async () => {
      const result =
        await recordTikTokFollowBackCheckResult({
          checkActionId: 'check-1',
          accountKey: 'default',
          targetKey: 'username:tiktok',
          relationshipState:
            'following',
          checkedAt,
          provider: 'android',
        });

      expect(
        followBackMocks
          .completeTikTokFollowBackCheck,
      ).toHaveBeenCalledWith({
        checkActionId:
          'check-1',
        accountKey:
          'default',
        targetKey:
          'username:tiktok',
        relationshipState:
          'following',
        followsUs:
          false,
        followedBack:
          false,
        checkedAt,
      });

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledTimes(1);

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledWith({
        accountKey: 'default',
        type: 'UNFOLLOW',
        targetKey:
          'username:tiktok',
        targetUsername:
          'tiktok',
        targetDisplayName:
          'TikTok',
        status: 'pending',
        executeAt: null,
        provider: 'android',
        payload: {
          requiresReview: true,
          reason:
            'no_follow_back_after_wait',
          sourceActionId:
            'check-1',
          checkedAt:
            checkedAt.toISOString(),
        },
      });

      expect(
        result.unfollowReviewAction,
      ).toMatchObject({
        id: 'unfollow-review-1',
        type: 'UNFOLLOW',
        status: 'pending',
        executeAt: null,
      });
    });

    it('stops before creating UNFOLLOW when another worker already completed the check', async () => {
      followBackMocks
        .completeTikTokFollowBackCheck
        .mockResolvedValue(
          null,
        );

      await expect(
        recordTikTokFollowBackCheckResult({
          checkActionId:
            'check-1',
          accountKey:
            'default',
          targetKey:
            'username:tiktok',
          relationshipState:
            'following',
          checkedAt,
          provider:
            'android',
        }),
      ).rejects.toThrow(
        'CHECK_FOLLOW_BACK is no longer running: check-1',
      );

      expect(
        followBackMocks
          .completeTikTokFollowBackCheck,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).not.toHaveBeenCalled();
    });

    it('does not create an UNFOLLOW review for NOT_FOLLOWING', async () => {
      const result =
        await recordTikTokFollowBackCheckResult({
          checkActionId: 'check-1',
          targetKey: 'username:tiktok',
          relationshipState:
            'not_following',
          checkedAt,
        });

      expect(
        followBackMocks
          .completeTikTokFollowBackCheck,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          relationshipState:
            'not_following',
          followsUs:
            false,
          followedBack:
            false,
        }),
      );

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).not.toHaveBeenCalled();

      expect(
        result.unfollowReviewAction,
      ).toBeNull();
    });

    it('does not create an UNFOLLOW review for a protected FOLLOWING relationship', async () => {
      relationshipMocks
        .getTikTokRelationship
        .mockResolvedValue(
          currentRelationship(true),
        );

      const result =
        await recordTikTokFollowBackCheckResult({
          checkActionId: 'check-1',
          targetKey: 'username:tiktok',
          relationshipState:
            'following',
          checkedAt,
        });

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).not.toHaveBeenCalled();

      expect(
        result.unfollowReviewAction,
      ).toBeNull();
    });

    it('rejects UNKNOWN before recording or completing the check', async () => {
      await expect(
        recordTikTokFollowBackCheckResult({
          checkActionId: 'check-1',
          targetKey: 'username:tiktok',
          relationshipState:
            'unknown',
          checkedAt,
        }),
      ).rejects.toThrow(
        'UNKNOWN relationship cannot complete CHECK_FOLLOW_BACK.',
      );

      expect(
        followBackMocks
          .completeTikTokFollowBackCheck,
      ).not.toHaveBeenCalled();

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).not.toHaveBeenCalled();
    });

    it.each([
      'friends',
      'follows_us',
    ] as const)(
      'records %s as followed back without an UNFOLLOW review',
      async relationshipState => {
        const result =
          await recordTikTokFollowBackCheckResult({
            checkActionId:
              'check-1',
            targetKey:
              'username:tiktok',
            relationshipState,
            checkedAt,
          });

        expect(
          followBackMocks
            .completeTikTokFollowBackCheck,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            relationshipState,
            followsUs:
              true,
            followedBack:
              true,
          }),
        );

        expect(
          actionMocks
            .createOrReuseOpenTikTokAction,
        ).not.toHaveBeenCalled();

        expect(
          result.unfollowReviewAction,
        ).toBeNull();
      },
    );
  },
);

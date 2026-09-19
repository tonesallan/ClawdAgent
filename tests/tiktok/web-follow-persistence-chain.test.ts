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
    registerTikTokSystemFollow:
      vi.fn(),
  }));

const actionMocks =
  vi.hoisted(() => ({
    createOrReuseOpenTikTokAction:
      vi.fn(),
    rescheduleTikTokAction:
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
  '../../src/memory/repositories/tiktok-configuration.js',
  () => configurationMocks,
);

vi.mock(
  '../../src/memory/repositories/tiktok-follow-back.js',
  () => ({
    completeTikTokFollowBackCheck:
      vi.fn(),
  }),
);

import {
  registerConfirmedWebFollow,
} from '../../src/tiktok/web-follow-registration.js';

describe(
  'Web confirmed Follow persistence chain',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      configurationMocks
        .getTikTokNumberConfiguration
        .mockResolvedValue(
          48,
        );

      relationshipMocks
        .registerTikTokSystemFollow
        .mockImplementation(
          async input => ({
            id:
              'relationship-web-1',
            accountKey:
              input.accountKey,
            targetKey:
              input.targetKey,
            username:
              input.username,
            displayName:
              input.displayName,
            relationshipState:
              'following',
            followedByUs:
              true,
            followsUs:
              false,
            followedByUsAt:
              input.followedAt,
            lastCheckedAt:
              null,
            followBackCheckAt:
              input.followBackCheckAt,
            processed:
              false,
            protected:
              false,
            metadata:
              input.metadata,
            createdAt:
              input.followedAt,
            updatedAt:
              input.followedAt,
          }),
        );

      actionMocks
        .createOrReuseOpenTikTokAction
        .mockImplementation(
          async input => ({
            created:
              true,
            action: {
              id:
                'check-web-1',
              accountKey:
                input.accountKey,
              type:
                input.type,
              targetKey:
                input.targetKey,
              targetUsername:
                input.targetUsername,
              targetDisplayName:
                input.targetDisplayName,
              status:
                input.status,
              executeAt:
                input.executeAt,
              priority:
                5,
              attempts:
                0,
              maxAttempts:
                3,
              provider:
                input.provider,
              payload:
                input.payload,
              result:
                null,
              error:
                null,
              createdAt:
                new Date(
                  '2026-09-19T02:30:00.000Z',
                ),
              updatedAt:
                new Date(
                  '2026-09-19T02:30:00.000Z',
                ),
            },
          }),
        );
    });

    it('persists one Web relationship and schedules one Web CHECK_FOLLOW_BACK 48h later', async () => {
      const followedAt =
        new Date(
          '2026-09-19T02:30:00.000Z',
        );

      const result =
        await registerConfirmedWebFollow({
          accountKey:
            'web-account-1',
          username:
            '@TikTok',
          displayName:
            'TikTok',
          observedRelationship:
            'following',
          followedAt,
        });

      const expectedCheckAt =
        new Date(
          '2026-09-21T02:30:00.000Z',
        );

      expect(
        configurationMocks
          .getTikTokNumberConfiguration,
      ).toHaveBeenCalledWith(
        'follow_back_check_hours',
        48,
        {
          min:
            1,
          max:
            24 * 30,
        },
      );

      expect(
        relationshipMocks
          .registerTikTokSystemFollow,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        relationshipMocks
          .registerTikTokSystemFollow,
      ).toHaveBeenCalledWith({
        accountKey:
          'web-account-1',
        targetKey:
          'username:tiktok',
        username:
          'TikTok',
        displayName:
          'TikTok',
        followedAt,
        followBackCheckAt:
          expectedCheckAt,
        metadata: {
          source:
            'system_follow',
        },
      });

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledWith({
        accountKey:
          'web-account-1',
        type:
          'CHECK_FOLLOW_BACK',
        targetKey:
          'username:tiktok',
        targetUsername:
          'TikTok',
        targetDisplayName:
          'TikTok',
        status:
          'scheduled',
        executeAt:
          expectedCheckAt,
        provider:
          'web',
        payload: {
          relationshipId:
            'relationship-web-1',
          reason:
            'follow_back_wait_elapsed',
          followedAt:
            followedAt.toISOString(),
          waitHours:
            48,
        },
      });

      expect(
        actionMocks
          .rescheduleTikTokAction,
      ).not.toHaveBeenCalled();

      expect(
        result.relationship,
      ).toMatchObject({
        accountKey:
          'web-account-1',
        targetKey:
          'username:tiktok',
        relationshipState:
          'following',
        followedByUs:
          true,
        processed:
          false,
      });

      expect(
        result.checkAction,
      ).toMatchObject({
        id:
          'check-web-1',
        accountKey:
          'web-account-1',
        type:
          'CHECK_FOLLOW_BACK',
        status:
          'scheduled',
        provider:
          'web',
        executeAt:
          expectedCheckAt,
      });

      expect(
        result.followBackCheckAt,
      ).toEqual(
        expectedCheckAt,
      );

      expect(
        result.waitHours,
      ).toBe(
        48,
      );

      const createdActions =
        actionMocks
          .createOrReuseOpenTikTokAction
          .mock.calls
          .map(
            ([input]) =>
              input.type,
          );

      expect(
        createdActions,
      ).toEqual([
        'CHECK_FOLLOW_BACK',
      ]);

      expect(
        createdActions,
      ).not.toContain(
        'UNFOLLOW',
      );
    });

    it('does not reach persistence when Web Follow is not confirmed', async () => {
      await expect(
        registerConfirmedWebFollow({
          accountKey:
            'web-account-1',
          username:
            'tiktok',
          observedRelationship:
            'not_following',
          followedAt:
            new Date(
              '2026-09-19T02:30:00.000Z',
            ),
        }),
      ).rejects.toThrow(
        'Web follow is not confirmed',
      );

      expect(
        relationshipMocks
          .registerTikTokSystemFollow,
      ).not.toHaveBeenCalled();

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).not.toHaveBeenCalled();
    });
  },
);

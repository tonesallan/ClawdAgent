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

import {
  registerSuccessfulTikTokFollow,
} from '../../src/tiktok/persistence-service.js';

function relationshipRow() {
  return {
    id: 'relationship-1',
    accountKey: 'default',
    targetKey:
      'username:tiktok',
    username:
      'tiktok',
    displayName:
      'TikTok',
    relationshipState:
      'following',
    followedByUs:
      true,
    followsUs:
      false,
    followedByUsAt:
      new Date(
        '2026-09-17T20:00:00.000Z',
      ),
    lastCheckedAt:
      null,
    followBackCheckAt:
      new Date(
        '2026-09-19T20:00:00.000Z',
      ),
    processed:
      false,
    protected:
      false,
    metadata: {},
    createdAt:
      new Date(
        '2026-09-17T20:00:00.000Z',
      ),
    updatedAt:
      new Date(
        '2026-09-17T20:00:00.000Z',
      ),
  };
}

function checkAction(
  overrides: Record<string, unknown> = {},
) {
  return {
    id:
      'check-1',
    accountKey:
      'default',
    type:
      'CHECK_FOLLOW_BACK',
    targetKey:
      'username:tiktok',
    targetUsername:
      'tiktok',
    targetDisplayName:
      'TikTok',
    status:
      'scheduled',
    executeAt:
      new Date(
        '2026-09-19T20:00:00.000Z',
      ),
    priority:
      5,
    attempts:
      0,
    maxAttempts:
      3,
    provider:
      'android',
    payload: {},
    result:
      null,
    error:
      null,
    createdAt:
      new Date(
        '2026-09-17T20:00:00.000Z',
      ),
    updatedAt:
      new Date(
        '2026-09-17T20:00:00.000Z',
      ),
    ...overrides,
  };
}

describe(
  'TikTok successful follow scheduling',
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
        .mockResolvedValue(
          relationshipRow(),
        );

      actionMocks
        .createOrReuseOpenTikTokAction
        .mockResolvedValue({
          action:
            checkAction(),
          created:
            true,
        });

      actionMocks
        .rescheduleTikTokAction
        .mockResolvedValue(
          checkAction(),
        );
    });

    it('schedules exactly one CHECK_FOLLOW_BACK 48 hours after a successful follow', async () => {
      const followedAt =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const result =
        await registerSuccessfulTikTokFollow({
          targetKey:
            'username:tiktok',
          username:
            'tiktok',
          displayName:
            'TikTok',
          followedAt,
        });

      const expectedCheckAt =
        new Date(
          '2026-09-19T20:00:00.000Z',
        );

      expect(
        configurationMocks
          .getTikTokNumberConfiguration,
      ).toHaveBeenCalledWith(
        'follow_back_check_hours',
        48,
        {
          min: 1,
          max: 24 * 30,
        },
      );

      expect(
        relationshipMocks
          .registerTikTokSystemFollow,
      ).toHaveBeenCalledWith({
        accountKey:
          'default',
        targetKey:
          'username:tiktok',
        username:
          'tiktok',
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
      ).toHaveBeenCalledTimes(1);

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledWith({
        accountKey:
          'default',
        type:
          'CHECK_FOLLOW_BACK',
        targetKey:
          'username:tiktok',
        targetUsername:
          'tiktok',
        targetDisplayName:
          'TikTok',
        status:
          'scheduled',
        executeAt:
          expectedCheckAt,
        provider:
          'android',
        payload: {
          relationshipId:
            'relationship-1',
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
        result.followBackCheckAt,
      ).toEqual(
        expectedCheckAt,
      );

      expect(
        result.waitHours,
      ).toBe(48);

      expect(
        result.checkAction,
      ).toMatchObject({
        id:
          'check-1',
        type:
          'CHECK_FOLLOW_BACK',
        status:
          'scheduled',
      });
    });

    it('honors the configured follow-back wait instead of hardcoding 48 hours', async () => {
      configurationMocks
        .getTikTokNumberConfiguration
        .mockResolvedValue(
          72,
        );

      const followedAt =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      await registerSuccessfulTikTokFollow({
        accountKey:
          'secondary',
        targetKey:
          'username:example',
        username:
          'example',
        followedAt,
        provider:
          'android',
      });

      expect(
        relationshipMocks
          .registerTikTokSystemFollow,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          accountKey:
            'secondary',
          followBackCheckAt:
            new Date(
              '2026-09-20T20:00:00.000Z',
            ),
        }),
      );

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          type:
            'CHECK_FOLLOW_BACK',
          status:
            'scheduled',
          executeAt:
            new Date(
              '2026-09-20T20:00:00.000Z',
            ),
          payload:
            expect.objectContaining({
              waitHours:
                72,
            }),
        }),
      );
    });

    it('reuses and reschedules the existing open CHECK_FOLLOW_BACK instead of duplicating it', async () => {
      const followedAt =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const existing =
        checkAction({
          id:
            'existing-check',
          executeAt:
            new Date(
              '2026-09-18T20:00:00.000Z',
            ),
          attempts:
            2,
        });

      const rescheduled =
        checkAction({
          id:
            'existing-check',
          executeAt:
            new Date(
              '2026-09-19T20:00:00.000Z',
            ),
          attempts:
            0,
        });

      actionMocks
        .createOrReuseOpenTikTokAction
        .mockResolvedValue({
          action:
            existing,
          created:
            false,
        });

      actionMocks
        .rescheduleTikTokAction
        .mockResolvedValue(
          rescheduled,
        );

      const result =
        await registerSuccessfulTikTokFollow({
          targetKey:
            'username:tiktok',
          username:
            'tiktok',
          followedAt,
        });

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledTimes(1);

      expect(
        actionMocks
          .rescheduleTikTokAction,
      ).toHaveBeenCalledTimes(1);

      expect(
        actionMocks
          .rescheduleTikTokAction,
      ).toHaveBeenCalledWith(
        'existing-check',
        new Date(
          '2026-09-19T20:00:00.000Z',
        ),
        {
          relationshipId:
            'relationship-1',
          reason:
            'follow_back_wait_elapsed',
          followedAt:
            followedAt.toISOString(),
          waitHours:
            48,
        },
        {
          expectedStatus:
            'scheduled',
          attempts:
            0,
        },
      );

      expect(
        result.checkAction,
      ).toBe(
        rescheduled,
      );

      expect(
        result.checkAction.attempts,
      ).toBe(
        0,
      );
    });

    it('reschedules a running CHECK_FOLLOW_BACK when a newer follow resets the wait window', async () => {
      const followedAt =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const running =
        checkAction({
          id:
            'running-check',
          status:
            'running',
          executeAt:
            new Date(
              '2026-09-17T19:59:00.000Z',
            ),
          attempts:
            1,
        });

      const rescheduled =
        checkAction({
          id:
            'running-check',
          status:
            'scheduled',
          executeAt:
            new Date(
              '2026-09-19T20:00:00.000Z',
            ),
          attempts:
            0,
        });

      actionMocks
        .createOrReuseOpenTikTokAction
        .mockResolvedValue({
          action:
            running,
          created:
            false,
        });

      actionMocks
        .rescheduleTikTokAction
        .mockResolvedValue(
          rescheduled,
        );

      const result =
        await registerSuccessfulTikTokFollow({
          targetKey:
            'username:tiktok',
          username:
            'tiktok',
          followedAt,
        });

      expect(
        actionMocks
          .rescheduleTikTokAction,
      ).toHaveBeenCalledWith(
        'running-check',
        new Date(
          '2026-09-19T20:00:00.000Z',
        ),
        {
          relationshipId:
            'relationship-1',
          reason:
            'follow_back_wait_elapsed',
          followedAt:
            followedAt.toISOString(),
          waitHours:
            48,
        },
        {
          expectedStatus:
            'running',
          attempts:
            0,
        },
      );

      expect(
        result.checkAction,
      ).toBe(
        rescheduled,
      );

      expect(
        result.checkAction.status,
      ).toBe(
        'scheduled',
      );

      expect(
        result.checkAction.attempts,
      ).toBe(
        0,
      );
    });

    it('never creates UNFOLLOW while registering the successful follow', async () => {
      await registerSuccessfulTikTokFollow({
        targetKey:
          'username:tiktok',
        username:
          'tiktok',
        followedAt:
          new Date(
            '2026-09-17T20:00:00.000Z',
          ),
      });

      const calls =
        actionMocks
          .createOrReuseOpenTikTokAction
          .mock.calls;

      expect(calls).toHaveLength(1);

      expect(
        calls[0][0].type,
      ).toBe(
        'CHECK_FOLLOW_BACK',
      );

      expect(
        calls.some(
          ([input]) =>
            input.type ===
            'UNFOLLOW',
        ),
      ).toBe(false);

      expect(
        actionMocks
          .transitionTikTokAction,
      ).not.toHaveBeenCalled();
    });

    it('recovers when a concurrent completion wins the first reschedule race', async () => {
      const followedAt =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const running =
        checkAction({
          id:
            'old-running-check',
          status:
            'running',
          attempts:
            1,
        });

      const replacement =
        checkAction({
          id:
            'new-check',
          status:
            'scheduled',
          attempts:
            0,
          executeAt:
            new Date(
              '2026-09-19T20:00:00.000Z',
            ),
        });

      actionMocks
        .createOrReuseOpenTikTokAction
        .mockResolvedValueOnce({
          action:
            running,
          created:
            false,
        })
        .mockResolvedValueOnce({
          action:
            replacement,
          created:
            true,
        });

      actionMocks
        .rescheduleTikTokAction
        .mockResolvedValueOnce(
          null,
        );

      const result =
        await registerSuccessfulTikTokFollow({
          targetKey:
            'username:tiktok',
          username:
            'tiktok',
          followedAt,
        });

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledTimes(
        2,
      );

      expect(
        actionMocks
          .rescheduleTikTokAction,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        result.checkAction,
      ).toBe(
        replacement,
      );

      expect(
        result.checkAction.status,
      ).toBe(
        'scheduled',
      );

      expect(
        result.checkAction.attempts,
      ).toBe(
        0,
      );
    });

    it('fails loudly if an existing open check cannot be rescheduled', async () => {
      actionMocks
        .createOrReuseOpenTikTokAction
        .mockResolvedValue({
          action:
            checkAction({
              id:
                'existing-check',
            }),
          created:
            false,
        });

      actionMocks
        .rescheduleTikTokAction
        .mockResolvedValue(
          null,
        );

      await expect(
        registerSuccessfulTikTokFollow({
          targetKey:
            'username:tiktok',
          username:
            'tiktok',
          followedAt:
            new Date(
              '2026-09-17T20:00:00.000Z',
            ),
        }),
      ).rejects.toThrow(
        'Failed to schedule CHECK_FOLLOW_BACK after concurrent state changes.',
      );

      expect(
        actionMocks
          .createOrReuseOpenTikTokAction,
      ).toHaveBeenCalledTimes(
        3,
      );

      expect(
        actionMocks
          .rescheduleTikTokAction,
      ).toHaveBeenCalledTimes(
        3,
      );
    });
  },
);

import { describe, expect, it, vi } from 'vitest';

import {
  AndroidTikTokProvider,
} from '../../src/tiktok/providers/android-tiktok-provider.js';

import {
  TikTokProviderRegistry,
} from '../../src/tiktok/provider-registry.js';

import type {
  TikTokRelationshipManager,
} from '../../src/tiktok/relationship-manager.js';

import {
  createFollowBackSchedulerHandler,
} from '../../src/tiktok/follow-back-handler.js';

import type {
  TikTokAction,
} from '../../src/memory/repositories/tiktok-actions.js';

function createAction(
  overrides: Partial<TikTokAction> = {},
): TikTokAction {
  return {
    id: 'check-1',
    accountKey: 'default',
    type: 'CHECK_FOLLOW_BACK',
    targetKey: 'username:tiktok',
    targetUsername: 'tiktok',
    targetDisplayName: 'TikTok',
    status: 'running',
    executeAt: new Date(
      '2026-09-17T20:00:00.000Z',
    ),
    priority: 5,
    attempts: 1,
    maxAttempts: 3,
    provider: 'android',
    payload: {},
    result: null,
    error: null,
    createdAt: new Date(
      '2026-09-15T20:00:00.000Z',
    ),
    updatedAt: new Date(
      '2026-09-17T20:00:00.000Z',
    ),
    ...overrides,
  } as TikTokAction;
}

function createHarness(
  relationship:
    | 'friends'
    | 'following'
    | 'follows_us'
    | 'not_following'
    | 'unknown',
  unfollowReviewAction:
    | Record<string, unknown>
    | null = null,
) {
  const checkRelationship =
    vi.fn().mockResolvedValue({
      provider: 'android' as const,
      targetKey: 'username:tiktok',
      relationship,
      observedAt: new Date(
        '2026-09-17T20:00:00.000Z',
      ),
    });

  const unfollow =
    vi.fn();

  const provider =
    new AndroidTikTokProvider({
      checkRelationship,
      follow: vi.fn(),
      unfollow,
    });

  const registry =
    new TikTokProviderRegistry();

  registry.register(provider);

  const recordRelationshipCheck =
    vi.fn().mockResolvedValue({
      relationship: {
        targetKey: 'username:tiktok',
      },
      unfollowReviewAction,
    });

  const relationshipManager = {
    recordRelationshipCheck,
  } as unknown as TikTokRelationshipManager;

  const handler =
    createFollowBackSchedulerHandler(
      registry,
      relationshipManager,
    );

  return {
    handler,
    checkRelationship,
    unfollow,
    recordRelationshipCheck,
  };
}

describe(
  'TikTok follow-back scheduler handler safety',
  () => {
    it('keeps unknown retryable by failing before persistence', async () => {
      const {
        handler,
        checkRelationship,
        recordRelationshipCheck,
      } = createHarness('unknown');

      await expect(
        handler(createAction()),
      ).rejects.toThrow(
        'Relationship state is not safe to classify: unknown',
      );

      expect(
        checkRelationship,
      ).toHaveBeenCalledTimes(1);

      expect(
        recordRelationshipCheck,
      ).not.toHaveBeenCalled();
    });

    it('persists not_following without creating an unfollow review', async () => {
      const {
        handler,
        recordRelationshipCheck,
        unfollow,
      } = createHarness(
        'not_following',
        null,
      );

      const result =
        await handler(
          createAction(),
        );

      expect(
        recordRelationshipCheck,
      ).toHaveBeenCalledWith({
        checkActionId: 'check-1',
        accountKey: 'default',
        targetKey: 'username:tiktok',
        relationshipState:
          'not_following',
        provider: 'android',
        checkedAt: new Date(
          '2026-09-17T20:00:00.000Z',
        ),
      });

      expect(result.result).toMatchObject({
        relationship:
          'not_following',
        provider: 'android',
        unfollowReviewCreated:
          false,
      });

      expect(
        unfollow,
      ).not.toHaveBeenCalled();
    });

    it('reports a following review candidate without executing unfollow', async () => {
      const {
        handler,
        unfollow,
      } = createHarness(
        'following',
        {
          id: 'unfollow-review-1',
          status: 'pending',
        },
      );

      const result =
        await handler(
          createAction(),
        );

      expect(result.result).toMatchObject({
        relationship: 'following',
        provider: 'android',
        unfollowReviewCreated: true,
      });

      expect(
        unfollow,
      ).not.toHaveBeenCalled();
    });

    it('rejects action types other than CHECK_FOLLOW_BACK', async () => {
      const {
        handler,
        checkRelationship,
      } = createHarness(
        'not_following',
      );

      await expect(
        handler(
          createAction({
            type: 'UNFOLLOW',
          }),
        ),
      ).rejects.toThrow(
        'Unexpected action type: UNFOLLOW',
      );

      expect(
        checkRelationship,
      ).not.toHaveBeenCalled();
    });
  },
);

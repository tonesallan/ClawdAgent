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

const repositoryMocks =
  vi.hoisted(() => ({
    listDueScheduledTikTokActions:
      vi.fn(),
    recoverStaleTikTokRunningActions:
      vi.fn(),
    claimDueTikTokScheduledAction:
      vi.fn(),
    deferDueTikTokScheduledAction:
      vi.fn(),
    rescheduleTikTokAction:
      vi.fn(),
    transitionTikTokAction:
      vi.fn(),
  }));

vi.mock(
  '../../src/memory/repositories/tiktok-actions.js',
  () => repositoryMocks,
);

import {
  runTikTokScheduler,
} from '../../src/tiktok/scheduler.js';

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
    status: 'scheduled',
    executeAt: new Date(
      '2026-09-17T20:00:00.000Z',
    ),
    priority: 5,
    attempts: 0,
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

const allowedPolicy = {
  evaluate:
    vi.fn().mockResolvedValue({
      allowed: true,
      reason: 'allowed',
      retryAt: null,
    }),
} as any;

describe(
  'TikTok scheduler follow-back safety',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      allowedPolicy.evaluate
        .mockResolvedValue({
          allowed: true,
          reason: 'allowed',
          retryAt: null,
        });

      repositoryMocks
        .recoverStaleTikTokRunningActions
        .mockResolvedValue(undefined);

      repositoryMocks
        .deferDueTikTokScheduledAction
        .mockResolvedValue(null);

      repositoryMocks
        .rescheduleTikTokAction
        .mockResolvedValue(null);

      repositoryMocks
        .transitionTikTokAction
        .mockResolvedValue(null);
    });

    it('reschedules an unknown relationship failure with persistent backoff', async () => {
      const now =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const scheduled =
        createAction({
          attempts: 0,
        });

      const claimed =
        createAction({
          status: 'running',
          attempts: 1,
        });

      repositoryMocks
        .listDueScheduledTikTokActions
        .mockResolvedValue([
          scheduled,
        ]);

      repositoryMocks
        .claimDueTikTokScheduledAction
        .mockResolvedValue(
          claimed,
        );

      const handler =
        vi.fn().mockRejectedValue(
          new Error(
            'Relationship state is not safe to classify: unknown',
          ),
        );

      const summary =
        await runTikTokScheduler({
          now,
          limitPolicy:
            allowedPolicy,
          checkFollowBackHandler:
            handler,
        });

      expect(summary).toEqual({
        scanned: 1,
        processed: 1,
        succeeded: 0,
        failed: 1,
        skipped: 0,
      });

      expect(
        repositoryMocks
          .rescheduleTikTokAction,
      ).toHaveBeenCalledTimes(1);

      expect(
        repositoryMocks
          .rescheduleTikTokAction,
      ).toHaveBeenCalledWith(
        'check-1',
        new Date(
          '2026-09-17T20:01:00.000Z',
        ),
        undefined,
        {
          expectedStatus:
            'running',
          error:
            'Relationship state is not safe to classify: unknown',
          attempts: 1,
          metadata: {
            reason:
              'retry_backoff',
            backoffSeconds: 60,
          },
        },
      );

      expect(
        repositoryMocks
          .transitionTikTokAction,
      ).not.toHaveBeenCalled();
    });

    it('never executes a scheduled UNFOLLOW even if it reaches the due list', async () => {
      const unfollow =
        createAction({
          id: 'unfollow-1',
          type: 'UNFOLLOW',
          targetKey:
            'username:tiktok',
        });

      repositoryMocks
        .listDueScheduledTikTokActions
        .mockResolvedValue([
          unfollow,
        ]);

      const handler = vi.fn();

      const summary =
        await runTikTokScheduler({
          now: new Date(
            '2026-09-17T20:00:00.000Z',
          ),
          limitPolicy:
            allowedPolicy,
          checkFollowBackHandler:
            handler,
        });

      expect(summary).toEqual({
        scanned: 1,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 1,
      });

      expect(
        repositoryMocks
          .claimDueTikTokScheduledAction,
      ).not.toHaveBeenCalled();

      expect(
        handler,
      ).not.toHaveBeenCalled();

      expect(
        repositoryMocks
          .rescheduleTikTokAction,
      ).not.toHaveBeenCalled();

      expect(
        repositoryMocks
          .transitionTikTokAction,
      ).not.toHaveBeenCalled();
    });

    it('stops retrying only after maxAttempts is exhausted', async () => {
      const now =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const scheduled =
        createAction({
          attempts: 2,
          maxAttempts: 3,
        });

      const claimed =
        createAction({
          status: 'running',
          attempts: 3,
          maxAttempts: 3,
        });

      repositoryMocks
        .listDueScheduledTikTokActions
        .mockResolvedValue([
          scheduled,
        ]);

      repositoryMocks
        .claimDueTikTokScheduledAction
        .mockResolvedValue(
          claimed,
        );

      const handler =
        vi.fn().mockRejectedValue(
          new Error(
            'Relationship state is not safe to classify: unknown',
          ),
        );

      const summary =
        await runTikTokScheduler({
          now,
          limitPolicy:
            allowedPolicy,
          checkFollowBackHandler:
            handler,
        });

      expect(summary.failed).toBe(1);

      expect(
        repositoryMocks
          .rescheduleTikTokAction,
      ).not.toHaveBeenCalled();

      expect(
        repositoryMocks
          .transitionTikTokAction,
      ).toHaveBeenCalledWith(
        'check-1',
        {
          status: 'failed',
          attempts: 3,
          error:
            'Relationship state is not safe to classify: unknown',
          metadata: {
            reason:
              'retry_exhausted',
          },
        },
      );
    });
  },
);

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  TikTokProviderRegistry,
} from '../../src/tiktok/provider-registry.js';

import {
  TikTokRuntime,
} from '../../src/tiktok/runtime.js';

import type {
  TikTokRelationshipManager,
} from '../../src/tiktok/relationship-manager.js';

import type {
  TikTokAutomationProvider,
} from '../../src/tiktok/providers/tiktok-provider.js';

import type {
  TikTokAction,
} from '../../src/memory/repositories/tiktok-actions.js';

function createAction(): TikTokAction {
  return {
    id:
      'web-check-1',
    accountKey:
      'web-account-1',
    type:
      'CHECK_FOLLOW_BACK',
    targetKey:
      'username:tiktok',
    targetUsername:
      'tiktok',
    targetDisplayName:
      'TikTok',
    status:
      'running',
    executeAt:
      new Date(
        '2026-09-19T00:00:00.000Z',
      ),
    priority:
      5,
    attempts:
      1,
    maxAttempts:
      3,
    provider:
      'web',
    payload:
      {},
    result:
      null,
    error:
      null,
    createdAt:
      new Date(
        '2026-09-17T00:00:00.000Z',
      ),
    updatedAt:
      new Date(
        '2026-09-19T00:00:00.000Z',
      ),
  } as TikTokAction;
}

describe(
  'TikTok runtime provider wiring',
  () => {
    it('registers Web and runs CHECK_FOLLOW_BACK through the common handler', async () => {
      const checkRelationship =
        vi.fn().mockResolvedValue({
          provider:
            'web' as const,
          targetKey:
            'username:tiktok',
          relationship:
            'not_following' as const,
          observedAt:
            new Date(
              '2026-09-19T00:00:00.000Z',
            ),
        });

      const close =
        vi.fn().mockResolvedValue(
          undefined,
        );

      const provider: TikTokAutomationProvider & {
        close:
          () => Promise<void>;
      } = {
        name:
          'web',
        checkRelationship,
        follow:
          vi.fn(),
        unfollow:
          vi.fn(),
        close,
      };

      const registry =
        new TikTokProviderRegistry();

      const recordRelationshipCheck =
        vi.fn().mockResolvedValue({
          relationship: {
            targetKey:
              'username:tiktok',
          },
          unfollowReviewAction:
            null,
        });

      const relationshipManager = {
        recordRelationshipCheck,
      } as unknown as TikTokRelationshipManager;

      const schedulerRunner =
        vi.fn().mockImplementation(
          async options => {
            expect(
              options.providerNames,
            ).toEqual([
              'web',
            ]);

            expect(
              options.checkFollowBackHandler,
            ).toBeTypeOf(
              'function',
            );

            await options
              .checkFollowBackHandler(
                createAction(),
              );

            return {
              scanned:
                1,
              processed:
                1,
              succeeded:
                1,
              failed:
                0,
              skipped:
                0,
            };
          },
        );

      const runtime =
        new TikTokRuntime({
          registry,
          relationshipManager,
          providers: [
            provider,
          ],
          schedulerRunner:
            schedulerRunner as any,
          intervalMs:
            60_000,
        });

      const result =
        await runtime.runOnce();

      expect(result).toEqual({
        scanned:
          1,
        processed:
          1,
        succeeded:
          1,
        failed:
          0,
        skipped:
          0,
      });

      expect(
        runtime.getRegisteredProviders(),
      ).toEqual([
        'web',
      ]);

      expect(
        checkRelationship,
      ).toHaveBeenCalledWith({
        targetKey:
          'username:tiktok',
        accountKey:
          'web-account-1',
        username:
          'tiktok',
        displayName:
          'TikTok',
      });

      expect(
        recordRelationshipCheck,
      ).toHaveBeenCalledWith({
        checkActionId:
          'web-check-1',
        accountKey:
          'web-account-1',
        targetKey:
          'username:tiktok',
        relationshipState:
          'not_following',
        provider:
          'web',
        checkedAt:
          new Date(
            '2026-09-19T00:00:00.000Z',
          ),
      });

      expect(
        close,
      ).not.toHaveBeenCalled();

      await runtime.stop();

      expect(
        close,
      ).toHaveBeenCalledTimes(
        1,
      );
    });

    it('deduplicates overlapping scheduler ticks', async () => {
      let resolveRun:
        (
          value: {
            scanned: number;
            processed: number;
            succeeded: number;
            failed: number;
            skipped: number;
          },
        ) => void =
          () => {};

      const pending =
        new Promise<{
          scanned: number;
          processed: number;
          succeeded: number;
          failed: number;
          skipped: number;
        }>(
          resolve => {
            resolveRun =
              resolve;
          },
        );

      const provider: TikTokAutomationProvider = {
        name:
          'web',
        checkRelationship:
          vi.fn(),
        follow:
          vi.fn(),
        unfollow:
          vi.fn(),
      };

      const schedulerRunner =
        vi.fn().mockReturnValue(
          pending,
        );

      const runtime =
        new TikTokRuntime({
          registry:
            new TikTokProviderRegistry(),
          providers: [
            provider,
          ],
          schedulerRunner:
            schedulerRunner as any,
        });

      const first =
        runtime.runOnce();

      const second =
        runtime.runOnce();

      expect(
        schedulerRunner,
      ).toHaveBeenCalledTimes(
        1,
      );

      resolveRun({
        scanned:
          0,
        processed:
          0,
        succeeded:
          0,
        failed:
          0,
        skipped:
          0,
      });

      await expect(
        first,
      ).resolves.toEqual({
        scanned:
          0,
        processed:
          0,
        succeeded:
          0,
        failed:
          0,
        skipped:
          0,
      });

      await expect(
        second,
      ).resolves.toEqual({
        scanned:
          0,
        processed:
          0,
        succeeded:
          0,
        failed:
          0,
        skipped:
          0,
      });

      await runtime.stop();
    });
  },
);

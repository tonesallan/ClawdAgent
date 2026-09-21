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
      'android-check-1',
    accountKey:
      'android-device-1:tiktok',
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
      'android',
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
    it('registers Android and runs CHECK_FOLLOW_BACK through the common handler', async () => {
      const checkRelationship =
        vi.fn().mockResolvedValue({
          provider:
            'android' as const,
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
          'android',
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
              'android',
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
        'android',
      ]);

      expect(
        checkRelationship,
      ).toHaveBeenCalledWith({
        targetKey:
          'username:tiktok',
        accountKey:
          'android-device-1:tiktok',
        username:
          'tiktok',
        displayName:
          'TikTok',
      });

      expect(
        recordRelationshipCheck,
      ).toHaveBeenCalledWith({
        checkActionId:
          'android-check-1',
        accountKey:
          'android-device-1:tiktok',
        targetKey:
          'username:tiktok',
        relationshipState:
          'not_following',
        provider:
          'android',
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

    it('exposes start pause resume stop lifecycle and last tick status', async () => {
      const close =
        vi.fn().mockResolvedValue(
          undefined,
        );

      const provider: TikTokAutomationProvider & {
        close:
          () => Promise<void>;
      } = {
        name:
          'android',
        checkRelationship:
          vi.fn(),
        follow:
          vi.fn(),
        unfollow:
          vi.fn(),
        close,
      };

      const schedulerRunner =
        vi.fn().mockResolvedValue({
          scanned:
            2,
          processed:
            1,
          succeeded:
            1,
          failed:
            0,
          skipped:
            1,
        });

      const runtime =
        new TikTokRuntime({
          registry:
            new TikTokProviderRegistry(),
          providers: [
            provider,
          ],
          schedulerRunner:
            schedulerRunner as any,
          intervalMs:
            60_000,
        });

      expect(
        runtime.getStatus(),
      ).toMatchObject({
        state:
          'stopped',
        started:
          false,
        paused:
          false,
        tickActive:
          false,
        intervalMs:
          60_000,
        lastResult:
          null,
        lastError:
          null,
      });

      runtime.start();

      await runtime.runOnce();

      expect(
        runtime.getStatus(),
      ).toMatchObject({
        state:
          'running',
        started:
          true,
        paused:
          false,
        tickActive:
          false,
        registeredProviders: [
          'android',
        ],
        lastResult: {
          scanned:
            2,
          processed:
            1,
          succeeded:
            1,
          failed:
            0,
          skipped:
            1,
        },
        lastError:
          null,
      });

      expect(
        runtime.getStatus()
          .lastRunStartedAt,
      ).toEqual(
        expect.any(
          String,
        ),
      );

      expect(
        runtime.getStatus()
          .lastRunCompletedAt,
      ).toEqual(
        expect.any(
          String,
        ),
      );

      runtime.pause();

      expect(
        runtime.getStatus(),
      ).toMatchObject({
        state:
          'paused',
        started:
          true,
        paused:
          true,
      });

      runtime.resume();

      await runtime.runOnce();

      expect(
        runtime.getStatus(),
      ).toMatchObject({
        state:
          'running',
        started:
          true,
        paused:
          false,
      });

      expect(
        schedulerRunner.mock.calls.length,
      ).toBeGreaterThanOrEqual(
        2,
      );

      await runtime.stop();

      expect(
        runtime.getStatus(),
      ).toMatchObject({
        state:
          'stopped',
        started:
          false,
        paused:
          false,
        tickActive:
          false,
      });

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
          'android',
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

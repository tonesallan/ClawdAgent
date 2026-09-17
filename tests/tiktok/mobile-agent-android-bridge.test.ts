import { describe, expect, it, vi } from 'vitest';

import type {
  MobileAgent,
} from '../../src/actions/mobile/mobile-agent.js';

import {
  createReadOnlyAndroidTikTokProvider,
} from '../../src/tiktok/providers/mobile-agent-android-bridge.js';

import type {
  TikTokObservedRelationship,
  TikTokTarget,
} from '../../src/tiktok/providers/tiktok-provider.js';

function createMobileAgentDouble(options?: {
  opened?: boolean;
  relationship?: TikTokObservedRelationship;
}) {
  const openTikTokProfileByUsername =
    vi.fn().mockResolvedValue(
      options?.opened ?? true,
    );

  const inspectTikTokCurrentRelationship =
    vi.fn().mockResolvedValue(
      options?.relationship ?? 'unknown',
    );

  const mobileAgent = {
    openTikTokProfileByUsername,
    inspectTikTokCurrentRelationship,
  } as unknown as MobileAgent;

  return {
    mobileAgent,
    openTikTokProfileByUsername,
    inspectTikTokCurrentRelationship,
  };
}

const target: TikTokTarget = {
  targetKey: 'username:tiktok',
  username: 'tiktok',
};

describe(
  'read-only Android TikTok provider bridge',
  () => {
    it.each([
      'friends',
      'following',
      'follows_us',
      'not_following',
      'unknown',
    ] as const)(
      'opens the exact profile and returns relationship=%s unchanged',
      async relationship => {
        const {
          mobileAgent,
          openTikTokProfileByUsername,
          inspectTikTokCurrentRelationship,
        } = createMobileAgentDouble({
          relationship,
        });

        const provider =
          createReadOnlyAndroidTikTokProvider(
            mobileAgent,
          );

        const before = Date.now();

        const observation =
          await provider.checkRelationship(
            target,
          );

        const after = Date.now();

        expect(
          openTikTokProfileByUsername,
        ).toHaveBeenCalledTimes(1);
        expect(
          openTikTokProfileByUsername,
        ).toHaveBeenCalledWith(
          'tiktok',
        );

        expect(
          inspectTikTokCurrentRelationship,
        ).toHaveBeenCalledTimes(1);

        expect(
          openTikTokProfileByUsername.mock
            .invocationCallOrder[0],
        ).toBeLessThan(
          inspectTikTokCurrentRelationship.mock
            .invocationCallOrder[0],
        );

        expect(observation).toMatchObject({
          provider: 'android',
          targetKey: target.targetKey,
          relationship,
          details: {
            readOnly: true,
            source: 'mobile-agent',
            navigationPerformed: true,
            username: 'tiktok',
          },
        });

        expect(
          observation.observedAt,
        ).toBeInstanceOf(Date);
        expect(
          observation.observedAt.getTime(),
        ).toBeGreaterThanOrEqual(before);
        expect(
          observation.observedAt.getTime(),
        ).toBeLessThanOrEqual(after);
      },
    );

    it('requires an exact username before any navigation', async () => {
      const {
        mobileAgent,
        openTikTokProfileByUsername,
        inspectTikTokCurrentRelationship,
      } = createMobileAgentDouble();

      const provider =
        createReadOnlyAndroidTikTokProvider(
          mobileAgent,
        );

      await expect(
        provider.checkRelationship({
          targetKey: 'missing-username',
        }),
      ).rejects.toThrow(
        'Android TikTok relationship check requires an exact username',
      );

      expect(
        openTikTokProfileByUsername,
      ).not.toHaveBeenCalled();
      expect(
        inspectTikTokCurrentRelationship,
      ).not.toHaveBeenCalled();
    });

    it('does not inspect relationship when the exact profile did not open', async () => {
      const {
        mobileAgent,
        openTikTokProfileByUsername,
        inspectTikTokCurrentRelationship,
      } = createMobileAgentDouble({
        opened: false,
      });

      const provider =
        createReadOnlyAndroidTikTokProvider(
          mobileAgent,
        );

      await expect(
        provider.checkRelationship(
          target,
        ),
      ).rejects.toThrow(
        'TikTok profile could not be opened: tiktok',
      );

      expect(
        openTikTokProfileByUsername,
      ).toHaveBeenCalledWith(
        'tiktok',
      );
      expect(
        inspectTikTokCurrentRelationship,
      ).not.toHaveBeenCalled();
    });

    it('keeps every mutating or engagement action disabled', async () => {
      const {
        mobileAgent,
      } = createMobileAgentDouble();

      const provider =
        createReadOnlyAndroidTikTokProvider(
          mobileAgent,
        );

      await expect(
        provider.follow(target),
      ).rejects.toThrow(
        'Android TikTok FOLLOW is disabled',
      );

      await expect(
        provider.unfollow(target),
      ).rejects.toThrow(
        'Android TikTok UNFOLLOW is disabled',
      );

      await expect(
        provider.like(target),
      ).rejects.toThrow(
        'Android TikTok LIKE is disabled',
      );

      await expect(
        provider.comment(
          target,
          'test',
        ),
      ).rejects.toThrow(
        'Android TikTok COMMENT is disabled',
      );

      await expect(
        provider.dm(
          target,
          'test',
        ),
      ).rejects.toThrow(
        'Android TikTok DM is disabled',
      );

      await expect(
        provider.visitProfile(target),
      ).rejects.toThrow(
        'Android TikTok PROFILE_VISIT is disabled',
      );
    });
  },
);

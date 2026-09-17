import type {
  MobileAgent,
} from '../../actions/mobile/mobile-agent.js';

import {
  AndroidTikTokProvider,
} from './android-tiktok-provider.js';

import type {
  TikTokProviderActionResult,
  TikTokRelationshipObservation,
  TikTokTarget,
} from './tiktok-provider.js';

function disabledAction(
  action:
    TikTokProviderActionResult['action'],
  target: TikTokTarget,
): never {

  throw new Error(
    `Android TikTok ${action} is disabled in read-only provider bridge for ${target.targetKey}`,
  );
}

/**
 * Phase 6A bridge.
 *
 * Only CHECK_FOLLOW_BACK inspection is enabled.
 *
 * FOLLOW and UNFOLLOW deliberately throw.
 * This prevents the scheduler/provider integration from
 * performing mutations on TikTok at this stage.
 */
export function createReadOnlyAndroidTikTokProvider(
  mobileAgent: MobileAgent,
): AndroidTikTokProvider {

  return new AndroidTikTokProvider({

    async checkRelationship(
      target,
    ): Promise<TikTokRelationshipObservation> {

      const relationship =
        await mobileAgent
          .inspectTikTokCurrentRelationship();

      return {
        provider: 'android',
        targetKey: target.targetKey,
        relationship,
        observedAt: new Date(),
        details: {
          readOnly: true,
          source: 'mobile-agent',
          navigationPerformed: false,
        },
      };
    },

    async follow(target) {
      return disabledAction(
        'FOLLOW',
        target,
      );
    },

    async unfollow(target) {
      return disabledAction(
        'UNFOLLOW',
        target,
      );
    },

    async like(target) {
      return disabledAction(
        'LIKE',
        target,
      );
    },

    async comment(
      target,
      _text,
    ) {
      return disabledAction(
        'COMMENT',
        target,
      );
    },

    async dm(
      target,
      _text,
    ) {
      return disabledAction(
        'DM',
        target,
      );
    },

    async visitProfile(target) {
      return disabledAction(
        'PROFILE_VISIT',
        target,
      );
    },
  });
}
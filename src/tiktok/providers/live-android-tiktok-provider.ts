import {
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
  target:
    TikTokTarget,
): never {
  throw new Error(
    `Android TikTok ${action} is disabled in the relationship provider for ${target.targetKey}`,
  );
}

function resolveTikTokAgent(
  accountKey?: string | null,
): MobileAgent {
  const agent =
    MobileAgent.getTikTokAgent(
      accountKey,
    );

  if (!agent) {
    throw new Error(
      'No active TikTok Android MobileAgent is available. Start the TikTok mobile agent first.',
    );
  }

  const status =
    agent.getStatus();

  if (
    status.state ===
      'stopped' ||
    status.state ===
      'error'
  ) {
    throw new Error(
      `TikTok Android MobileAgent is not available: ${status.state}`,
    );
  }

  return agent;
}

export function createLiveAndroidTikTokProvider(): AndroidTikTokProvider {
  return new AndroidTikTokProvider({
    isAvailable() {
      const agent =
        MobileAgent.getTikTokAgent();

      if (!agent) {
        return false;
      }

      const state =
        agent.getStatus()
          .state;

      return (
        state ===
          'running' ||
        state ===
          'paused'
      );
    },

    async checkRelationship(
      target,
    ): Promise<TikTokRelationshipObservation> {
      if (!target.username) {
        throw new Error(
          `Android TikTok relationship check requires an exact username for ${target.targetKey}`,
        );
      }

      const agent =
        resolveTikTokAgent(
          target.accountKey,
        );

      const initialState =
        agent.getStatus()
          .state;

      const shouldResume =
        initialState ===
        'running';

      if (shouldResume) {
        agent.pause();
      }

      const idleDeadline =
        Date.now() +
        30_000;

      while (
        agent.getStatus()
          .currentAction &&
        Date.now() <
          idleDeadline
      ) {
        await new Promise<void>(
          resolve =>
            setTimeout(
              resolve,
              250,
            ),
        );
      }

      if (
        agent.getStatus()
          .currentAction
      ) {
        if (shouldResume) {
          agent.resume();
        }

        throw new Error(
          'TikTok Android MobileAgent did not become idle before relationship check.',
        );
      }

      try {
        const opened =
          await agent
            .openTikTokProfileByUsername(
              target.username,
            );

        if (!opened) {
          throw new Error(
            `TikTok profile could not be opened on Android: ${target.username}`,
          );
        }

        const relationship =
          await agent
            .inspectTikTokCurrentRelationship();

        return {
          provider:
            'android',
          targetKey:
            target.targetKey,
          relationship,
          observedAt:
            new Date(),
          details: {
            readOnly:
              true,
            source:
              'mobile-agent-live',
            navigationPerformed:
              true,
            username:
              target.username,
            deviceId:
              agent.getStatus()
                .deviceId,
          },
        };
      }
      finally {
        try {
          await agent
            .goToTikTokHome();
        }
        catch {
          // Best-effort navigation recovery.
        }

        if (shouldResume) {
          agent.resume();
        }
      }
    },

    async follow(
      target,
    ) {
      return disabledAction(
        'FOLLOW',
        target,
      );
    },

    async unfollow(
      target,
    ) {
      return disabledAction(
        'UNFOLLOW',
        target,
      );
    },

    async like(
      target,
    ) {
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

    async visitProfile(
      target,
    ) {
      return disabledAction(
        'PROFILE_VISIT',
        target,
      );
    },
  });
}

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mobileAgentMocks =
  vi.hoisted(
    () => ({
      getTikTokAgent:
        vi.fn(),
    }),
  );

vi.mock(
  '../../src/actions/mobile/mobile-agent.js',
  () => ({
    MobileAgent: {
      getTikTokAgent:
        mobileAgentMocks
          .getTikTokAgent,
    },
  }),
);

import {
  createLiveAndroidTikTokProvider,
} from '../../src/tiktok/providers/live-android-tiktok-provider.js';

function createAgent() {
  let state:
    'running' |
    'paused' =
      'running';

  const pause =
    vi.fn(
      () => {
        state =
          'paused';
      },
    );

  const resume =
    vi.fn(
      () => {
        state =
          'running';
      },
    );

  const getStatus =
    vi.fn(
      () => ({
        id:
          'android-device-1:tiktok',
        app:
          'tiktok',
        deviceId:
          'android-device-1',
        state,
        currentAction:
          null,
      }),
    );

  const openTikTokProfileByUsername =
    vi.fn().mockResolvedValue(
      true,
    );

  const inspectTikTokCurrentRelationship =
    vi.fn().mockResolvedValue(
      'following',
    );

  const goToTikTokHome =
    vi.fn().mockResolvedValue(
      undefined,
    );

  return {
    agent: {
      pause,
      resume,
      getStatus,
      openTikTokProfileByUsername,
      inspectTikTokCurrentRelationship,
      goToTikTokHome,
    },
    pause,
    resume,
    getStatus,
    openTikTokProfileByUsername,
    inspectTikTokCurrentRelationship,
    goToTikTokHome,
  };
}

describe(
  'live Android TikTok provider',
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      },
    );

    it('pauses the running mobile agent, checks relationship, returns Home and resumes', async () => {
      const {
        agent,
        pause,
        resume,
        openTikTokProfileByUsername,
        inspectTikTokCurrentRelationship,
        goToTikTokHome,
      } =
        createAgent();

      mobileAgentMocks
        .getTikTokAgent
        .mockReturnValue(
          agent,
        );

      const provider =
        createLiveAndroidTikTokProvider();

      const observation =
        await provider
          .checkRelationship({
            targetKey:
              'username:tiktok',
            accountKey:
              'android-device-1:tiktok',
            username:
              'tiktok',
          });

      expect(
        mobileAgentMocks
          .getTikTokAgent,
      ).toHaveBeenCalledWith(
        'android-device-1:tiktok',
      );

      expect(
        pause,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        openTikTokProfileByUsername,
      ).toHaveBeenCalledWith(
        'tiktok',
      );

      expect(
        inspectTikTokCurrentRelationship,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        goToTikTokHome,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        resume,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        observation,
      ).toMatchObject({
        provider:
          'android',
        targetKey:
          'username:tiktok',
        relationship:
          'following',
        details: {
          readOnly:
            true,
          source:
            'mobile-agent-live',
          deviceId:
            'android-device-1',
        },
      });
    });

    it('does not resume an agent that was already paused', async () => {
      const {
        agent,
        pause,
        resume,
      } =
        createAgent();

      agent.pause();

      mobileAgentMocks
        .getTikTokAgent
        .mockReturnValue(
          agent,
        );

      const provider =
        createLiveAndroidTikTokProvider();

      await provider
        .checkRelationship({
          targetKey:
            'username:tiktok',
          username:
            'tiktok',
        });

      expect(
        pause,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        resume,
      ).not.toHaveBeenCalled();
    });

    it('fails cleanly when there is no active TikTok Android agent', async () => {
      mobileAgentMocks
        .getTikTokAgent
        .mockReturnValue(
          undefined,
        );

      const provider =
        createLiveAndroidTikTokProvider();

      await expect(
        provider
          .checkRelationship({
            targetKey:
              'username:tiktok',
            username:
              'tiktok',
          }),
      ).rejects.toThrow(
        'No active TikTok Android MobileAgent is available',
      );
    });

    it('keeps provider mutation methods disabled', async () => {
      const provider =
        createLiveAndroidTikTokProvider();

      const target = {
        targetKey:
          'username:tiktok',
        username:
          'tiktok',
      };

      await expect(
        provider.follow(
          target,
        ),
      ).rejects.toThrow(
        'FOLLOW is disabled',
      );

      await expect(
        provider.unfollow(
          target,
        ),
      ).rejects.toThrow(
        'UNFOLLOW is disabled',
      );
    });
  },
);

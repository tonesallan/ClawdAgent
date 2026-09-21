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
      listAgents:
        vi.fn(),
    }),
  );

vi.mock(
  '../../src/actions/mobile/mobile-agent.js',
  () => ({
    MobileAgent: {
      listAgents:
        mobileAgentMocks
          .listAgents,
    },
  }),
);

import {
  TikTokProviderRegistry,
} from '../../src/tiktok/provider-registry.js';

import {
  checkTikTokProviderRelationship,
  getTikTokProviderControlStatus,
} from '../../src/tiktok/provider-control-service.js';

import type {
  TikTokAutomationProvider,
} from '../../src/tiktok/providers/tiktok-provider.js';

function createAndroidProvider() {
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
          '2026-09-21T04:00:00.000Z',
        ),
      details: {
        readOnly:
          true,
        deviceId:
          'android-device-1',
      },
    });

  const follow =
    vi.fn();

  const unfollow =
    vi.fn();

  const provider:
    TikTokAutomationProvider = {
      name:
        'android',
      checkRelationship,
      follow,
      unfollow,
    };

  return {
    provider,
    checkRelationship,
    follow,
    unfollow,
  };
}

describe(
  'TikTok provider control service — Android only',
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mobileAgentMocks
          .listAgents
          .mockReturnValue([
            {
              id:
                'android-device-1:tiktok',
              app:
                'tiktok',
              deviceId:
                'android-device-1',
              state:
                'running',
              currentAction:
                null,
              stats: {
                likes:
                  0,
                comments:
                  0,
                follows:
                  0,
                scrolls:
                  0,
                shares:
                  0,
                retweets:
                  0,
                replies:
                  0,
                errors:
                  0,
                totalActions:
                  0,
                actionsThisHour:
                  0,
                lastActionAt:
                  null,
              },
              lastError:
                null,
              startedAt:
                '2026-09-21T04:00:00.000Z',
              lastAction:
                null,
              lastActionTime:
                null,
              nextActionTime:
                null,
              config: {
                testMode:
                  false,
              },
            },
          ]);
      },
    );

    it('reports registered Android provider and active mobile agent', () => {
      const registry =
        new TikTokProviderRegistry();

      const {
        provider,
      } = createAndroidProvider();

      registry.register(
        provider,
      );

      const status =
        getTikTokProviderControlStatus(
          registry,
        );

      expect(
        status.registeredProviders,
      ).toEqual([
        'android',
      ]);

      expect(
        status.providers,
      ).toEqual([
        expect.objectContaining({
          name:
            'android',
          label:
            'Android / Appium',
          mode:
            'read-only-core',
        }),
      ]);

      expect(
        status.mobileProvider,
      ).toEqual({
        registered:
          true,
        active:
          true,
        agentCount:
          1,
        activeAgentCount:
          1,
        mode:
          'android-appium',
      });

      expect(
        status.mobileAgents,
      ).toEqual([
        expect.objectContaining({
          id:
            'android-device-1:tiktok',
          deviceId:
            'android-device-1',
          state:
            'running',
          testMode:
            false,
        }),
      ]);

      expect(
        JSON.stringify(
          status,
        ),
      ).not.toContain(
        'cookie',
      );

      expect(
        JSON.stringify(
          status,
        ),
      ).not.toContain(
        'browser',
      );
    });

    it('runs only the registered Android relationship check', async () => {
      const registry =
        new TikTokProviderRegistry();

      const {
        provider,
        checkRelationship,
        follow,
        unfollow,
      } = createAndroidProvider();

      registry.register(
        provider,
      );

      const observation =
        await checkTikTokProviderRelationship(
          {
            provider:
              'android',
            accountKey:
              ' android-device-1:tiktok ',
            username:
              ' @TikTok ',
          },
          registry,
        );

      expect(
        checkRelationship,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        checkRelationship,
      ).toHaveBeenCalledWith({
        targetKey:
          'username:tiktok',
        accountKey:
          'android-device-1:tiktok',
        username:
          'TikTok',
      });

      expect(
        follow,
      ).not.toHaveBeenCalled();

      expect(
        unfollow,
      ).not.toHaveBeenCalled();

      expect(
        observation.provider,
      ).toBe(
        'android',
      );
    });

    it('allows Android relationship check without accountKey when one agent can be resolved', async () => {
      const registry =
        new TikTokProviderRegistry();

      const {
        provider,
        checkRelationship,
      } = createAndroidProvider();

      registry.register(
        provider,
      );

      await checkTikTokProviderRelationship(
        {
          provider:
            'android',
          username:
            'tiktok',
        },
        registry,
      );

      expect(
        checkRelationship,
      ).toHaveBeenCalledWith({
        targetKey:
          'username:tiktok',
        accountKey:
          undefined,
        username:
          'tiktok',
      });
    });

    it('rejects providers that are not registered', async () => {
      const registry =
        new TikTokProviderRegistry();

      await expect(
        checkTikTokProviderRelationship(
          {
            provider:
              'android',
            username:
              'tiktok',
          },
          registry,
        ),
      ).rejects.toThrow(
        'TikTok provider is not registered: android',
      );
    });
  },
);

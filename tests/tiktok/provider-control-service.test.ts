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
  checkTikTokProviderRelationship,
  getTikTokProviderControlStatus,
} from '../../src/tiktok/provider-control-service.js';

import type {
  TikTokAutomationProvider,
} from '../../src/tiktok/providers/tiktok-provider.js';

function createWebProvider() {
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
          '2026-09-20T22:00:00.000Z',
        ),
      details: {
        targetUsername:
          'TikTok',
      },
    });

  const follow =
    vi.fn();

  const unfollow =
    vi.fn();

  const provider:
    TikTokAutomationProvider = {
      name:
        'web',
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
  'TikTok provider control service',
  () => {
    it('reports registered Web provider capabilities without exposing cookies', () => {
      const registry =
        new TikTokProviderRegistry();

      const {
        provider,
      } = createWebProvider();

      registry.register(
        provider,
      );

      const accountManager = {
        listAccounts:
          vi.fn().mockReturnValue([
            {
              id:
                'web-account-1',
              name:
                'TikTok Web Local',
              handle:
                'monkey.promo',
              status:
                'active',
              lastVerified:
                '2026-09-20T22:00:00.000Z',
              cookies: [
                {
                  name:
                    'sessionid',
                  value:
                    'secret-value-must-not-leak',
                },
              ],
            },
          ]),
      };

      const status =
        getTikTokProviderControlStatus(
          registry,
          accountManager as any,
        );

      expect(
        status.registeredProviders,
      ).toEqual([
        'web',
      ]);

      expect(
        status.providers,
      ).toEqual([
        expect.objectContaining({
          name:
            'web',
          label:
            'Web / Playwright',
          mode:
            'read-only-core',
          capabilities: {
            checkRelationship:
              true,
            follow:
              false,
            unfollow:
              false,
            like:
              false,
            comment:
              false,
            dm:
              false,
          },
        }),
      ]);

      expect(
        status.browserProvider,
      ).toEqual({
        registered:
          true,
        persistentProfiles:
          true,
        sessionReuse:
          true,
        challengePolicy:
          'unknown-retry',
      });

      expect(
        status.accounts,
      ).toEqual([
        {
          id:
            'web-account-1',
          name:
            'TikTok Web Local',
          handle:
            'monkey.promo',
          status:
            'active',
          lastVerified:
            '2026-09-20T22:00:00.000Z',
        },
      ]);

      expect(
        'cookies' in
          status.accounts[0],
      ).toBe(
        false,
      );

      expect(
        JSON.stringify(
          status,
        ),
      ).not.toContain(
        'secret-value-must-not-leak',
      );
    });

    it('runs only the registered provider relationship check', async () => {
      const registry =
        new TikTokProviderRegistry();

      const {
        provider,
        checkRelationship,
        follow,
        unfollow,
      } = createWebProvider();

      registry.register(
        provider,
      );

      const observation =
        await checkTikTokProviderRelationship(
          {
            provider:
              'web',
            accountId:
              ' web-account-1 ',
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
          'web-account-1',
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
        observation.relationship,
      ).toBe(
        'not_following',
      );
    });

    it('rejects providers that are not registered', async () => {
      const registry =
        new TikTokProviderRegistry();

      await expect(
        checkTikTokProviderRelationship(
          {
            provider:
              'web',
            accountId:
              'web-account-1',
            username:
              'tiktok',
          },
          registry,
        ),
      ).rejects.toThrow(
        'TikTok provider is not registered: web',
      );
    });

    it('requires accountId for the Web provider', async () => {
      const registry =
        new TikTokProviderRegistry();

      const {
        provider,
        checkRelationship,
      } = createWebProvider();

      registry.register(
        provider,
      );

      await expect(
        checkTikTokProviderRelationship(
          {
            provider:
              'web',
            username:
              'tiktok',
          },
          registry,
        ),
      ).rejects.toThrow(
        'accountId is required for the Web provider',
      );

      expect(
        checkRelationship,
      ).not.toHaveBeenCalled();
    });
  },
);

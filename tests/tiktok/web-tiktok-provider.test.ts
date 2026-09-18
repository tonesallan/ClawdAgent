import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  BrowserSessionManager,
} from '../../src/actions/browser/session-manager.js';

import type {
  TikTokAccountManager,
} from '../../src/actions/browser/tiktok-manager.js';

import {
  classifyWebTikTokRelationship,
  WebTikTokProvider,
} from '../../src/tiktok/providers/web-tiktok-provider.js';

function createPage(
  options: {
    challenge?: boolean;
    followButtonCount?: number;
    followText?: string;
    followAriaLabel?: string | null;
  } = {},
) {
  let currentUrl =
    'https://www.tiktok.com/foryou';

  const button = {
    innerText:
      vi.fn().mockResolvedValue(
        options.followText ??
        'Follow',
      ),
    getAttribute:
      vi.fn().mockResolvedValue(
        options.followAriaLabel ??
        'Follow TikTok',
      ),
  };

  const emptyLocator = {
    count:
      vi.fn().mockResolvedValue(
        0,
      ),
    nth:
      vi.fn().mockReturnValue({
        isVisible:
          vi.fn().mockResolvedValue(
            false,
          ),
      }),
  };

  const challengeLocator = {
    count:
      vi.fn().mockResolvedValue(
        options.challenge
          ? 1
          : 0,
      ),
    nth:
      vi.fn().mockReturnValue({
        isVisible:
          vi.fn().mockResolvedValue(
            true,
          ),
      }),
  };

  const followLocator = {
    count:
      vi.fn().mockResolvedValue(
        options.followButtonCount ??
        1,
      ),
    first:
      vi.fn().mockReturnValue(
        button,
      ),
  };

  const page = {
    goto:
      vi.fn().mockImplementation(
        async (
          url: string,
        ) => {
          currentUrl =
            url ===
              'https://www.tiktok.com/profile'
              ? 'https://www.tiktok.com/@monkey.promo'
              : url;
        },
      ),
    waitForTimeout:
      vi.fn().mockResolvedValue(
        undefined,
      ),
    evaluate:
      vi.fn().mockResolvedValue(
        false,
      ),
    url:
      vi.fn().mockImplementation(
        () =>
          currentUrl,
      ),
    locator:
      vi.fn().mockImplementation(
        (
          selector: string,
        ) => {
          if (
            selector ===
            '[data-e2e="follow-button"]:visible'
          ) {
            return followLocator;
          }

          if (
            selector ===
              '.secsdk-captcha-drag-icon' &&
            options.challenge
          ) {
            return challengeLocator;
          }

          return emptyLocator;
        },
      ),
  };

  return {
    page,
    button,
  };
}

function createProvider(
  page: ReturnType<
    typeof createPage
  >['page'],
) {
  const account = {
    id:
      'web-account-1',
    name:
      'TikTok Web Local',
    handle:
      'monkey.promo',
    cookies:
      [],
    cookieFormat:
      'json' as const,
    status:
      'active' as const,
    createdAt:
      '2026-09-18T00:00:00.000Z',
    updatedAt:
      '2026-09-18T00:00:00.000Z',
  };

  const accountManager = {
    listAccounts:
      vi.fn().mockReturnValue([
        account,
      ]),
    launchSession:
      vi.fn().mockResolvedValue({
        sessionId:
          'web-session-1',
        url:
          'https://www.tiktok.com/foryou',
      }),
  } as unknown as TikTokAccountManager;

  const closeSession =
    vi.fn().mockResolvedValue(
      undefined,
    );

  const browserManager = {
    getPage:
      vi.fn().mockReturnValue(
        page,
      ),
    closeSession,
  } as unknown as BrowserSessionManager;

  const provider =
    new WebTikTokProvider({
      accountManager,
      browserManager,
      mobileDeviceName:
        'Pixel 5',
      navigationWaitMs:
        0,
    });

  return {
    provider,
    accountManager,
    browserManager,
    closeSession,
  };
}

describe(
  'Web TikTok relationship classifier',
  () => {
    it.each([
      [
        {
          text:
            'Follow',
          ariaLabel:
            'Follow TikTok',
        },
        'not_following',
      ],
      [
        {
          text:
            'Following',
          ariaLabel:
            'Following TikTok',
        },
        'following',
      ],
      [
        {
          text:
            'Friends',
          ariaLabel:
            'Friends',
        },
        'friends',
      ],
      [
        {
          text:
            'Follow back',
          ariaLabel:
            'Follow back TikTok',
        },
        'follows_us',
      ],
      [
        {
          text:
            'Unknown state',
          ariaLabel:
            null,
        },
        'unknown',
      ],
    ])(
      'classifies %j as %s',
      (
        control,
        expected,
      ) => {
        expect(
          classifyWebTikTokRelationship(
            control,
          ),
        ).toBe(
          expected,
        );
      },
    );
  },
);

describe(
  'WebTikTokProvider read-only safety',
  () => {
    it('observes one exact mobile Follow control as not_following', async () => {
      const {
        page,
      } = createPage();

      const {
        provider,
        closeSession,
      } = createProvider(
        page,
      );

      const observation =
        await provider
          .checkRelationship({
            targetKey:
              'username:tiktok',
            accountKey:
              'default',
            username:
              'tiktok',
            displayName:
              'TikTok',
          });

      expect(
        observation,
      ).toMatchObject({
        provider:
          'web',
        targetKey:
          'username:tiktok',
        relationship:
          'not_following',
        details: {
          ownHandle:
            'monkey.promo',
          targetUsername:
            'tiktok',
          mobileDevice:
            'Pixel 5',
          visibleFollowButtonCount:
            1,
          relationshipControl: {
            dataE2e:
              'follow-button',
            text:
              'Follow',
            ariaLabel:
              'Follow TikTok',
          },
        },
      });

      expect(
        closeSession,
      ).toHaveBeenCalledWith(
        'web-session-1',
      );
    });

    it('returns unknown when TikTok presents a challenge', async () => {
      const {
        page,
      } = createPage({
        challenge:
          true,
      });

      const {
        provider,
        closeSession,
      } = createProvider(
        page,
      );

      const observation =
        await provider
          .checkRelationship({
            targetKey:
              'username:tiktok',
            accountKey:
              'default',
            username:
              'tiktok',
          });

      expect(
        observation,
      ).toMatchObject({
        provider:
          'web',
        relationship:
          'unknown',
        details: {
          reason:
            'tiktok_challenge',
          stage:
            'session_start',
        },
      });

      expect(
        closeSession,
      ).toHaveBeenCalledWith(
        'web-session-1',
      );
    });

    it('keeps multiple visible relationship controls unknown', async () => {
      const {
        page,
      } = createPage({
        followButtonCount:
          2,
      });

      const {
        provider,
      } = createProvider(
        page,
      );

      const observation =
        await provider
          .checkRelationship({
            targetKey:
              'username:tiktok',
            accountKey:
              'default',
            username:
              'tiktok',
          });

      expect(
        observation,
      ).toMatchObject({
        relationship:
          'unknown',
        details: {
          reason:
            'ambiguous_relationship_control',
          visibleFollowButtonCount:
            2,
        },
      });
    });

    it('blocks Web follow and unfollow mutations', async () => {
      const {
        page,
      } = createPage();

      const {
        provider,
      } = createProvider(
        page,
      );

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
        'Web TikTok provider is read-only and does not implement FOLLOW.',
      );

      await expect(
        provider.unfollow(
          target,
        ),
      ).rejects.toThrow(
        'Web TikTok provider is read-only and does not implement UNFOLLOW.',
      );
    });
  },
);

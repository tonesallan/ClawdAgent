import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const followRegistrationMocks =
  vi.hoisted(
    () => ({
      registerConfirmedWebFollow:
        vi.fn(),
    }),
  );

vi.mock(
  '../../src/tiktok/web-follow-registration.js',
  () => ({
    registerConfirmedWebFollow:
      followRegistrationMocks
        .registerConfirmedWebFollow,

    normalizeTikTokUsername:
      (
        value: string,
      ) =>
        value
          .trim()
          .replace(
            /^@/,
            '',
          ),
  }),
);

vi.mock(
  '../../src/core/ai-client.js',
  () => ({
    AIClient:
      class {
        async chat() {
          return {
            content:
              '',
          };
        }
      },
  }),
);

import {
  TikTokAgent,
  type TikTokAgentConfig,
} from '../../src/actions/browser/tiktok-agent.js';

function createConfig(
  accountId: string,
  targetAccounts:
    string[] = [
      'tiktok',
    ],
): TikTokAgentConfig {

  return {
    accountId,
    actions: [
      'follow',
    ],
    schedule: {
      like: {
        intervalMinutes:
          15,
        dailyLimit:
          30,
      },
      comment: {
        intervalMinutes:
          60,
        dailyLimit:
          5,
      },
      follow: {
        intervalMinutes:
          30,
        dailyLimit:
          10,
      },
      save: {
        intervalMinutes:
          20,
        dailyLimit:
          20,
      },
    },
    activeHours: {
      weekday: {
        start:
          0,
        end:
          24,
      },
      weekend: {
        start:
          0,
        end:
          24,
      },
    },
    content: {
      tone:
        'test',
      language:
        'English',
      topics: [
        'test',
      ],
      hashtags:
        [],
      targetAccounts,
      maxLength:
        100,
    },
    safety: {
      minDelaySeconds:
        1,
      maxActionsPerHour:
        5,
      pauseOnErrorCount:
        2,
      pauseDurationMinutes:
        1,
    },
    testMode:
      false,
  };
}

function createFollowButton(
  options: {
    confirmAfterClick:
      boolean;
  },
) {
  let followed =
    false;

  const click =
    vi.fn().mockImplementation(
      async () => {
        if (
          options.confirmAfterClick
        ) {
          followed =
            true;
        }
      },
    );

  return {
    click,
    innerText:
      vi.fn().mockImplementation(
        async () =>
          followed
            ? 'Following'
            : 'Follow',
      ),
    getAttribute:
      vi.fn().mockImplementation(
        async (
          name: string,
        ) => {
          if (
            name !==
              'aria-label'
          ) {
            return null;
          }

          return followed
            ? 'Following TikTok'
            : 'Follow TikTok';
        },
      ),
    evaluate:
      vi.fn().mockResolvedValue(
        '',
      ),
  };
}

function createPage(
  button:
    ReturnType<
      typeof createFollowButton
    >,
) {
  return {
    goto:
      vi.fn().mockResolvedValue(
        undefined,
      ),
    evaluate:
      vi.fn().mockResolvedValue(
        undefined,
      ),
    $$:
      vi.fn().mockResolvedValue([
        button,
      ]),
    $:
      vi.fn().mockImplementation(
        async (
          selector: string,
        ) => {
          if (
            selector ===
            '[data-e2e="follow-button"]'
          ) {
            return button;
          }

          return null;
        },
      ),
  };
}

afterEach(
  () => {
    vi.restoreAllMocks();
    followRegistrationMocks
      .registerConfirmedWebFollow
      .mockReset();
  },
);

describe(
  'legacy TikTokAgent confirmed Web follow integration',
  () => {
    it('persists a confirmed Follow through the common relationship core', async () => {
      const accountId =
        'agent-follow-confirmed';

      const agent =
        TikTokAgent.createAgent(
          createConfig(
            accountId,
          ),
        );

      const button =
        createFollowButton({
          confirmAfterClick:
            true,
        });

      const page =
        createPage(
          button,
        );

      (
        agent as any
      ).randomDelay =
        vi.fn().mockResolvedValue(
          undefined,
        );

      followRegistrationMocks
        .registerConfirmedWebFollow
        .mockResolvedValue({
          relationship: {},
          checkAction: {},
        });

      vi.spyOn(
        Math,
        'random',
      ).mockReturnValue(
        0,
      );

      await (
        agent as any
      ).executeFollow(
        page,
      );

      expect(
        button.click,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        followRegistrationMocks
          .registerConfirmedWebFollow,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        followRegistrationMocks
          .registerConfirmedWebFollow,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          accountKey:
            accountId,
          username:
            'tiktok',
          observedRelationship:
            'following',
          followedAt:
            expect.any(
              Date,
            ),
        }),
      );

      TikTokAgent.removeAgent(
        accountId,
      );
    });

    it('does not persist a Follow when the post-click relationship is not confirmed', async () => {
      const accountId =
        'agent-follow-unconfirmed';

      const agent =
        TikTokAgent.createAgent(
          createConfig(
            accountId,
          ),
        );

      const button =
        createFollowButton({
          confirmAfterClick:
            false,
        });

      const page =
        createPage(
          button,
        );

      (
        agent as any
      ).randomDelay =
        vi.fn().mockResolvedValue(
          undefined,
        );

      vi.spyOn(
        Math,
        'random',
      ).mockReturnValue(
        0,
      );

      await expect(
        (
          agent as any
        ).executeFollow(
          page,
        ),
      ).rejects.toThrow(
        'Follow click was not confirmed',
      );

      expect(
        followRegistrationMocks
          .registerConfirmedWebFollow,
      ).not.toHaveBeenCalled();

      TikTokAgent.removeAgent(
        accountId,
      );
    });

    it('does not click Follow when no exact username can be resolved', async () => {
      const accountId =
        'agent-follow-no-username';

      const agent =
        TikTokAgent.createAgent(
          createConfig(
            accountId,
            [],
          ),
        );

      const button =
        createFollowButton({
          confirmAfterClick:
            true,
        });

      const page =
        createPage(
          button,
        );

      page.$ =
        vi.fn().mockResolvedValue(
          null,
        );

      (
        agent as any
      ).randomDelay =
        vi.fn().mockResolvedValue(
          undefined,
        );

      vi.spyOn(
        Math,
        'random',
      ).mockReturnValue(
        0,
      );

      await (
        agent as any
      ).executeFollow(
        page,
      );

      expect(
        button.click,
      ).not.toHaveBeenCalled();

      expect(
        followRegistrationMocks
          .registerConfirmedWebFollow,
      ).not.toHaveBeenCalled();

      TikTokAgent.removeAgent(
        accountId,
      );
    });
  },
);

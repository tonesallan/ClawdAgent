import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  isConfirmedWebFollowRelationship,
  normalizeTikTokUsername,
  registerConfirmedWebFollow,
} from '../../src/tiktok/web-follow-registration.js';

describe(
  'confirmed Web follow registration',
  () => {
    it('normalizes TikTok usernames', () => {
      expect(
        normalizeTikTokUsername(
          '  @TikTok  ',
        ),
      ).toBe(
        'TikTok',
      );
    });

    it.each([
      [
        'following',
        true,
      ],
      [
        'friends',
        true,
      ],
      [
        'follows_us',
        false,
      ],
      [
        'not_following',
        false,
      ],
      [
        'unknown',
        false,
      ],
    ] as const)(
      'accepts relationship=%s as confirmed=%s',
      (
        relationship,
        expected,
      ) => {
        expect(
          isConfirmedWebFollowRelationship(
            relationship,
          ),
        ).toBe(
          expected,
        );
      },
    );

    it('registers a confirmed Web follow with the common relationship manager contract', async () => {
      const registerFollow =
        vi.fn().mockResolvedValue({
          relationship: {
            targetKey:
              'username:tiktok',
          },
          checkAction: {
            type:
              'CHECK_FOLLOW_BACK',
            provider:
              'web',
          },
        });

      const followedAt =
        new Date(
          '2026-09-19T02:30:00.000Z',
        );

      await registerConfirmedWebFollow(
        {
          accountKey:
            'web-account-1',
          username:
            '@TikTok',
          displayName:
            'TikTok',
          observedRelationship:
            'following',
          followedAt,
        },
        {
          registerFollow,
        },
      );

      expect(
        registerFollow,
      ).toHaveBeenCalledWith({
        accountKey:
          'web-account-1',
        targetKey:
          'username:tiktok',
        username:
          'TikTok',
        displayName:
          'TikTok',
        provider:
          'web',
        followedAt,
      });
    });

    it('rejects unconfirmed relationship states before persistence', async () => {
      const registerFollow =
        vi.fn();

      await expect(
        registerConfirmedWebFollow(
          {
            accountKey:
              'web-account-1',
            username:
              'tiktok',
            observedRelationship:
              'not_following',
          },
          {
            registerFollow,
          },
        ),
      ).rejects.toThrow(
        'Web follow is not confirmed',
      );

      expect(
        registerFollow,
      ).not.toHaveBeenCalled();
    });

    it('requires an exact username before persistence', async () => {
      const registerFollow =
        vi.fn();

      await expect(
        registerConfirmedWebFollow(
          {
            accountKey:
              'web-account-1',
            username:
              '   @   ',
            observedRelationship:
              'following',
          },
          {
            registerFollow,
          },
        ),
      ).rejects.toThrow(
        'requires an exact TikTok username',
      );

      expect(
        registerFollow,
      ).not.toHaveBeenCalled();
    });
  },
);

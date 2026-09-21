import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  isConfirmedAndroidFollowRelationship,
  normalizeAndroidTikTokUsername,
  registerConfirmedAndroidFollow,
} from '../../src/tiktok/android-follow-registration.js';

describe(
  'Android confirmed follow registration',
  () => {
    it('normalizes TikTok username', () => {
      expect(
        normalizeAndroidTikTokUsername(
          ' @TikTok ',
        ),
      ).toBe(
        'TikTok',
      );
    });

    it('accepts only following or friends as confirmed states', () => {
      expect(
        isConfirmedAndroidFollowRelationship(
          'following',
        ),
      ).toBe(
        true,
      );

      expect(
        isConfirmedAndroidFollowRelationship(
          'friends',
        ),
      ).toBe(
        true,
      );

      expect(
        isConfirmedAndroidFollowRelationship(
          'not_following',
        ),
      ).toBe(
        false,
      );

      expect(
        isConfirmedAndroidFollowRelationship(
          'follows_us',
        ),
      ).toBe(
        false,
      );

      expect(
        isConfirmedAndroidFollowRelationship(
          'unknown',
        ),
      ).toBe(
        false,
      );
    });

    it('registers confirmed Android follow through the common relationship manager', async () => {
      const followedAt =
        new Date(
          '2026-09-21T04:30:00.000Z',
        );

      const registerFollow =
        vi.fn().mockResolvedValue({
          relationship: {
            id:
              'relationship-1',
          },
          checkAction: {
            id:
              'check-1',
          },
        });

      await registerConfirmedAndroidFollow(
        {
          accountKey:
            'android-device-1:tiktok',
          username:
            '@TikTok',
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
          'android-device-1:tiktok',
        targetKey:
          'username:tiktok',
        username:
          'TikTok',
        displayName:
          null,
        provider:
          'android',
        followedAt,
      });
    });

    it('refuses to persist an unconfirmed Android follow', async () => {
      const registerFollow =
        vi.fn();

      await expect(
        registerConfirmedAndroidFollow(
          {
            accountKey:
              'android-device-1:tiktok',
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
        'Android follow is not confirmed',
      );

      expect(
        registerFollow,
      ).not.toHaveBeenCalled();
    });
  },
);

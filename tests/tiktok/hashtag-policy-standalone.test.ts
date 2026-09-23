import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  evaluateTikTokHashtags,
  normalizeTikTokHashtagConfiguration,
} from '../../src/tiktok/hashtag-policy.js';

describe(
  'standalone hashtag matching modes',
  () => {
    it(
      'accepts any configured include hashtag in ANY mode',
      () => {
        const configuration =
          normalizeTikTokHashtagConfiguration({
            enabled: true,
            include: [
              'ofertas',
              'tecnologia',
            ],
            exclude: [],
            matchMode: 'any',
            maxCandidatesPerCycle: 20,
          });

        expect(
          evaluateTikTokHashtags(
            [
              'tecnologia',
            ],
            configuration,
          ).accepted,
        ).toBe(true);
      },
    );

    it(
      'requires every include hashtag in ALL mode',
      () => {
        const configuration =
          normalizeTikTokHashtagConfiguration({
            enabled: true,
            include: [
              'ofertas',
              'tecnologia',
            ],
            exclude: [],
            matchMode: 'all',
            maxCandidatesPerCycle: 20,
          });

        expect(
          evaluateTikTokHashtags(
            [
              'ofertas',
            ],
            configuration,
          ).accepted,
        ).toBe(false);

        expect(
          evaluateTikTokHashtags(
            [
              'ofertas',
              'tecnologia',
            ],
            configuration,
          ).accepted,
        ).toBe(true);
      },
    );

    it(
      'always rejects excluded hashtags',
      () => {
        const configuration =
          normalizeTikTokHashtagConfiguration({
            enabled: true,
            include: [
              'ofertas',
            ],
            exclude: [
              'bloqueado',
            ],
            matchMode: 'any',
            maxCandidatesPerCycle: 20,
          });

        expect(
          evaluateTikTokHashtags(
            [
              'ofertas',
              'bloqueado',
            ],
            configuration,
          ).accepted,
        ).toBe(false);
      },
    );
  },
);

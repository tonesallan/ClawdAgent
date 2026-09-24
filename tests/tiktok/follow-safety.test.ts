import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import {
  tmpdir,
} from 'node:os';
import {
  join,
} from 'node:path';

import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  detectTikTokFollowRestriction,
  TikTokFollowSafetyStore,
  type TikTokFollowSafetyConfig,
} from '../../src/tiktok/follow-safety.js';

const config: TikTokFollowSafetyConfig = {
  enabled: true,
  maxPerHour: 2,
  maxPer24Hours: 4,
  maxPerSession: 3,
  minIntervalMinutes: 5,
  restrictionCooldownHours: 24,
  stopOnRestriction: true,
  silentFailureThreshold: 2,
};

const tempDirs: string[] = [];

async function makeStore(): Promise<TikTokFollowSafetyStore> {
  const dir = await mkdtemp(
    join(
      tmpdir(),
      'tiktok-follow-safety-',
    ),
  );

  tempDirs.push(
    dir,
  );

  const store =
    new TikTokFollowSafetyStore(
      join(
        dir,
        'state.json',
      ),
    );

  await store.load();

  return store;
}

afterEach(
  async () => {
    await Promise.all(
      tempDirs
        .splice(
          0,
        )
        .map(
          dir =>
            rm(
              dir,
              {
                recursive:
                  true,
                force:
                  true,
              },
            ),
        ),
    );
  },
);

describe(
  'TikTok follow safety',
  () => {
    it(
      'detects official-style too-fast and retry-later restriction text',
      () => {
        expect(
          detectTikTokFollowRestriction(
            '<node text="You are following too fast. Try again later." />',
          ),
        ).toContain(
          'restriction signal',
        );

        expect(
          detectTikTokFollowRestriction(
            '<node text="Você está seguindo muito rápido. Tente novamente mais tarde." />',
          ),
        ).toContain(
          'restriction signal',
        );
      },
    );

    it(
      'enforces minimum interval and hourly count on confirmed follows',
      async () => {
        const store =
          await makeStore();

        await store
          .recordConfirmedFollow(
            'user_a',
          );

        const afterOne =
          store.snapshot(
            config,
            new Date(
              Date.now() -
                10_000,
            ).toISOString(),
          );

        expect(
          afterOne.allowed,
        ).toBe(false);

        expect(
          afterOne.blockedReason,
        ).toContain(
          'minimum follow interval',
        );

        expect(
          afterOne.followsLastHour,
        ).toBe(1);
      },
    );

    it(
      'activates a cooldown after repeated unconfirmed follow attempts',
      async () => {
        const store =
          await makeStore();

        const first =
          await store
            .recordUnconfirmedAttempt(
              config,
              'not confirmed',
            );

        const second =
          await store
            .recordUnconfirmedAttempt(
              config,
              'not confirmed',
            );

        expect(first).toBe(false);
        expect(second).toBe(true);

        const snapshot =
          store.snapshot(
            config,
            new Date()
              .toISOString(),
          );

        expect(
          snapshot.allowed,
        ).toBe(false);

        expect(
          snapshot.restrictedUntil,
        ).not.toBeNull();

        expect(
          snapshot.restrictionReason,
        ).toContain(
          'Repeated unconfirmed follows',
        );
      },
    );

    it(
      'persists manual restriction and can clear it',
      async () => {
        const store =
          await makeStore();

        await store
          .recordExplicitRestriction(
            'manual restriction',
            24,
          );

        expect(
          store.snapshot(
            config,
            null,
          ).restrictedUntil,
        ).not.toBeNull();

        await store
          .clearRestriction();

        expect(
          store.snapshot(
            config,
            null,
          ).restrictedUntil,
        ).toBeNull();
      },
    );
  },
);

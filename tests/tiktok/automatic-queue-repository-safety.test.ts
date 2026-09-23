import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const dbMocks =
  vi.hoisted(() => ({
    getDb:
      vi.fn(),
  }));

vi.mock(
  '../../src/memory/database.js',
  () => dbMocks,
);

import {
  claimDueTikTokScheduledAction,
  deferDueTikTokScheduledAction,
  recoverStaleTikTokRunningActions,
} from '../../src/memory/repositories/tiktok-actions.js';

function createSelectChain(
  rows: unknown[],
) {
  return {
    from:
      vi.fn(() => ({
        where:
          vi.fn(() => ({
            limit:
              vi.fn(
                async () => rows,
              ),
          })),
      })),
  };
}

function createMutationHarness(
  current: Record<string, unknown>,
  updatedRow: Record<string, unknown>,
) {
  const returning =
    vi.fn(
      async () => [
        updatedRow,
      ],
    );

  const where =
    vi.fn(() => ({
      returning,
    }));

  const set =
    vi.fn(() => ({
      where,
    }));

  const update =
    vi.fn(() => ({
      set,
    }));

  const historyValues =
    vi.fn(
      async () => undefined,
    );

  const insert =
    vi.fn(() => ({
      values:
        historyValues,
    }));

  const tx = {
    select:
      vi.fn(
        () =>
          createSelectChain([
            current,
          ]),
      ),
    update,
    insert,
  };

  const db = {
    transaction:
      vi.fn(
        async (
          callback:
            (tx: any) =>
              Promise<unknown>,
        ) =>
          callback(tx),
      ),
  };

  dbMocks
    .getDb
    .mockReturnValue(
      db,
    );

  return {
    tx,
    update,
    set,
    historyValues,
    updatedRow,
  };
}

describe(
  'TikTok automatic queue repository safety',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each([
      'UNFOLLOW',
      'DISCOVERY_REVIEW',
    ] as const)(
      'refuses to claim legacy scheduled %s through the automatic queue',
      async type => {
        const tx = {
          select:
            vi.fn(
              () =>
                createSelectChain([
                  {
                    type,
                    attempts: 0,
                  },
                ]),
            ),
          update:
            vi.fn(),
        };

        const db = {
          transaction:
            vi.fn(
              async (
                callback:
                  (tx: any) =>
                    Promise<unknown>,
              ) =>
                callback(tx),
            ),
        };

        dbMocks
          .getDb
          .mockReturnValue(
            db,
          );

        await expect(
          claimDueTikTokScheduledAction(
            'legacy-manual-action',
            new Date(
              '2026-09-17T20:00:00.000Z',
            ),
          ),
        ).rejects.toThrow(
          'Only CHECK_FOLLOW_BACK may be claimed by the automatic TikTok scheduler.',
        );

        expect(
          tx.update,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      'UNFOLLOW',
      'DISCOVERY_REVIEW',
    ] as const)(
      'refuses to defer legacy scheduled %s through the automatic queue',
      async type => {
        const tx = {
          select:
            vi.fn(
              () =>
                createSelectChain([
                  {
                    type,
                  },
                ]),
            ),
          update:
            vi.fn(),
        };

        const db = {
          transaction:
            vi.fn(
              async (
                callback:
                  (tx: any) =>
                    Promise<unknown>,
              ) =>
                callback(tx),
            ),
        };

        dbMocks
          .getDb
          .mockReturnValue(
            db,
          );

        await expect(
          deferDueTikTokScheduledAction(
            'legacy-manual-action',
            new Date(
              '2026-09-17T20:00:00.000Z',
            ),
            new Date(
              '2026-09-17T20:05:00.000Z',
            ),
          ),
        ).rejects.toThrow(
          'Only CHECK_FOLLOW_BACK may be deferred by the automatic TikTok scheduler.',
        );

        expect(
          tx.update,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      'UNFOLLOW',
      'DISCOVERY_REVIEW',
    ] as const)(
      'refuses to recover stale %s through the automatic queue',
      async type => {
        await expect(
          recoverStaleTikTokRunningActions(
            type,
            new Date(
              '2026-09-17T20:00:00.000Z',
            ),
          ),
        ).rejects.toThrow(
          'Only CHECK_FOLLOW_BACK may be recovered by the automatic TikTok scheduler.',
        );

        expect(
          dbMocks.getDb,
        ).not.toHaveBeenCalled();
      },
    );

    it('still allows CHECK_FOLLOW_BACK to be claimed atomically', async () => {
      const now =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const updatedRow = {
        id:
          'check-1',
        type:
          'CHECK_FOLLOW_BACK',
        status:
          'running',
        attempts:
          1,
        provider:
          'android',
      };

      const {
        set,
        historyValues,
      } =
        createMutationHarness(
          {
            type:
              'CHECK_FOLLOW_BACK',
            attempts:
              0,
          },
          updatedRow,
        );

      const result =
        await claimDueTikTokScheduledAction(
          'check-1',
          now,
        );

      expect(result).toBe(
        updatedRow,
      );

      expect(
        set,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status:
            'running',
          attempts:
            1,
          error:
            null,
          updatedAt:
            now,
        }),
      );

      expect(
        historyValues,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId:
            'check-1',
          status:
            'running',
          provider:
            'android',
        }),
      );
    });

    it('still allows CHECK_FOLLOW_BACK policy deferral', async () => {
      const dueAt =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const retryAt =
        new Date(
          '2026-09-17T20:05:00.000Z',
        );

      const updatedRow = {
        id:
          'check-1',
        type:
          'CHECK_FOLLOW_BACK',
        status:
          'scheduled',
        provider:
          'android',
      };

      const {
        set,
        historyValues,
      } =
        createMutationHarness(
          {
            type:
              'CHECK_FOLLOW_BACK',
          },
          updatedRow,
        );

      const result =
        await deferDueTikTokScheduledAction(
          'check-1',
          dueAt,
          retryAt,
          {
            reason:
              'policy_deferred',
          },
        );

      expect(result).toBe(
        updatedRow,
      );

      expect(
        set,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status:
            'scheduled',
          executeAt:
            retryAt,
          error:
            null,
          updatedAt:
            dueAt,
        }),
      );

      expect(
        historyValues,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId:
            'check-1',
          status:
            'scheduled',
          provider:
            'android',
          metadata:
            expect.objectContaining({
              reason:
                'policy_deferred',
              event:
                'deferred',
            }),
        }),
      );
    });
  },
);

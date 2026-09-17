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
  createTikTokAction,
  createOrReuseOpenTikTokAction,
  rescheduleTikTokAction,
  transitionTikTokAction,
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

describe(
  'TikTok repository UNFOLLOW safety',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('rejects direct UNFOLLOW creation unless it is a pending manual review', async () => {
      await expect(
        createTikTokAction({
          accountKey:
            'default',
          type:
            'UNFOLLOW',
          targetKey:
            'username:tiktok',
          status:
            'scheduled',
          executeAt:
            new Date(
              '2026-09-18T20:00:00.000Z',
            ),
          payload: {
            requiresReview:
              true,
          },
        }),
      ).rejects.toThrow(
        'TikTok UNFOLLOW must remain a pending manual review with executeAt=null and requiresReview=true.',
      );

      expect(
        dbMocks.getDb,
      ).not.toHaveBeenCalled();
    });

    it('rejects UNFOLLOW creation without requiresReview=true', async () => {
      await expect(
        createTikTokAction({
          accountKey:
            'default',
          type:
            'UNFOLLOW',
          targetKey:
            'username:tiktok',
          status:
            'pending',
          executeAt:
            null,
          payload: {},
        }),
      ).rejects.toThrow(
        'TikTok UNFOLLOW must remain a pending manual review with executeAt=null and requiresReview=true.',
      );

      expect(
        dbMocks.getDb,
      ).not.toHaveBeenCalled();
    });

    it('applies the same safety invariant to createOrReuseOpenTikTokAction', async () => {
      await expect(
        createOrReuseOpenTikTokAction({
          accountKey:
            'default',
          type:
            'UNFOLLOW',
          targetKey:
            'username:tiktok',
          status:
            'running',
          executeAt:
            null,
          payload: {
            requiresReview:
              true,
          },
        }),
      ).rejects.toThrow(
        'TikTok UNFOLLOW must remain a pending manual review with executeAt=null and requiresReview=true.',
      );

      expect(
        dbMocks.getDb,
      ).not.toHaveBeenCalled();
    });

    it('prevents an existing UNFOLLOW review from being rescheduled', async () => {
      const tx = {
        select:
          vi.fn(
            () =>
              createSelectChain([
                {
                  type:
                    'UNFOLLOW',
                },
              ]),
          ),
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
        rescheduleTikTokAction(
          'unfollow-review-1',
          new Date(
            '2026-09-18T20:00:00.000Z',
          ),
        ),
      ).rejects.toThrow(
        'TikTok UNFOLLOW review cannot be rescheduled or given executeAt.',
      );

      expect(
        tx.select,
      ).toHaveBeenCalledTimes(1);
    });

    it('still allows CHECK_FOLLOW_BACK to be rescheduled', async () => {
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

      const updateReturning =
        vi.fn(
          async () => [
            updatedRow,
          ],
        );

      const updateWhere =
        vi.fn(() => ({
          returning:
            updateReturning,
        }));

      const updateSet =
        vi.fn(() => ({
          where:
            updateWhere,
        }));

      const update =
        vi.fn(() => ({
          set:
            updateSet,
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
                {
                  type:
                    'CHECK_FOLLOW_BACK',
                },
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

      const executeAt =
        new Date(
          '2026-09-18T20:00:00.000Z',
        );

      const result =
        await rescheduleTikTokAction(
          'check-1',
          executeAt,
          {
            reason:
              'retry',
          },
        );

      expect(result).toBe(
        updatedRow,
      );

      expect(
        update,
      ).toHaveBeenCalledTimes(1);

      expect(
        updateSet,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status:
            'scheduled',
          executeAt,
          payload: {
            reason:
              'retry',
          },
        }),
      );

      expect(
        insert,
      ).toHaveBeenCalledTimes(1);

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
        }),
      );
    });
    it.each([
      'scheduled',
      'running',
      'success',
      'failed',
    ] as const)(
      'prevents UNFOLLOW from transitioning to %s',
      async status => {
        const tx = {
          select:
            vi.fn(
              () =>
                createSelectChain([
                  {
                    type:
                      'UNFOLLOW',
                    status:
                      'pending',
                  },
                ]),
            ),
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
          transitionTikTokAction(
            'unfollow-review-1',
            {
              status,
            },
          ),
        ).rejects.toThrow(
          'TikTok UNFOLLOW review may only remain pending or be cancelled manually.',
        );

        expect(
          tx.select,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it('allows an UNFOLLOW review to be cancelled manually', async () => {
      const updatedRow = {
        id:
          'unfollow-review-1',
        type:
          'UNFOLLOW',
        status:
          'cancelled',
        provider:
          'android',
      };

      const updateReturning =
        vi.fn(
          async () => [
            updatedRow,
          ],
        );

      const updateWhere =
        vi.fn(() => ({
          returning:
            updateReturning,
        }));

      const updateSet =
        vi.fn(() => ({
          where:
            updateWhere,
        }));

      const update =
        vi.fn(() => ({
          set:
            updateSet,
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
                {
                  type:
                    'UNFOLLOW',
                  status:
                    'pending',
                },
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

      const result =
        await transitionTikTokAction(
          'unfollow-review-1',
          {
            status:
              'cancelled',
            metadata: {
              event:
                'manual_review_cancelled',
            },
          },
        );

      expect(result).toBe(
        updatedRow,
      );

      expect(
        updateSet,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status:
            'cancelled',
        }),
      );

      expect(
        historyValues,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId:
            'unfollow-review-1',
          status:
            'cancelled',
          provider:
            'android',
          metadata: {
            event:
              'manual_review_cancelled',
          },
        }),
      );
    });

  },
);

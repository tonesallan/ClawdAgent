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

function createTransitionHarness(
  current: {
    type: string;
    status: string;
  },
  updatedStatus: string,
) {
  const updatedRow = {
    id:
      'review-1',
    type:
      current.type,
    status:
      updatedStatus,
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
    updatedRow,
    tx,
    update,
    updateSet,
    historyValues,
  };
}

describe(
  'TikTok repository DISCOVERY_REVIEW safety',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('rejects scheduled DISCOVERY_REVIEW creation', async () => {
      await expect(
        createTikTokAction({
          accountKey:
            'default',
          type:
            'DISCOVERY_REVIEW',
          targetKey:
            'discovery:abc',
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
        'TikTok DISCOVERY_REVIEW must remain a pending manual review with executeAt=null and requiresReview=true.',
      );

      expect(
        dbMocks.getDb,
      ).not.toHaveBeenCalled();
    });

    it('rejects DISCOVERY_REVIEW creation without requiresReview=true', async () => {
      await expect(
        createTikTokAction({
          accountKey:
            'default',
          type:
            'DISCOVERY_REVIEW',
          targetKey:
            'discovery:abc',
          status:
            'pending',
          executeAt:
            null,
          payload: {},
        }),
      ).rejects.toThrow(
        'TikTok DISCOVERY_REVIEW must remain a pending manual review with executeAt=null and requiresReview=true.',
      );

      expect(
        dbMocks.getDb,
      ).not.toHaveBeenCalled();
    });

    it('applies the same invariant to createOrReuseOpenTikTokAction', async () => {
      await expect(
        createOrReuseOpenTikTokAction({
          accountKey:
            'default',
          type:
            'DISCOVERY_REVIEW',
          targetKey:
            'discovery:abc',
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
        'TikTok DISCOVERY_REVIEW must remain a pending manual review with executeAt=null and requiresReview=true.',
      );

      expect(
        dbMocks.getDb,
      ).not.toHaveBeenCalled();
    });

    it('prevents an existing DISCOVERY_REVIEW from being rescheduled', async () => {
      const tx = {
        select:
          vi.fn(
            () =>
              createSelectChain([
                {
                  type:
                    'DISCOVERY_REVIEW',
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
          'review-1',
          new Date(
            '2026-09-18T20:00:00.000Z',
          ),
        ),
      ).rejects.toThrow(
        'TikTok DISCOVERY_REVIEW cannot be rescheduled or given executeAt.',
      );

      expect(
        tx.select,
      ).toHaveBeenCalledTimes(1);
    });

    it.each([
      'scheduled',
      'running',
      'failed',
    ] as const)(
      'prevents DISCOVERY_REVIEW from transitioning to %s',
      async status => {
        const {
          tx,
        } =
          createTransitionHarness(
            {
              type:
                'DISCOVERY_REVIEW',
              status:
                'pending',
            },
            status,
          );

        await expect(
          transitionTikTokAction(
            'review-1',
            {
              status,
            },
          ),
        ).rejects.toThrow(
          'TikTok DISCOVERY_REVIEW may only remain pending or resolve to success/cancelled.',
        );

        expect(
          tx.select,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      'success',
      'cancelled',
    ] as const)(
      'allows DISCOVERY_REVIEW to resolve to %s',
      async status => {
        const {
          updatedRow,
          updateSet,
          historyValues,
        } =
          createTransitionHarness(
            {
              type:
                'DISCOVERY_REVIEW',
              status:
                'pending',
            },
            status,
          );

        const result =
          await transitionTikTokAction(
            'review-1',
            {
              status,
              result: {
                reviewDecision:
                  status ===
                  'success'
                    ? 'approved'
                    : 'rejected',
                engagementCreated:
                  false,
                engagementExecuted:
                  false,
              },
              metadata: {
                event:
                  'discovery_review_resolved',
              },
            },
          );

        expect(
          result,
        ).toBe(
          updatedRow,
        );

        expect(
          updateSet,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status,
          }),
        );

        expect(
          historyValues,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            actionId:
              'review-1',
            status,
            provider:
              'android',
            metadata: {
              event:
                'discovery_review_resolved',
            },
          }),
        );
      },
    );
  },
);

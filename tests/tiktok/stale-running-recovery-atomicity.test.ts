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

const ormMocks =
  vi.hoisted(() => ({
    and:
      vi.fn(
        (
          ...conditions:
            unknown[]
        ) => ({
          op: 'and',
          conditions,
        }),
      ),
    asc:
      vi.fn(),
    count:
      vi.fn(),
    desc:
      vi.fn(),
    eq:
      vi.fn(
        (
          column: unknown,
          value: unknown,
        ) => ({
          op: 'eq',
          column,
          value,
        }),
      ),
    gte:
      vi.fn(),
    inArray:
      vi.fn(),
    lte:
      vi.fn(
        (
          column: unknown,
          value: unknown,
        ) => ({
          op: 'lte',
          column,
          value,
        }),
      ),
    sql:
      (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => ({
        op: 'sql',
        strings:
          Array.from(strings),
        values,
      }),
  }));

vi.mock(
  '../../src/memory/database.js',
  () => dbMocks,
);

vi.mock(
  'drizzle-orm',
  () => ormMocks,
);

import {
  recoverStaleTikTokRunningActions,
} from '../../src/memory/repositories/tiktok-actions.js';

function createOuterSelect(
  rows: unknown[],
) {
  return vi.fn(
    () => ({
      from:
        vi.fn(
          () => ({
            where:
              vi.fn(
                () => ({
                  orderBy:
                    vi.fn(
                      () => ({
                        limit:
                          vi.fn(
                            async () =>
                              rows,
                          ),
                      }),
                    ),
                }),
              ),
          }),
        ),
    }),
  );
}

function createTransactionHarness(
  returnedRows: unknown[],
) {
  const returning =
    vi.fn(
      async () =>
        returnedRows,
    );

  const where =
    vi.fn(
      () => ({
        returning,
      }),
    );

  const set =
    vi.fn(
      () => ({
        where,
      }),
    );

  const update =
    vi.fn(
      () => ({
        set,
      }),
    );

  const historyValues =
    vi.fn(
      async () => undefined,
    );

  const insert =
    vi.fn(
      () => ({
        values:
          historyValues,
      }),
    );

  return {
    tx: {
      update,
      insert,
    },
    set,
    where,
    insert,
    historyValues,
  };
}

describe(
  'TikTok stale running recovery atomicity',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('atomically recovers a stale running check to scheduled', async () => {
      const now =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const staleUpdatedAt =
        new Date(
          '2026-09-17T19:30:00.000Z',
        );

      const select =
        createOuterSelect([
          {
            id:
              'check-1',
            type:
              'CHECK_FOLLOW_BACK',
            status:
              'running',
            attempts:
              1,
            maxAttempts:
              3,
            provider:
              'android',
            updatedAt:
              staleUpdatedAt,
          },
        ]);

      const {
        tx,
        set,
        where,
        historyValues,
      } =
        createTransactionHarness([
          {
            id:
              'check-1',
            type:
              'CHECK_FOLLOW_BACK',
            status:
              'scheduled',
            provider:
              'android',
          },
        ]);

      dbMocks
        .getDb
        .mockReturnValue({
          select,
          transaction:
            vi.fn(
              async (
                callback:
                  (tx: any) =>
                    Promise<unknown>,
              ) =>
                callback(tx),
            ),
        });

      const result =
        await recoverStaleTikTokRunningActions(
          'CHECK_FOLLOW_BACK',
          now,
          15 * 60,
          60,
          50,
        );

      expect(result).toEqual({
        recovered:
          1,
        failed:
          0,
      });

      expect(
        set,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status:
            'scheduled',
          executeAt:
            new Date(
              '2026-09-17T20:01:00.000Z',
            ),
          updatedAt:
            now,
        }),
      );

      const expression =
        where.mock.calls[0][0] as {
          op: string;
          conditions:
            Array<{
              op: string;
              value: unknown;
            }>;
        };

      expect(
        expression.op,
      ).toBe(
        'and',
      );

      expect(
        expression.conditions.map(
          condition =>
            condition.value,
        ),
      ).toEqual([
        'check-1',
        'running',
        new Date(
          '2026-09-17T19:45:00.000Z',
        ),
      ]);

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
                'stale_running_recovered',
            }),
        }),
      );
    });

    it('atomically fails a stale running check after maxAttempts is exhausted', async () => {
      const now =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const select =
        createOuterSelect([
          {
            id:
              'check-1',
            type:
              'CHECK_FOLLOW_BACK',
            status:
              'running',
            attempts:
              3,
            maxAttempts:
              3,
            provider:
              'android',
            updatedAt:
              new Date(
                '2026-09-17T19:30:00.000Z',
              ),
          },
        ]);

      const {
        tx,
        set,
        where,
        historyValues,
      } =
        createTransactionHarness([
          {
            id:
              'check-1',
            type:
              'CHECK_FOLLOW_BACK',
            status:
              'failed',
            provider:
              'android',
          },
        ]);

      dbMocks
        .getDb
        .mockReturnValue({
          select,
          transaction:
            vi.fn(
              async (
                callback:
                  (tx: any) =>
                    Promise<unknown>,
              ) =>
                callback(tx),
            ),
        });

      const result =
        await recoverStaleTikTokRunningActions(
          'CHECK_FOLLOW_BACK',
          now,
          15 * 60,
          60,
          50,
        );

      expect(result).toEqual({
        recovered:
          0,
        failed:
          1,
      });

      expect(
        set,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status:
            'failed',
          updatedAt:
            now,
        }),
      );

      const expression =
        where.mock.calls[0][0] as {
          op: string;
          conditions:
            Array<{
              value: unknown;
            }>;
        };

      expect(
        expression.conditions.map(
          condition =>
            condition.value,
        ),
      ).toEqual([
        'check-1',
        'running',
        new Date(
          '2026-09-17T19:45:00.000Z',
        ),
      ]);

      expect(
        historyValues,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId:
            'check-1',
          status:
            'failed',
          metadata:
            expect.objectContaining({
              reason:
                'stale_running_exhausted',
            }),
        }),
      );
    });

    it('does not recover or write history when a concurrent worker already changed the row', async () => {
      const select =
        createOuterSelect([
          {
            id:
              'check-1',
            type:
              'CHECK_FOLLOW_BACK',
            status:
              'running',
            attempts:
              1,
            maxAttempts:
              3,
            provider:
              'android',
            updatedAt:
              new Date(
                '2026-09-17T19:30:00.000Z',
              ),
          },
        ]);

      const {
        tx,
        insert,
      } =
        createTransactionHarness([]);

      dbMocks
        .getDb
        .mockReturnValue({
          select,
          transaction:
            vi.fn(
              async (
                callback:
                  (tx: any) =>
                    Promise<unknown>,
              ) =>
                callback(tx),
            ),
        });

      const result =
        await recoverStaleTikTokRunningActions(
          'CHECK_FOLLOW_BACK',
          new Date(
            '2026-09-17T20:00:00.000Z',
          ),
          15 * 60,
          60,
          50,
        );

      expect(result).toEqual({
        recovered:
          0,
        failed:
          0,
      });

      expect(
        insert,
      ).not.toHaveBeenCalled();
    });
  },
);

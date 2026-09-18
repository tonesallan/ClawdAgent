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
      vi.fn(),
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
  rescheduleTikTokAction,
} from '../../src/memory/repositories/tiktok-actions.js';

function setupHarness(
  returnedRows: unknown[],
) {
  const select =
    vi.fn(() => ({
      from:
        vi.fn(() => ({
          where:
            vi.fn(() => ({
              limit:
                vi.fn(
                  async () => [
                    {
                      type:
                        'CHECK_FOLLOW_BACK',
                    },
                  ],
                ),
            })),
        })),
    }));

  const updateReturning =
    vi.fn(
      async () =>
        returnedRows,
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

  dbMocks
    .getDb
    .mockReturnValue({
      transaction:
        vi.fn(
          async (
            callback:
              (tx: any) =>
                Promise<unknown>,
          ) =>
            callback({
              select,
              update,
              insert,
            }),
        ),
    });

  return {
    update,
    updateWhere,
    historyValues,
    insert,
  };
}

describe(
  'TikTok CHECK_FOLLOW_BACK reschedule atomicity',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('rejects CHECK_FOLLOW_BACK reschedule without expectedStatus', async () => {
      const {
        update,
      } =
        setupHarness([]);

      await expect(
        rescheduleTikTokAction(
          'check-1',
          new Date(
            '2026-09-17T20:05:00.000Z',
          ),
        ),
      ).rejects.toThrow(
        'TikTok CHECK_FOLLOW_BACK reschedule requires expectedStatus=scheduled or running.',
      );

      expect(
        update,
      ).not.toHaveBeenCalled();
    });

    it('guards retry reschedule by id and expected running status', async () => {
      const {
        updateWhere,
        historyValues,
      } =
        setupHarness([
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

      const retryAt =
        new Date(
          '2026-09-17T20:05:00.000Z',
        );

      const result =
        await rescheduleTikTokAction(
          'check-1',
          retryAt,
          undefined,
          {
            expectedStatus:
              'running',
            attempts:
              1,
            error:
              'temporary failure',
          },
        );

      const expression =
        updateWhere.mock
          .calls[0][0] as {
            op: string;
            conditions:
              Array<{
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
      ]);

      expect(result).toMatchObject({
        id:
          'check-1',
        status:
          'scheduled',
      });

      expect(
        historyValues,
      ).toHaveBeenCalledTimes(
        1,
      );
    });

    it('returns null and writes no history when the expected status already changed', async () => {
      const {
        insert,
      } =
        setupHarness([]);

      const result =
        await rescheduleTikTokAction(
          'check-1',
          new Date(
            '2026-09-17T20:05:00.000Z',
          ),
          undefined,
          {
            expectedStatus:
              'running',
          },
        );

      expect(
        result,
      ).toBeNull();

      expect(
        insert,
      ).not.toHaveBeenCalled();
    });
  },
);

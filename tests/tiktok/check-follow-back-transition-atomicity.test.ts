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
  transitionTikTokAction,
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
                      status:
                        'running',
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
    updateWhere,
    insert,
    historyValues,
  };
}

describe(
  'TikTok CHECK_FOLLOW_BACK completion atomicity',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each([
      'success',
      'failed',
    ] as const)(
      'requires CHECK_FOLLOW_BACK to still be running before %s',
      async status => {
        const {
          updateWhere,
        } =
          setupHarness([
            {
              id:
                'check-1',
              type:
                'CHECK_FOLLOW_BACK',
              status,
              provider:
                'android',
            },
          ]);

        await transitionTikTokAction(
          'check-1',
          {
            status,
          },
        );

        const expression =
          updateWhere.mock
            .calls[0][0] as {
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
        ]);
      },
    );

    it('returns null and writes no history when another completion wins first', async () => {
      const {
        insert,
      } =
        setupHarness([]);

      const result =
        await transitionTikTokAction(
          'check-1',
          {
            status:
              'success',
          },
        );

      expect(
        result,
      ).toBeNull();

      expect(
        insert,
      ).not.toHaveBeenCalled();
    });

    it('writes one terminal history row for the winning completion', async () => {
      const {
        historyValues,
      } =
        setupHarness([
          {
            id:
              'check-1',
            type:
              'CHECK_FOLLOW_BACK',
            status:
              'success',
            provider:
              'android',
          },
        ]);

      const result =
        await transitionTikTokAction(
          'check-1',
          {
            status:
              'success',
            result: {
              relationshipState:
                'friends',
            },
            metadata: {
              event:
                'follow_back_checked',
            },
          },
        );

      expect(result).toMatchObject({
        id:
          'check-1',
        status:
          'success',
      });

      expect(
        historyValues,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        historyValues,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId:
            'check-1',
          status:
            'success',
          provider:
            'android',
          metadata: {
            event:
              'follow_back_checked',
          },
        }),
      );
    });
  },
);

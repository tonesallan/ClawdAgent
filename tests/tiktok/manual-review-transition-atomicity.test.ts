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
      vi.fn(
        (column: unknown) => ({
          op: 'asc',
          column,
        }),
      ),
    count:
      vi.fn(
        () => ({
          op: 'count',
        }),
      ),
    desc:
      vi.fn(
        (column: unknown) => ({
          op: 'desc',
          column,
        }),
      ),
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
      vi.fn(
        (
          column: unknown,
          value: unknown,
        ) => ({
          op: 'gte',
          column,
          value,
        }),
      ),
    inArray:
      vi.fn(
        (
          column: unknown,
          value: unknown,
        ) => ({
          op: 'inArray',
          column,
          value,
        }),
      ),
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
  transitionTikTokAction,
} from '../../src/memory/repositories/tiktok-actions.js';

function setupTransition(
  currentType: string,
  currentStatus = 'pending',
) {
  const selectLimit =
    vi.fn(
      async () => [
        {
          type:
            currentType,
          status:
            currentStatus,
        },
      ],
    );

  const selectWhere =
    vi.fn(() => ({
      limit:
        selectLimit,
    }));

  const selectFrom =
    vi.fn(() => ({
      where:
        selectWhere,
    }));

  const select =
    vi.fn(() => ({
      from:
        selectFrom,
    }));

  const updateReturning =
    vi.fn(
      async () => [
        {
          id:
            'action-1',
          type:
            currentType,
          status:
            'success',
          provider:
            'android',
        },
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
    select,
    update,
    insert,
  };

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
            callback(tx),
        ),
    });

  return {
    updateWhere,
  };
}

describe(
  'TikTok manual review transition atomicity',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each([
      'DISCOVERY_REVIEW',
      'UNFOLLOW',
    ] as const)(
      'requires %s to still be pending in the atomic UPDATE',
      async type => {
        const {
          updateWhere,
        } =
          setupTransition(
            type,
          );

        const status =
          type ===
          'DISCOVERY_REVIEW'
            ? 'success'
            : 'cancelled';

        await transitionTikTokAction(
          'action-1',
          {
            status,
          },
        );

        expect(
          updateWhere,
        ).toHaveBeenCalledTimes(
          1,
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
          expression.conditions,
        ).toHaveLength(
          2,
        );

        expect(
          expression.conditions.map(
            condition =>
              condition.value,
          ),
        ).toEqual([
          'action-1',
          'pending',
        ]);
      },
    );

    it('requires CHECK_FOLLOW_BACK success transition to still be running', async () => {
      const {
        updateWhere,
      } =
        setupTransition(
          'CHECK_FOLLOW_BACK',
          'running',
        );

      await transitionTikTokAction(
        'action-1',
        {
          status:
            'success',
        },
      );

      expect(
        updateWhere,
      ).toHaveBeenCalledTimes(
        1,
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
        'action-1',
        'running',
      ]);
    });

    it('returns null when a concurrent manual-review resolution wins first', async () => {
      const selectLimit =
        vi.fn(
          async () => [
            {
              type:
                'DISCOVERY_REVIEW',
              status:
                'pending',
            },
          ],
        );

      const select =
        vi.fn(() => ({
          from:
            vi.fn(() => ({
              where:
                vi.fn(() => ({
                  limit:
                    selectLimit,
                })),
            })),
        }));

      const updateWhere =
        vi.fn(() => ({
          returning:
            vi.fn(
              async () => [],
            ),
        }));

      const update =
        vi.fn(() => ({
          set:
            vi.fn(() => ({
              where:
                updateWhere,
            })),
        }));

      const insert =
        vi.fn();

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

      const result =
        await transitionTikTokAction(
          'review-1',
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
  },
);

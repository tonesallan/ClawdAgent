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
  vi.hoisted(() => {
    const sql =
      (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => ({
        op: 'sql',
        strings:
          Array.from(strings),
        values,
      });

    return {
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
      sql,
    };
  });

vi.mock(
  '../../src/memory/database.js',
  () => dbMocks,
);

vi.mock(
  'drizzle-orm',
  () => ormMocks,
);

import {
  listDueScheduledTikTokActions,
} from '../../src/memory/repositories/tiktok-actions.js';

describe(
  'TikTok due automatic queue query safety',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('filters CHECK_FOLLOW_BACK before applying the scheduler batch limit', async () => {
      const rows = [
        {
          id:
            'check-1',
          type:
            'CHECK_FOLLOW_BACK',
          status:
            'scheduled',
        },
      ];

      const limit =
        vi.fn(
          async () => rows,
        );

      const orderBy =
        vi.fn(
          () => ({
            limit,
          }),
        );

      const where =
        vi.fn(
          () => ({
            orderBy,
          }),
        );

      const from =
        vi.fn(
          () => ({
            where,
          }),
        );

      const select =
        vi.fn(
          () => ({
            from,
          }),
        );

      dbMocks
        .getDb
        .mockReturnValue({
          select,
        });

      const now =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const result =
        await listDueScheduledTikTokActions(
          now,
          7,
        );

      expect(result).toBe(
        rows,
      );

      expect(
        limit,
      ).toHaveBeenCalledWith(
        7,
      );

      expect(
        where,
      ).toHaveBeenCalledTimes(
        1,
      );

      const expression =
        where.mock.calls[0][0] as {
          op: string;
          conditions: Array<{
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
        3,
      );

      expect(
        expression.conditions.map(
          condition =>
            condition.op,
        ),
      ).toEqual([
        'eq',
        'eq',
        'lte',
      ]);

      expect(
        expression.conditions.map(
          condition =>
            condition.value,
        ),
      ).toEqual([
        'CHECK_FOLLOW_BACK',
        'scheduled',
        now,
      ]);

      expect(
        ormMocks.eq,
      ).toHaveBeenCalledTimes(
        2,
      );

      expect(
        ormMocks.lte,
      ).toHaveBeenCalledTimes(
        1,
      );
    });
    it('filters available providers before applying the scheduler batch limit', async () => {
      const rows = [
        {
          id:
            'web-check-1',
          type:
            'CHECK_FOLLOW_BACK',
          status:
            'scheduled',
          provider:
            'web',
        },
      ];

      const limit =
        vi.fn(
          async () => rows,
        );

      const orderBy =
        vi.fn(
          () => ({
            limit,
          }),
        );

      const where =
        vi.fn(
          () => ({
            orderBy,
          }),
        );

      const from =
        vi.fn(
          () => ({
            where,
          }),
        );

      const select =
        vi.fn(
          () => ({
            from,
          }),
        );

      dbMocks
        .getDb
        .mockReturnValue({
          select,
        });

      const now =
        new Date(
          '2026-09-19T00:00:00.000Z',
        );

      const result =
        await listDueScheduledTikTokActions(
          now,
          5,
          [
            'web',
          ],
        );

      expect(result).toBe(
        rows,
      );

      expect(
        limit,
      ).toHaveBeenCalledWith(
        5,
      );

      const expression =
        where.mock.calls[0][0] as {
          op: string;
          conditions: Array<{
            op: string;
            value: unknown;
          }>;
        };

      expect(
        expression.conditions,
      ).toHaveLength(
        4,
      );

      expect(
        expression.conditions.map(
          condition =>
            condition.op,
        ),
      ).toEqual([
        'eq',
        'eq',
        'lte',
        'inArray',
      ]);

      expect(
        expression.conditions[3].value,
      ).toEqual([
        'web',
      ]);

      expect(
        ormMocks.inArray,
      ).toHaveBeenCalledTimes(
        1,
      );
    });

  },
);

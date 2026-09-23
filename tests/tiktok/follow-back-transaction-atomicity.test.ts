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
  completeTikTokFollowBackCheck,
} from '../../src/memory/repositories/tiktok-follow-back.js';

function createUpdateChain(
  rows: unknown[],
) {
  const returning =
    vi.fn(
      async () => rows,
    );

  const where =
    vi.fn(() => ({
      returning,
    }));

  const set =
    vi.fn(() => ({
      where,
    }));

  return {
    set,
    where,
    returning,
  };
}

describe(
  'TikTok follow-back transactional completion',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('commits action completion, relationship state, and history through one transaction', async () => {
      const actionChain =
        createUpdateChain([
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

      const relationshipChain =
        createUpdateChain([
          {
            id:
              'relationship-1',
            accountKey:
              'default',
            targetKey:
              'username:tiktok',
            relationshipState:
              'following',
            followsUs:
              false,
            processed:
              true,
          },
        ]);

      const update =
        vi.fn()
          .mockReturnValueOnce({
            set:
              actionChain.set,
          })
          .mockReturnValueOnce({
            set:
              relationshipChain.set,
          });

      const historyValues =
        vi.fn(
          async () => undefined,
        );

      const insert =
        vi.fn(() => ({
          values:
            historyValues,
        }));

      const transaction =
        vi.fn(
          async (
            callback:
              (tx: any) =>
                Promise<unknown>,
          ) =>
            callback({
              update,
              insert,
            }),
        );

      dbMocks
        .getDb
        .mockReturnValue({
          transaction,
        });

      const checkedAt =
        new Date(
          '2026-09-17T20:00:00.000Z',
        );

      const result =
        await completeTikTokFollowBackCheck({
          checkActionId:
            'check-1',
          accountKey:
            'default',
          targetKey:
            'username:tiktok',
          relationshipState:
            'following',
          followsUs:
            false,
          followedBack:
            false,
          checkedAt,
        });

      expect(
        transaction,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        update,
      ).toHaveBeenCalledTimes(
        2,
      );

      expect(
        actionChain.set,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          status:
            'success',
          result: {
            followedBack:
              false,
            relationshipState:
              'following',
            checkedAt:
              checkedAt.toISOString(),
          },
        }),
      );

      const actionWhere =
        actionChain.where.mock
          .calls[0][0] as {
            op: string;
            conditions:
              Array<{
                value: unknown;
              }>;
          };

      expect(
        actionWhere.op,
      ).toBe(
        'and',
      );

      expect(
        actionWhere.conditions.map(
          condition =>
            condition.value,
        ),
      ).toEqual([
        'check-1',
        'CHECK_FOLLOW_BACK',
        'running',
      ]);

      expect(
        relationshipChain.set,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          relationshipState:
            'following',
          followsUs:
            false,
          followedByUs:
            true,
          lastCheckedAt:
            checkedAt,
          processed:
            true,
        }),
      );

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

      expect(
        result,
      ).toMatchObject({
        action: {
          id:
            'check-1',
          status:
            'success',
        },
        relationship: {
          id:
            'relationship-1',
          relationshipState:
            'following',
        },
      });
    });

    it('returns null before touching relationship state when another worker already won', async () => {
      const actionChain =
        createUpdateChain([]);

      const update =
        vi.fn()
          .mockReturnValueOnce({
            set:
              actionChain.set,
          });

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
                  update,
                  insert,
                }),
            ),
        });

      const result =
        await completeTikTokFollowBackCheck({
          checkActionId:
            'check-1',
          accountKey:
            'default',
          targetKey:
            'username:tiktok',
          relationshipState:
            'following',
          followsUs:
            false,
          followedBack:
            false,
          checkedAt:
            new Date(
              '2026-09-17T20:00:00.000Z',
            ),
        });

      expect(
        result,
      ).toBeNull();

      expect(
        update,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        insert,
      ).not.toHaveBeenCalled();
    });

    it('throws before history when the relationship row is missing so the transaction can roll back', async () => {
      const actionChain =
        createUpdateChain([
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

      const relationshipChain =
        createUpdateChain([]);

      const update =
        vi.fn()
          .mockReturnValueOnce({
            set:
              actionChain.set,
          })
          .mockReturnValueOnce({
            set:
              relationshipChain.set,
          });

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
                  update,
                  insert,
                }),
            ),
        });

      await expect(
        completeTikTokFollowBackCheck({
          checkActionId:
            'check-1',
          accountKey:
            'default',
          targetKey:
            'username:missing',
          relationshipState:
            'friends',
          followsUs:
            true,
          followedBack:
            true,
          checkedAt:
            new Date(
              '2026-09-17T20:00:00.000Z',
            ),
        }),
      ).rejects.toThrow(
        'TikTok relationship not found: username:missing',
      );

      expect(
        update,
      ).toHaveBeenCalledTimes(
        2,
      );

      expect(
        insert,
      ).not.toHaveBeenCalled();
    });
  },
);

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const actionMocks =
  vi.hoisted(
    () => ({
      getTikTokActionOverview:
        vi.fn(),
      listRecentTikTokActionHistory:
        vi.fn(),
    }),
  );

const relationshipMocks =
  vi.hoisted(
    () => ({
      getTikTokRelationshipOverview:
        vi.fn(),
      listRecentTikTokRelationships:
        vi.fn(),
    }),
  );

vi.mock(
  '../../src/memory/repositories/tiktok-actions.js',
  () =>
    actionMocks,
);

vi.mock(
  '../../src/memory/repositories/tiktok-relationships.js',
  () =>
    relationshipMocks,
);

import {
  getTikTokCoreOverview,
} from '../../src/tiktok/core-observability-service.js';

describe(
  'TikTok core observability service',
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        actionMocks
          .getTikTokActionOverview
          .mockResolvedValue({
            total:
              3,
            byStatus: [
              {
                key:
                  'scheduled',
                count:
                  2,
              },
              {
                key:
                  'success',
                count:
                  1,
              },
            ],
            byType: [
              {
                key:
                  'CHECK_FOLLOW_BACK',
                count:
                  3,
              },
            ],
            byProvider: [
              {
                key:
                  'web',
                count:
                  3,
              },
            ],
          });

        relationshipMocks
          .getTikTokRelationshipOverview
          .mockResolvedValue({
            total:
              2,
            protectedCount:
              1,
            processedCount:
              1,
            byState: [
              {
                key:
                  'following',
                count:
                  1,
              },
              {
                key:
                  'friends',
                count:
                  1,
              },
            ],
          });

        actionMocks
          .listRecentTikTokActionHistory
          .mockResolvedValue([
            {
              id:
                'history-1',
              actionId:
                'action-1',
              accountKey:
                'web-account-1',
              actionType:
                'CHECK_FOLLOW_BACK',
              targetUsername:
                'tiktok',
              targetDisplayName:
                'TikTok',
              status:
                'success',
              provider:
                'web',
              result: {
                internal:
                  'do-not-expose',
              },
              error:
                null,
              metadata: {
                event:
                  'completed',
                secretInternalField:
                  'do-not-expose',
              },
              createdAt:
                new Date(
                  '2026-09-21T03:30:00.000Z',
                ),
            },
          ]);

        relationshipMocks
          .listRecentTikTokRelationships
          .mockResolvedValue([
            {
              id:
                'relationship-1',
              accountKey:
                'web-account-1',
              targetKey:
                'username:tiktok',
              username:
                'tiktok',
              displayName:
                'TikTok',
              relationshipState:
                'following',
              followsUs:
                false,
              followedByUs:
                true,
              followedByUsAt:
                new Date(
                  '2026-09-19T03:30:00.000Z',
                ),
              followBackCheckAt:
                new Date(
                  '2026-09-21T03:30:00.000Z',
                ),
              lastCheckedAt:
                new Date(
                  '2026-09-21T03:30:00.000Z',
                ),
              protected:
                false,
              processed:
                true,
              metadata: {
                internal:
                  'do-not-expose',
              },
              createdAt:
                new Date(
                  '2026-09-19T03:30:00.000Z',
                ),
              updatedAt:
                new Date(
                  '2026-09-21T03:30:00.000Z',
                ),
            },
          ]);
      },
    );

    it('returns persisted action, history and relationship telemetry', async () => {
      const overview =
        await getTikTokCoreOverview({
          historyLimit:
            25,
          relationshipLimit:
            10,
        });

      expect(
        actionMocks
          .listRecentTikTokActionHistory,
      ).toHaveBeenCalledWith(
        25,
      );

      expect(
        relationshipMocks
          .listRecentTikTokRelationships,
      ).toHaveBeenCalledWith(
        10,
      );

      expect(
        overview.actions,
      ).toMatchObject({
        total:
          3,
      });

      expect(
        overview.relationships,
      ).toMatchObject({
        total:
          2,
        protectedCount:
          1,
        processedCount:
          1,
      });

      expect(
        overview.history[0],
      ).toEqual({
        id:
          'history-1',
        actionId:
          'action-1',
        accountKey:
          'web-account-1',
        actionType:
          'CHECK_FOLLOW_BACK',
        targetUsername:
          'tiktok',
        targetDisplayName:
          'TikTok',
        status:
          'success',
        provider:
          'web',
        error:
          null,
        event:
          'completed',
        createdAt:
          '2026-09-21T03:30:00.000Z',
      });

      expect(
        overview.recentRelationships[0],
      ).toMatchObject({
        id:
          'relationship-1',
        username:
          'tiktok',
        relationshipState:
          'following',
        processed:
          true,
        updatedAt:
          '2026-09-21T03:30:00.000Z',
      });
    });

    it('does not expose arbitrary repository result or metadata fields', async () => {
      const overview =
        await getTikTokCoreOverview();

      const serialized =
        JSON.stringify(
          overview,
        );

      expect(
        serialized,
      ).not.toContain(
        'secretInternalField',
      );

      expect(
        serialized,
      ).not.toContain(
        'do-not-expose',
      );

      expect(
        serialized,
      ).not.toContain(
        '"metadata"',
      );

      expect(
        serialized,
      ).not.toContain(
        '"result"',
      );
    });
  },
);

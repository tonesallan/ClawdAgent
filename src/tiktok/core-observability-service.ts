import {
  getTikTokActionOverview,
  listRecentTikTokActionHistory,
} from '../memory/repositories/tiktok-actions.js';

import {
  getTikTokRelationshipOverview,
  listRecentTikTokRelationships,
} from '../memory/repositories/tiktok-relationships.js';

export interface TikTokCoreOverviewOptions {
  historyLimit?: number;
  relationshipLimit?: number;
}

export async function getTikTokCoreOverview(
  options:
    TikTokCoreOverviewOptions = {},
) {

  const historyLimit =
    options.historyLimit ??
    100;

  const relationshipLimit =
    options.relationshipLimit ??
    50;

  const [
    actionOverview,
    relationshipOverview,
    history,
    relationships,
  ] = await Promise.all([
    getTikTokActionOverview(),
    getTikTokRelationshipOverview(),
    listRecentTikTokActionHistory(
      historyLimit,
    ),
    listRecentTikTokRelationships(
      relationshipLimit,
    ),
  ]);

  return {
    actions:
      actionOverview,

    relationships:
      relationshipOverview,

    history:
      history.map(
        event => ({
          id:
            event.id,
          actionId:
            event.actionId,
          accountKey:
            event.accountKey,
          actionType:
            event.actionType,
          targetUsername:
            event.targetUsername,
          targetDisplayName:
            event.targetDisplayName,
          status:
            event.status,
          provider:
            event.provider,
          error:
            event.error,
          event:
            (
              event.metadata as
                Record<string, unknown> |
                null
            )?.event ??
            null,
          createdAt:
            event.createdAt
              .toISOString(),
        }),
      ),

    recentRelationships:
      relationships.map(
        relationship => ({
          id:
            relationship.id,
          accountKey:
            relationship.accountKey,
          targetKey:
            relationship.targetKey,
          username:
            relationship.username,
          displayName:
            relationship.displayName,
          relationshipState:
            relationship.relationshipState,
          followsUs:
            relationship.followsUs,
          followedByUs:
            relationship.followedByUs,
          followedByUsAt:
            relationship.followedByUsAt
              ?.toISOString() ??
            null,
          followBackCheckAt:
            relationship.followBackCheckAt
              ?.toISOString() ??
            null,
          lastCheckedAt:
            relationship.lastCheckedAt
              ?.toISOString() ??
            null,
          protected:
            relationship.protected,
          processed:
            relationship.processed,
          updatedAt:
            relationship.updatedAt
              .toISOString(),
        }),
      ),
  };
}

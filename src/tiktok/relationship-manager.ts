import {
  DEFAULT_TIKTOK_ACCOUNT_KEY,
} from './domain.js';

import {
  getTikTokRelationship,
} from '../memory/repositories/tiktok-relationships.js';

import {
  registerSuccessfulTikTokFollow,
  recordTikTokFollowBackCheckResult,
} from './persistence-service.js';

import type {
  TikTokRelationshipState,
} from './domain.js';

export interface RegisterFollowInput {
  accountKey?: string;
  targetKey: string;
  username?: string | null;
  displayName?: string | null;
  provider?: string;
  followedAt?: Date;
}

export interface RelationshipCheckInput {
  checkActionId: string;
  accountKey?: string;
  targetKey: string;
  relationshipState: TikTokRelationshipState;
  provider?: string;
  checkedAt?: Date;
}

export class TikTokRelationshipManager {

  async registerFollow(
    input: RegisterFollowInput,
  ) {
    return registerSuccessfulTikTokFollow({
      accountKey:
        input.accountKey ??
        DEFAULT_TIKTOK_ACCOUNT_KEY,
      targetKey: input.targetKey,
      username: input.username,
      displayName: input.displayName,
      provider: input.provider,
      followedAt: input.followedAt,
    });
  }

  async getRelationship(
    targetKey: string,
    accountKey =
      DEFAULT_TIKTOK_ACCOUNT_KEY,
  ) {
    return getTikTokRelationship(
      accountKey,
      targetKey,
    );
  }

  async isProtected(
    targetKey: string,
    accountKey =
      DEFAULT_TIKTOK_ACCOUNT_KEY,
  ): Promise<boolean> {

    const relationship =
      await this.getRelationship(
        targetKey,
        accountKey,
      );

    return relationship?.protected === true;
  }

  async recordRelationshipCheck(
    input: RelationshipCheckInput,
  ) {
    const accountKey =
      input.accountKey ??
      DEFAULT_TIKTOK_ACCOUNT_KEY;

    return recordTikTokFollowBackCheckResult({
      checkActionId: input.checkActionId,
      accountKey,
      targetKey: input.targetKey,
      relationshipState:
        input.relationshipState,
      provider: input.provider,
      checkedAt: input.checkedAt,
    });
  }
}

export const tikTokRelationshipManager =
  new TikTokRelationshipManager();
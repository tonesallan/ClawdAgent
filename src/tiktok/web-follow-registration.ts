import {
  tikTokRelationshipManager,
  type TikTokRelationshipManager,
} from './relationship-manager.js';

import type {
  TikTokObservedRelationship,
} from './providers/tiktok-provider.js';

export interface RegisterConfirmedWebFollowInput {
  accountKey: string;
  username: string;
  displayName?: string | null;
  observedRelationship:
    TikTokObservedRelationship;
  followedAt?: Date;
}

export interface WebFollowRegistrationManager {
  registerFollow:
    TikTokRelationshipManager['registerFollow'];
}

export function normalizeTikTokUsername(
  value: string,
): string {

  return value
    .trim()
    .replace(
      /^@/,
      '',
    );
}

export function isConfirmedWebFollowRelationship(
  relationship:
    TikTokObservedRelationship,
): boolean {

  return (
    relationship ===
      'following' ||
    relationship ===
      'friends'
  );
}

export async function registerConfirmedWebFollow(
  input:
    RegisterConfirmedWebFollowInput,
  manager:
    WebFollowRegistrationManager =
      tikTokRelationshipManager,
) {

  const username =
    normalizeTikTokUsername(
      input.username,
    );

  if (!username) {
    throw new Error(
      'Confirmed Web follow requires an exact TikTok username.',
    );
  }

  if (
    !isConfirmedWebFollowRelationship(
      input.observedRelationship,
    )
  ) {
    throw new Error(
      `Web follow is not confirmed by relationship state: ${input.observedRelationship}`,
    );
  }

  const targetKey =
    `username:${username.toLowerCase()}`;

  return manager.registerFollow({
    accountKey:
      input.accountKey,
    targetKey,
    username,
    displayName:
      input.displayName ??
      null,
    provider:
      'web',
    followedAt:
      input.followedAt ??
      new Date(),
  });
}

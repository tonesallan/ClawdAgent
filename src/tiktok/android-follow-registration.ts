import {
  tikTokRelationshipManager,
  type TikTokRelationshipManager,
} from './relationship-manager.js';

import type {
  TikTokObservedRelationship,
} from './providers/tiktok-provider.js';

export interface RegisterConfirmedAndroidFollowInput {
  accountKey: string;
  username: string;
  displayName?: string | null;
  observedRelationship:
    TikTokObservedRelationship;
  followedAt?: Date;
}

export interface AndroidFollowRegistrationManager {
  registerFollow:
    TikTokRelationshipManager['registerFollow'];
}

export function normalizeAndroidTikTokUsername(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /^@/,
      '',
    );
}

export function isConfirmedAndroidFollowRelationship(
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

export async function registerConfirmedAndroidFollow(
  input:
    RegisterConfirmedAndroidFollowInput,
  manager:
    AndroidFollowRegistrationManager =
      tikTokRelationshipManager,
) {
  const username =
    normalizeAndroidTikTokUsername(
      input.username,
    );

  if (!username) {
    throw new Error(
      'Confirmed Android follow requires an exact TikTok username.',
    );
  }

  if (
    !isConfirmedAndroidFollowRelationship(
      input.observedRelationship,
    )
  ) {
    throw new Error(
      `Android follow is not confirmed by relationship state: ${input.observedRelationship}`,
    );
  }

  return manager.registerFollow({
    accountKey:
      input.accountKey,
    targetKey:
      `username:${username.toLowerCase()}`,
    username,
    displayName:
      input.displayName ??
      null,
    provider:
      'android',
    followedAt:
      input.followedAt ??
      new Date(),
  });
}

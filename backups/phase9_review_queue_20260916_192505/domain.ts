export const TIKTOK_ACTION_TYPES = {
  FOLLOW: 'FOLLOW',
  UNFOLLOW: 'UNFOLLOW',
  LIKE: 'LIKE',
  COMMENT: 'COMMENT',
  DM: 'DM',
  PROFILE_VISIT: 'PROFILE_VISIT',
  WATCH_VIDEO: 'WATCH_VIDEO',
  POST: 'POST',
  CHECK_FOLLOW_BACK: 'CHECK_FOLLOW_BACK',
} as const;

export type TikTokActionType =
  typeof TIKTOK_ACTION_TYPES[keyof typeof TIKTOK_ACTION_TYPES];

export const TIKTOK_ACTION_STATUSES = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type TikTokActionStatus =
  typeof TIKTOK_ACTION_STATUSES[keyof typeof TIKTOK_ACTION_STATUSES];

export const TIKTOK_RELATIONSHIP_STATES = {
  UNKNOWN: 'unknown',
  FOLLOWING: 'following',
  FRIENDS: 'friends',
  FOLLOWS_US: 'follows_us',
  NOT_FOLLOWING: 'not_following',
} as const;

export type TikTokRelationshipState =
  typeof TIKTOK_RELATIONSHIP_STATES[keyof typeof TIKTOK_RELATIONSHIP_STATES];

export const DEFAULT_TIKTOK_ACCOUNT_KEY = 'default';

export const DEFAULT_FOLLOW_BACK_CHECK_HOURS = 48;
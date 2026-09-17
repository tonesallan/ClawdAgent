export type TikTokProviderName =
  | 'android'
  | 'dry-run';

export type TikTokObservedRelationship =
  | 'friends'
  | 'following'
  | 'follows_us'
  | 'not_following'
  | 'unknown';

export interface TikTokTarget {
  targetKey: string;
  username?: string | null;
  displayName?: string | null;
}

export interface TikTokProviderActionResult {
  success: boolean;
  provider: TikTokProviderName;
  action:
    | 'FOLLOW'
    | 'UNFOLLOW'
    | 'LIKE'
    | 'COMMENT'
    | 'DM'
    | 'PROFILE_VISIT'
    | 'WATCH_VIDEO'
    | 'POST'
    | 'CHECK_FOLLOW_BACK';

  targetKey?: string | null;

  details?: Record<string, unknown>;
}

export interface TikTokRelationshipObservation {
  provider: TikTokProviderName;
  targetKey: string;
  relationship: TikTokObservedRelationship;
  observedAt: Date;
  details?: Record<string, unknown>;
}

export interface TikTokAutomationProvider {
  readonly name: TikTokProviderName;

  /**
   * Read-only relationship inspection.
   * This is the method used by the future 48h scheduler handler.
   */
  checkRelationship(
    target: TikTokTarget,
  ): Promise<TikTokRelationshipObservation>;

  follow(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult>;

  unfollow(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult>;

  like?(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult>;

  comment?(
    target: TikTokTarget,
    text: string,
  ): Promise<TikTokProviderActionResult>;

  dm?(
    target: TikTokTarget,
    text: string,
  ): Promise<TikTokProviderActionResult>;

  visitProfile?(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult>;
}
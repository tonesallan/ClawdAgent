import type {
  TikTokAutomationProvider,
  TikTokProviderActionResult,
  TikTokRelationshipObservation,
  TikTokTarget,
} from './tiktok-provider.js';

export interface AndroidTikTokProviderHandlers {

  isAvailable?(): boolean;

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

export class AndroidTikTokProvider
implements TikTokAutomationProvider {

  readonly name = 'android' as const;

  constructor(
    private readonly handlers:
      AndroidTikTokProviderHandlers,
  ) {}

  isAvailable(): boolean {
    return this.handlers
      .isAvailable?.() ??
      true;
  }

  async checkRelationship(
    target: TikTokTarget,
  ): Promise<TikTokRelationshipObservation> {

    return this.handlers
      .checkRelationship(target);
  }

  async follow(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {

    return this.handlers.follow(target);
  }

  async unfollow(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {

    return this.handlers.unfollow(target);
  }

  async like(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {

    if (!this.handlers.like) {
      throw new Error(
        'Android provider does not implement LIKE.',
      );
    }

    return this.handlers.like(target);
  }

  async comment(
    target: TikTokTarget,
    text: string,
  ): Promise<TikTokProviderActionResult> {

    if (!this.handlers.comment) {
      throw new Error(
        'Android provider does not implement COMMENT.',
      );
    }

    return this.handlers.comment(
      target,
      text,
    );
  }

  async dm(
    target: TikTokTarget,
    text: string,
  ): Promise<TikTokProviderActionResult> {

    if (!this.handlers.dm) {
      throw new Error(
        'Android provider does not implement DM.',
      );
    }

    return this.handlers.dm(
      target,
      text,
    );
  }

  async visitProfile(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {

    if (!this.handlers.visitProfile) {
      throw new Error(
        'Android provider does not implement PROFILE_VISIT.',
      );
    }

    return this.handlers
      .visitProfile(target);
  }
}
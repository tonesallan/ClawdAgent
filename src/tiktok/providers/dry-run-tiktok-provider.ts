import type {
  TikTokAutomationProvider,
  TikTokObservedRelationship,
  TikTokProviderActionResult,
  TikTokRelationshipObservation,
  TikTokTarget,
} from './tiktok-provider.js';

export interface DryRunTikTokProviderOptions {
  relationship?:
    TikTokObservedRelationship;
}

export class DryRunTikTokProvider
implements TikTokAutomationProvider {

  readonly name = 'dry-run' as const;

  private relationship:
    TikTokObservedRelationship;

  constructor(
    options:
      DryRunTikTokProviderOptions = {},
  ) {
    this.relationship =
      options.relationship ?? 'unknown';
  }

  setRelationship(
    relationship:
      TikTokObservedRelationship,
  ): void {
    this.relationship = relationship;
  }

  async checkRelationship(
    target: TikTokTarget,
  ): Promise<TikTokRelationshipObservation> {

    return {
      provider: this.name,
      targetKey: target.targetKey,
      relationship:
        this.relationship,
      observedAt: new Date(),
      details: {
        dryRun: true,
      },
    };
  }

  async follow(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {

    return this.success(
      'FOLLOW',
      target,
    );
  }

  async unfollow(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {

    return this.success(
      'UNFOLLOW',
      target,
    );
  }

  async like(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {

    return this.success(
      'LIKE',
      target,
    );
  }

  async comment(
    target: TikTokTarget,
    text: string,
  ): Promise<TikTokProviderActionResult> {

    return {
      ...this.success(
        'COMMENT',
        target,
      ),
      details: {
        dryRun: true,
        text,
      },
    };
  }

  async dm(
    target: TikTokTarget,
    text: string,
  ): Promise<TikTokProviderActionResult> {

    return {
      ...this.success(
        'DM',
        target,
      ),
      details: {
        dryRun: true,
        text,
      },
    };
  }

  async visitProfile(
    target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {

    return this.success(
      'PROFILE_VISIT',
      target,
    );
  }

  private success(
    action:
      TikTokProviderActionResult['action'],
    target: TikTokTarget,
  ): TikTokProviderActionResult {

    return {
      success: true,
      provider: this.name,
      action,
      targetKey: target.targetKey,
      details: {
        dryRun: true,
        executed: false,
      },
    };
  }
}
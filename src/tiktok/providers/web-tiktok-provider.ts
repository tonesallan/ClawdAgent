import {
  devices,
} from 'playwright';

import {
  BrowserSessionManager,
} from '../../actions/browser/session-manager.js';

import {
  dismissTikTokBanners,
  TikTokAccountManager,
  type TikTokAccount,
} from '../../actions/browser/tiktok-manager.js';

import {
  DEFAULT_TIKTOK_ACCOUNT_KEY,
} from '../domain.js';

import {
  TikTokWebSessionPool,
} from '../web-session-pool.js';

import type {
  TikTokAutomationProvider,
  TikTokObservedRelationship,
  TikTokProviderActionResult,
  TikTokRelationshipObservation,
  TikTokTarget,
} from './tiktok-provider.js';

export interface WebTikTokRelationshipControl {
  text?: string | null;
  ariaLabel?: string | null;
}

export function classifyWebTikTokRelationship(
  control: WebTikTokRelationshipControl,
): TikTokObservedRelationship {

  const text =
    (control.text ?? '')
      .trim()
      .toLowerCase();

  const ariaLabel =
    (control.ariaLabel ?? '')
      .trim()
      .toLowerCase();

  const combined =
    `${text} ${ariaLabel}`
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();

  if (
    /^(follow back|seguir de volta)(?:\s|$)/i.test(
      combined,
    )
  ) {
    return 'follows_us';
  }

  if (
    /^(friends|amigos)(?:\s|$)/i.test(
      combined,
    )
  ) {
    return 'friends';
  }

  if (
    /^(following|seguindo)(?:\s|$)/i.test(
      combined,
    )
  ) {
    return 'following';
  }

  if (
    /^(follow|seguir)(?:\s|$)/i.test(
      combined,
    )
  ) {
    return 'not_following';
  }

  return 'unknown';
}

export type WebTikTokChallengeStage =
  | 'session_start'
  | 'authentication_check'
  | 'target_profile';

export interface WebTikTokChallengeContext {
  page: any;
  stage: WebTikTokChallengeStage;
}

export interface WebTikTokProviderOptions {
  accountManager?: TikTokAccountManager;
  browserManager?: BrowserSessionManager;
  sessionPool?: TikTokWebSessionPool;
  mobileDeviceName?: string;
  headed?: boolean;
  navigationWaitMs?: number;

  /**
   * Optional interactive hook for diagnostics/smokes.
   *
   * Production callers should normally omit this. When omitted,
   * any visible TikTok challenge is classified as UNKNOWN.
   *
   * The hook must not automate or bypass the challenge. A caller
   * may use it to wait while a human resolves the visible challenge.
   */
  challengeHandler?: (
    context: WebTikTokChallengeContext,
  ) => Promise<void>;
}

export class WebTikTokProvider
implements TikTokAutomationProvider {

  readonly name =
    'web' as const;

  private readonly accountManager:
    TikTokAccountManager;

  private readonly browserManager:
    BrowserSessionManager;

  private readonly sessionPool:
    TikTokWebSessionPool;

  private readonly mobileDeviceName:
    string;

  private readonly headed:
    boolean;

  private readonly navigationWaitMs:
    number;

  private readonly challengeHandler:
    WebTikTokProviderOptions['challengeHandler'];

  constructor(
    options:
      WebTikTokProviderOptions = {},
  ) {
    this.accountManager =
      options.accountManager ??
      TikTokAccountManager.getInstance();

    this.browserManager =
      options.browserManager ??
      BrowserSessionManager.getInstance();

    this.sessionPool =
      options.sessionPool ??
      new TikTokWebSessionPool({
        accountManager:
          this.accountManager,
        browserManager:
          this.browserManager,
      });

    this.mobileDeviceName =
      options.mobileDeviceName ??
      'Pixel 5';

    this.headed =
      options.headed ??
      false;

    this.navigationWaitMs =
      options.navigationWaitMs ??
      2_500;

    this.challengeHandler =
      options.challengeHandler;
  }

  async checkRelationship(
    target: TikTokTarget,
  ): Promise<TikTokRelationshipObservation> {

    const observedAt =
      new Date();

    const username =
      this.resolveUsername(
        target,
      );

    const account =
      this.resolveAccount(
        target.accountKey,
      );

    const mobileDevice =
      devices[
        this.mobileDeviceName
      ];

    if (!mobileDevice) {
      throw new Error(
        `Unknown Playwright mobile device profile: ${this.mobileDeviceName}`,
      );
    }

    const contextOptions =
      Object.fromEntries(
        Object.entries(
          mobileDevice,
        ).filter(
          ([key]) =>
            key !==
            'defaultBrowserType',
        ),
      );

    let sessionAcquired =
      false;

    let sessionReused =
      false;

    let cookieBootstrapApplied =
      false;

    try {
      const lease =
        await this.sessionPool
          .acquire({
            accountId:
              account.id,
            headed:
              this.headed,
            contextOptions,
          });

      sessionAcquired =
        true;

      sessionReused =
        lease.reused;

      cookieBootstrapApplied =
        lease.cookieBootstrapApplied;

      const page =
        lease.page;

      if (!page) {
        return this.unknown(
          target,
          observedAt,
          {
            reason:
              'missing_playwright_page',
            accountId:
              account.id,
          },
        );
      }

      if (
        !await this
          .resolveVisibleChallenge(
            page,
            'session_start',
          )
      ) {
        return this.unknown(
          target,
          observedAt,
          {
            reason:
              'tiktok_challenge',
            stage:
              'session_start',
            accountId:
              account.id,
          },
        );
      }

      await page.goto(
        'https://www.tiktok.com/profile',
        {
          waitUntil:
            'domcontentloaded',
          timeout:
            30_000,
        },
      );

      await page.waitForTimeout(
        this.navigationWaitMs,
      );

      await dismissTikTokBanners(
        page,
      );

      if (
        !await this
          .resolveVisibleChallenge(
            page,
            'authentication_check',
          )
      ) {
        return this.unknown(
          target,
          observedAt,
          {
            reason:
              'tiktok_challenge',
            stage:
              'authentication_check',
            accountId:
              account.id,
          },
        );
      }

      const ownHandle =
        this.getHandleFromProfileUrl(
          page.url(),
        );

      if (!ownHandle) {
        return this.unknown(
          target,
          observedAt,
          {
            reason:
              'session_not_authenticated',
            currentUrl:
              this.sanitizeUrl(
                page.url(),
              ),
            accountId:
              account.id,
          },
        );
      }

      const targetUrl =
        `https://www.tiktok.com/@${encodeURIComponent(username)}`;

      await page.goto(
        targetUrl,
        {
          waitUntil:
            'domcontentloaded',
          timeout:
            30_000,
        },
      );

      await page.waitForTimeout(
        this.navigationWaitMs,
      );

      await dismissTikTokBanners(
        page,
      );

      await page.waitForTimeout(
        500,
      );

      if (
        !await this
          .resolveVisibleChallenge(
            page,
            'target_profile',
          )
      ) {
        return this.unknown(
          target,
          observedAt,
          {
            reason:
              'tiktok_challenge',
            stage:
              'target_profile',
            accountId:
              account.id,
            targetUsername:
              username,
          },
        );
      }

      const currentHandle =
        this.getHandleFromProfileUrl(
          page.url(),
        );

      if (
        !currentHandle ||
        currentHandle.toLowerCase() !==
          username.toLowerCase()
      ) {
        return this.unknown(
          target,
          observedAt,
          {
            reason:
              'exact_profile_not_confirmed',
            currentUrl:
              this.sanitizeUrl(
                page.url(),
              ),
            targetUsername:
              username,
            accountId:
              account.id,
          },
        );
      }

      const visibleFollowButtons =
        page.locator(
          '[data-e2e="follow-button"]:visible',
        );

      const buttonCount =
        await visibleFollowButtons
          .count();

      if (buttonCount !== 1) {
        return this.unknown(
          target,
          observedAt,
          {
            reason:
              'ambiguous_relationship_control',
            visibleFollowButtonCount:
              buttonCount,
            accountId:
              account.id,
            ownHandle,
            targetUsername:
              username,
          },
        );
      }

      const button =
        visibleFollowButtons
          .first();

      const buttonText =
        (
          await button
            .innerText()
            .catch(
              () => '',
            )
        )
          .trim();

      const ariaLabel =
        await button
          .getAttribute(
            'aria-label',
          );

      const relationship =
        classifyWebTikTokRelationship({
          text:
            buttonText,
          ariaLabel,
        });

      return {
        provider:
          this.name,
        targetKey:
          target.targetKey,
        relationship,
        observedAt,
        details: {
          accountId:
            account.id,
          accountKey:
            target.accountKey ??
            DEFAULT_TIKTOK_ACCOUNT_KEY,
          ownHandle,
          targetUsername:
            username,
          mobileDevice:
            this.mobileDeviceName,
          persistentProfile:
            true,
          sessionReused,
          cookieBootstrapApplied,
          visibleFollowButtonCount:
            buttonCount,
          relationshipControl: {
            dataE2e:
              'follow-button',
            text:
              buttonText,
            ariaLabel:
              ariaLabel ??
              null,
          },
        },
      };
    }
    catch (error) {
      return this.unknown(
        target,
        observedAt,
        {
          reason:
            'web_relationship_check_failed',
          error:
            error instanceof Error
              ? error.message
              : String(error),
          targetUsername:
            username,
          accountId:
            account.id,
        },
      );
    }
    finally {
      if (sessionAcquired) {
        this.sessionPool
          .release(
            account.id,
          );
      }
    }
  }

  async close(): Promise<void> {
    await this.sessionPool
      .closeAll();
  }

  async follow(
    _target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {
    throw new Error(
      'Web TikTok provider is read-only and does not implement FOLLOW.',
    );
  }

  async unfollow(
    _target: TikTokTarget,
  ): Promise<TikTokProviderActionResult> {
    throw new Error(
      'Web TikTok provider is read-only and does not implement UNFOLLOW.',
    );
  }

  private resolveUsername(
    target: TikTokTarget,
  ): string {

    const explicit =
      target.username
        ?.trim()
        .replace(
          /^@/,
          '',
        );

    if (explicit) {
      return explicit;
    }

    const targetMatch =
      target.targetKey
        .match(
          /^username:(.+)$/i,
        );

    const fromTargetKey =
      targetMatch?.[1]
        ?.trim()
        .replace(
          /^@/,
          '',
        );

    if (fromTargetKey) {
      return fromTargetKey;
    }

    throw new Error(
      `Web TikTok relationship check requires a username for target ${target.targetKey}.`,
    );
  }

  private resolveAccount(
    accountKey:
      string | null | undefined,
  ): TikTokAccount {

    const accounts =
      this.accountManager
        .listAccounts();

    if (accounts.length === 0) {
      throw new Error(
        'No TikTok Web account is configured.',
      );
    }

    const normalizedKey =
      accountKey?.trim() ??
      '';

    if (
      normalizedKey &&
      normalizedKey !==
        DEFAULT_TIKTOK_ACCOUNT_KEY
    ) {
      const exact =
        accounts.find(
          account =>
            account.id ===
              normalizedKey ||
            account.name ===
              normalizedKey ||
            account.handle ===
              normalizedKey,
        );

      if (exact) {
        return exact;
      }
    }

    const active =
      accounts.filter(
        account =>
          account.status ===
          'active',
      );

    if (
      normalizedKey ===
        DEFAULT_TIKTOK_ACCOUNT_KEY &&
      active.length === 1
    ) {
      return active[0];
    }

    if (
      !normalizedKey &&
      active.length === 1
    ) {
      return active[0];
    }

    if (
      accounts.length === 1
    ) {
      return accounts[0];
    }

    throw new Error(
      `TikTok Web account mapping is ambiguous for accountKey=${normalizedKey || 'unset'}.`,
    );
  }

  private async resolveVisibleChallenge(
    page: any,
    stage: WebTikTokChallengeStage,
  ): Promise<boolean> {

    const visible =
      await this
        .hasVisibleChallenge(
          page,
        );

    if (!visible) {
      return true;
    }

    if (!this.challengeHandler) {
      return false;
    }

    try {
      await this.challengeHandler({
        page,
        stage,
      });
    }
    catch {
      return false;
    }

    return !await this
      .hasVisibleChallenge(
        page,
      );
  }

  private async hasVisibleChallenge(
    page: any,
  ): Promise<boolean> {

    const selectors = [
      '.secsdk-captcha-drag-icon',
      '[class*="secsdk-captcha"]',
      '[class*="captcha" i]',
      '[id*="captcha" i]',
      'iframe[src*="captcha" i]',
    ];

    for (
      const selector of
        selectors
    ) {
      const locator =
        page.locator(
          selector,
        );

      const count =
        await locator
          .count();

      for (
        let index = 0;
        index < count;
        index += 1
      ) {
        if (
          await locator
            .nth(index)
            .isVisible()
            .catch(
              () => false,
            )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private getHandleFromProfileUrl(
    value: string,
  ): string | null {

    const match =
      value.match(
        /tiktok\.com\/@([^/?#]+)/i,
      );

    if (!match) {
      return null;
    }

    return decodeURIComponent(
      match[1],
    );
  }

  private sanitizeUrl(
    value: string,
  ): string {

    return value
      .split(
        '?',
      )[0];
  }

  private unknown(
    target: TikTokTarget,
    observedAt: Date,
    details:
      Record<string, unknown>,
  ): TikTokRelationshipObservation {

    return {
      provider:
        this.name,
      targetKey:
        target.targetKey,
      relationship:
        'unknown',
      observedAt,
      details,
    };
  }
}

/**
 * MobileAgent — autonomous engagement agent for Android apps (TikTok, Twitter/X, Facebook).
 * Connects to Appium server via SSH tunnel and automates native mobile apps.
 * Follows the same architecture as browser-based agents (FacebookAgent, TwitterAgent, etc).
 */
import { AppiumClient } from './appium-client.js';
import { AIClient } from '../../core/ai-client.js';
import logger from '../../utils/logger.js';
import {
  extractTikTokProfileUsername,
  findTikTokProfileSearchCandidate,
  getTikTokProfileTapPoint,
  tikTokProfileSourceMatchesUsername,
} from '../../tiktok/android-profile-navigation.js';
import {
  classifyTikTokRelationshipFromXml,
  confirmTikTokFollowTransition,
} from '../../tiktok/android-relationship.js';
import type {
  TikTokRelationshipState,
} from '../../tiktok/android-relationship.js';
import {
  extractTikTokVideoContextFromXml,
  hasMeaningfulTikTokVideoContext,
  tikTokVideoContextsMatch,
} from '../../tiktok/android-video-context.js';
import type {
  TikTokVideoContext,
} from '../../tiktok/android-video-context.js';
import {
  registerConfirmedAndroidFollow,
} from '../../tiktok/android-follow-registration.js';
import {
  centerOfTikTokBounds,
  extractVisibleTikTokCommentsFromXml,
} from '../../tiktok/android-comment-thread.js';
import type {
  TikTokVisibleComment,
} from '../../tiktok/android-comment-thread.js';
import {
  buildTikTokVideoKey,
  commentMatchesFollowExchangeSignals,
  detectTikTokFollowExchange,
  evaluateTikTokCommentBaseEligibility,
  evaluateTikTokCommentContentFilters,
  getTikTokCommentStyleInstruction,
  pickTikTokFollowExchangeTemplate,
  validateGeneratedTikTokComment,
} from '../../tiktok/comment-policy.js';
import type {
  TikTokCommentHistoryEntry,
  TikTokCommentKind,
  TikTokCommentPolicyConfig,
  TikTokFollowExchangeDetection,
} from '../../tiktok/comment-policy.js';
import {
  TikTokCommentHistoryStore,
} from '../../tiktok/comment-history-store.js';

// ── Types ─────────────────────────────────────────────────────────────

export type MobileApp = 'tiktok' | 'twitter' | 'facebook';
export type MobileActionType = 'like' | 'comment' | 'follow' | 'scroll' | 'share' | 'retweet' | 'reply';

export interface MobileAgentConfig {
  id: string;
  app: MobileApp;
  deviceId: string;
  appiumUrl: string;
  actions: MobileActionType[];
  schedule: Record<string, { intervalMinutes: number; dailyLimit: number }>;
  activeHours: { weekday: { start: number; end: number }; weekend: { start: number; end: number } };
  content: {
    tone: string;
    language: string;
    topics: string[];
    maxLength: number;
    commentPolicy?: TikTokCommentPolicyConfig;
  };
  safety: { minDelaySeconds: number; maxActionsPerHour: number; pauseOnErrorCount: number; pauseDurationMinutes: number };
  testMode: boolean;
  /**
   * Warm-up duration before the autonomous action loop starts.
   *
   * Default:
   * - production: 300 seconds
   * - testMode: 0 seconds
   */
  warmupSeconds?: number;
}

export interface MobileAgentStatus {
  id: string;
  app: MobileApp;
  deviceId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  currentAction: string | null;
  stats: MobileAgentStats;
  lastError: string | null;
  startedAt: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  nextActionTime: string | null;
  config: MobileAgentConfig;
  commentHistory: TikTokCommentHistoryEntry[];
}

export interface MobileAgentStats {
  likes: number;
  comments: number;
  follows: number;
  scrolls: number;
  shares: number;
  retweets: number;
  replies: number;
  errors: number;
  totalActions: number;
  actionsThisHour: number;
  commentLikes: number;
  followExchangeDetections: number;
  commentSkips: number;
  lastActionAt: string | null;
}

export interface MobileAgentLogEntry {
  timestamp: string;
  action: MobileActionType | 'system';
  status: 'success' | 'error' | 'skipped' | 'info';
  message: string;
  details?: string;
}

// ── App Definitions ──────────────────────────────────────────────────

const APP_DEFS: Record<MobileApp, { pkg: string; activity: string; actions: MobileActionType[] }> = {
  tiktok:   { pkg: 'com.zhiliaoapp.musically', activity: 'com.ss.android.ugc.aweme.splash.SplashActivity', actions: ['like', 'comment', 'follow', 'share', 'scroll'] },
  twitter:  { pkg: 'com.twitter.android',      activity: 'com.twitter.android.StartActivity',              actions: ['like', 'reply', 'retweet', 'follow', 'scroll'] },
  facebook: { pkg: 'com.facebook.katana',       activity: 'com.facebook.katana.LoginActivity',              actions: ['like', 'comment', 'share', 'scroll'] },
};

// ── Mobile Agent Class ──────────────────────────────────────────────

export class MobileAgent {
  private static instances: Map<string, MobileAgent> = new Map();

  private config: MobileAgentConfig;
  private state: 'stopped' | 'running' | 'paused' | 'error' = 'stopped';
  private currentAction: string | null = null;
  private stats: MobileAgentStats = this.freshStats();
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private logs: MobileAgentLogEntry[] = [];
  private consecutiveErrors = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActionTimes: Map<MobileActionType, number> = new Map();
  private dailyActionCounts: Map<MobileActionType, number> = new Map();
  private dailyResetDate = '';
  private appium: AppiumClient;
  private aiClient: AIClient;
  private screenSize: { width: number; height: number } | null = null;
  private commentHistoryStore = new TikTokCommentHistoryStore();

  private constructor(config: MobileAgentConfig) {
    this.config = config;
    this.appium = new AppiumClient();
    this.aiClient = new AIClient();
  }

  // ── Static Registry ────────────────────────────────────────────────

  static getAgent(id: string): MobileAgent | undefined {
    return MobileAgent.instances.get(id);
  }

  static createAgent(config: MobileAgentConfig): MobileAgent {
    if (MobileAgent.instances.has(config.id)) {
      throw new Error(`Agent already exists: ${config.id}`);
    }
    const agent = new MobileAgent(config);
    MobileAgent.instances.set(config.id, agent);
    return agent;
  }

  static removeAgent(id: string): void {
    const agent = MobileAgent.instances.get(id);
    if (agent) {
      agent.stop().catch(() => {});
      MobileAgent.instances.delete(id);
    }
  }

  static listAgents(): MobileAgentStatus[] {
    return [...MobileAgent.instances.values()].map(a => a.getStatus());
  }

  static getTikTokAgent(
    accountKey?: string | null,
  ): MobileAgent | undefined {
    const tikTokAgents =
      [...MobileAgent.instances.values()]
        .filter(
          agent =>
            agent.getStatus().app ===
            'tiktok',
        );

    if (
      accountKey
    ) {
      const exact =
        tikTokAgents.find(
          agent => {
            const status =
              agent.getStatus();

            return (
              status.id ===
                accountKey ||
              status.deviceId ===
                accountKey
            );
          },
        );

      if (exact) {
        return exact;
      }
    }

    const active =
      tikTokAgents.filter(
        agent => {
          const state =
            agent.getStatus().state;

          return (
            state === 'running' ||
            state === 'paused'
          );
        },
      );

    if (
      active.length ===
        1
    ) {
      return active[0];
    }

    if (
      active.length >
        1
    ) {
      return undefined;
    }

    return tikTokAgents.length ===
      1
      ? tikTokAgents[0]
      : undefined;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state === 'running') throw new Error('Agent is already running');

    const appDef = APP_DEFS[this.config.app];
    if (!appDef) throw new Error(`Unknown app: ${this.config.app}`);

    this.state = 'running';
    this.screenSize = null;
    this.startedAt = new Date().toISOString();
    this.consecutiveErrors = 0;
    this.stats = this.freshStats();
    await this.commentHistoryStore.load();
    this.log('system', 'info', `Starting mobile agent: ${this.config.app} on device ${this.config.deviceId}`);

    try {
      await this.appium.createSession(this.config.appiumUrl, {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': this.config.deviceId,
        'appium:udid': this.config.deviceId,
        'appium:appPackage': appDef.pkg,
        'appium:appActivity': appDef.activity,
        'appium:noReset': true,
        'appium:fullReset': false,
        'appium:autoGrantPermissions': true,
        'appium:newCommandTimeout': 600,
        'appium:ignoreHiddenApiPolicyError': true,
        'appium:settings[waitForIdleTimeout]': 1000,
        'appium:settings[waitForSelectorTimeout]': 1000,
        'appium:settings[trackScrollEvents]': false,
      });
      this.log('system', 'info', 'Appium session created — app launched');
    } catch (err: unknown) {
      this.state = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.log('system', 'error', `Failed to create Appium session: ${msg}`);
      throw err;
    }

    await this.sleep(3000);
    await this.dismissPopups();
    this.startWarmup();
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    try { await this.appium.deleteSession(); } catch { /* best effort */ }
    this.log('system', 'info', 'Agent stopped');
    logger.info('Mobile agent stopped', { id: this.config.id });
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    this.log('system', 'info', 'Agent paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.consecutiveErrors = 0;
    this.log('system', 'info', 'Agent resumed');
    this.scheduleNextAction();
  }

  updateConfig(updates: Partial<MobileAgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.log('system', 'info', 'Configuration updated');
  }

  getStatus(): MobileAgentStatus {
    let lastAction: string | null = null;
    let latestTime = 0;
    for (const [action, time] of this.lastActionTimes) {
      if (time > latestTime) { latestTime = time; lastAction = action; }
    }
    let nextActionTime: string | null = null;
    if (this.state === 'running') {
      const nextDelay = this.config.safety.minDelaySeconds * 1000;
      nextActionTime = new Date((latestTime || Date.now()) + nextDelay).toISOString();
    }
    return {
      id: this.config.id, app: this.config.app, deviceId: this.config.deviceId,
      state: this.state, currentAction: this.currentAction,
      stats: { ...this.stats }, lastError: this.lastError,
      startedAt: this.startedAt, lastAction, lastActionTime: this.stats.lastActionAt,
      nextActionTime, config: this.config,
      commentHistory: this.commentHistoryStore.list(100),
    };
  }

  getLogs(limit = 50): MobileAgentLogEntry[] { return this.logs.slice(-limit); }
  getConfig(): MobileAgentConfig { return { ...this.config }; }

  async takeScreenshot(): Promise<string> {
    try { return await this.appium.screenshot(); }
    catch { return ''; }
  }

  // ── Warmup ─────────────────────────────────────────────────────────

  private getWarmupDurationMs(): number {
    const configured =
      this.config.warmupSeconds;

    if (
      typeof configured === 'number' &&
      Number.isFinite(configured)
    ) {
      return Math.max(
        0,
        configured,
      ) * 1000;
    }

    return this.config.testMode
      ? 0
      : 5 * 60_000;
  }

  private startWarmup(): void {
    const warmupDurationMs =
      this.getWarmupDurationMs();

    if (warmupDurationMs <= 0) {
      this.log(
        'system',
        'info',
        'Warmup skipped — beginning action loop'
      );
      this.scheduleNextAction();
      return;
    }

    this.log(
      'system',
      'info',
      `Starting ${Math.round(warmupDurationMs / 1000)}s warmup (scroll only)`
    );

    this.performWarmup(
      warmupDurationMs,
    );
  }

  private async performWarmup(
    warmupDurationMs: number,
  ): Promise<void> {
    if (this.state !== 'running') return;

    try {
      await this.swipeRelative(0.5, 2 / 3, 1 / 6, 600);
      await this.sleep(4000 + Math.random() * 8000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('system', 'error', `Warmup scroll error: ${msg}`);
    }

    const elapsedMs = Date.now() - new Date(this.startedAt!).getTime();
    if (elapsedMs >= warmupDurationMs) {
      this.log('system', 'info', 'Warmup complete — beginning action loop');
      this.scheduleNextAction();
    } else {
      const nextDelay = 8000 + Math.floor(Math.random() * 12000);
      this.loopTimer = setTimeout(
        () =>
          this.performWarmup(
            warmupDurationMs,
          ),
        nextDelay,
      );
    }
  }

  // ── Main Loop ──────────────────────────────────────────────────────

  private scheduleNextAction(): void {
    if (this.state !== 'running') return;
    const baseDelay = this.config.safety.minDelaySeconds * 1000;
    const delay = baseDelay + Math.floor(Math.random() * baseDelay * 1.5);
    this.log('system', 'info', `Next action in ${Math.round(delay / 1000)}s`);
    this.loopTimer = setTimeout(() => this.actionLoop(), delay);
  }

  private async actionLoop(): Promise<void> {
    if (this.state !== 'running') return;

    try {
      if (!this.isWithinActiveHours()) {
        this.log('system', 'skipped', 'Outside active hours');
        this.loopTimer = setTimeout(() => this.actionLoop(), 5 * 60_000);
        return;
      }
      this.updateHourlyCount();
      if (this.stats.actionsThisHour >= this.config.safety.maxActionsPerHour) {
        this.log('system', 'skipped', `Hourly limit (${this.stats.actionsThisHour}/${this.config.safety.maxActionsPerHour})`);
        this.loopTimer = setTimeout(() => this.actionLoop(), 60_000);
        return;
      }
      this.resetDailyCountsIfNeeded();

      const action = this.pickNextAction();
      if (!action) {
        this.log('system', 'skipped', 'No actions available');
        this.loopTimer = setTimeout(() => this.actionLoop(), 60_000);
        return;
      }

      // Random pre-action navigation is disabled in testMode.
      if (!this.config.testMode && Math.random() < 0.4) {
        const scrolls = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < scrolls; i++) {
          await this.swipeRelative(0.5, 0.625, 5 / 24, 400 + Math.floor(Math.random() * 400));
          await this.sleep(2000 + Math.random() * 4000);
        }
      }

      this.currentAction = action;
      await this.executeAction(action);
      this.currentAction = null;
      this.consecutiveErrors = 0;

    } catch (err: unknown) {
      this.consecutiveErrors++;
      this.stats.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.currentAction = null;
      this.log('system', 'error', `Action error: ${msg}`);

      if (this.consecutiveErrors >= this.config.safety.pauseOnErrorCount) {
        this.state = 'paused';
        this.log('system', 'error', `Paused after ${this.consecutiveErrors} errors. Auto-resume in ${this.config.safety.pauseDurationMinutes} min.`);
        this.loopTimer = setTimeout(() => {
          if (this.state === 'paused') {
            this.state = 'running';
            this.consecutiveErrors = 0;
            this.log('system', 'info', 'Auto-resumed after error pause');
            this.actionLoop();
          }
        }, this.config.safety.pauseDurationMinutes * 60_000);
        return;
      }
    }

    this.scheduleNextAction();
  }

  // ── Action Execution ──────────────────────────────────────────────

  private async executeAction(action: MobileActionType): Promise<void> {
    this.log(action, 'info', `Executing: ${action} on ${this.config.app}`);

    switch (this.config.app) {
      case 'tiktok':  await this.executeTikTokAction(action); break;
      case 'twitter':  await this.executeTwitterAction(action); break;
      case 'facebook': await this.executeFacebookAction(action); break;
    }

    this.stats.totalActions++;
    this.stats.actionsThisHour++;
    this.stats.lastActionAt = new Date().toISOString();
    this.lastActionTimes.set(action, Date.now());
    this.dailyActionCounts.set(action, (this.dailyActionCounts.get(action) || 0) + 1);
    this.incrementStat(action);
  }

  // ── TikTok Actions ────────────────────────────────────────────────

  private async executeTikTokAction(action: MobileActionType): Promise<void> {
    switch (action) {
      case 'like': {
        if (this.config.testMode) { this.log('like', 'success', '[TEST] Would like a video'); return; }
        try {
          let likeButton;

          try {
            likeButton = await this.appium.findElement(
              'uiautomator',
              'new UiSelector().descriptionStartsWith("Curtir vídeo")'
            );
          } catch {
            likeButton = await this.appium.findElement(
              'uiautomator',
              'new UiSelector().descriptionStartsWith("Like video")'
            );
          }

          await this.appium.clickElement(likeButton.elementId);
          await this.sleep(1000);

          this.log(
            'like',
            'success',
            'Clicked TikTok like button'
          );
        } catch {
          this.log(
            'like',
            'skipped',
            'Video already liked or TikTok like button not found'
          );
        }
        break;
      }
      case 'comment': {
        await this.executeTikTokCommentAction();
        break;
      }
      case 'follow': {
        if (this.config.testMode) {
          this.log('follow', 'success', '[TEST] Would follow user');
          return;
        }

        let profileOpened =
          false;

        try {
          let profileEntry;

          try {
            profileEntry =
              await this.appium.findElement(
                'id',
                'com.zhiliaoapp.musically:id/user_avatar',
              );
          } catch {
            profileEntry =
              await this.appium.findElement(
                'id',
                'com.zhiliaoapp.musically:id/title',
              );
          }

          await this.appium.clickElement(
            profileEntry.elementId,
          );

          profileOpened =
            true;

          await this.sleep(
            1500,
          );

          const profileSource =
            await this.appium
              .getPageSource();

          const username =
            extractTikTokProfileUsername(
              profileSource,
            );

          if (!username) {
            throw new Error(
              'TikTok creator profile opened but exact username could not be resolved.',
            );
          }

          const beforeRelationship =
            classifyTikTokRelationshipFromXml(
              profileSource,
            );

          if (
            beforeRelationship ===
              'following' ||
            beforeRelationship ===
              'friends'
          ) {
            this.log(
              'follow',
              'skipped',
              `Already following @${username}`,
            );
            return;
          }

          if (
            beforeRelationship !==
              'not_following' &&
            beforeRelationship !==
              'follows_us'
          ) {
            throw new Error(
              `TikTok relationship is not safe to follow: ${beforeRelationship}`,
            );
          }

          const labels =
            beforeRelationship ===
              'follows_us'
              ? [
                  'Seguir de volta',
                  'Follow back',
                ]
              : [
                  'Seguir',
                  'Follow',
                ];

          let followButton:
            { elementId: string } |
            null =
              null;

          for (
            const label of
              labels
          ) {
            try {
              followButton =
                await this.appium
                  .findElement(
                    'uiautomator',
                    `new UiSelector().text("${label}")`,
                  );

              break;
            } catch {
              // Try next localized label.
            }
          }

          if (!followButton) {
            throw new Error(
              `TikTok profile follow control not found for @${username}.`,
            );
          }

          await this.appium.clickElement(
            followButton.elementId,
          );

          const followedAt =
            new Date();

          await this.sleep(
            1200,
          );

          let afterSource =
            await this.appium
              .getPageSource();

          if (
            !tikTokProfileSourceMatchesUsername(
              afterSource,
              username,
            )
          ) {
            throw new Error(
              `TikTok profile identity changed after Follow for @${username}.`,
            );
          }

          let confirmedRelationship =
            confirmTikTokFollowTransition(
              beforeRelationship,
              afterSource,
            );

          if (
            confirmedRelationship !==
              'following' &&
            confirmedRelationship !==
              'friends'
          ) {
            await this.sleep(
              1200,
            );

            afterSource =
              await this.appium
                .getPageSource();

            if (
              !tikTokProfileSourceMatchesUsername(
                afterSource,
                username,
              )
            ) {
              throw new Error(
                `TikTok profile identity changed while confirming Follow for @${username}.`,
              );
            }

            confirmedRelationship =
              confirmTikTokFollowTransition(
                beforeRelationship,
                afterSource,
              );
          }

          if (
            confirmedRelationship !==
              'following' &&
            confirmedRelationship !==
              'friends'
          ) {
            throw new Error(
              `TikTok Follow was not confirmed for @${username}: ${confirmedRelationship}`,
            );
          }

          await registerConfirmedAndroidFollow({
            accountKey:
              this.config.id,
            username,
            observedRelationship:
              confirmedRelationship,
            followedAt,
          });

          this.log(
            'follow',
            'success',
            `Followed @${username}; persistent 48h follow-back check registered`,
          );
        } catch (err: unknown) {
          const msg =
            err instanceof Error
              ? err.message
              : String(err);

          this.log(
            'follow',
            'error',
            'TikTok follow failed',
            msg,
          );

          throw err;
        }
        finally {
          if (
            profileOpened
          ) {
            try {
              await this
                .goToTikTokHome();
            } catch {
              // Best effort return to the feed.
            }
          }
        }

        break;
      }

      case 'share': {
        if (this.config.testMode) {
          this.log(
            'share',
            'success',
            '[TEST] Would open TikTok share panel and close it without sharing'
          );
          return;
        }

        let shareButtonClicked =
          false;

        try {
          let shareButton;

          try {
            shareButton = await this.appium.findElement(
              'uiautomator',
              'new UiSelector().descriptionStartsWith("Compartilhar vídeo")'
            );
          } catch {
            shareButton = await this.appium.findElement(
              'uiautomator',
              'new UiSelector().descriptionStartsWith("Share video")'
            );
          }

          await this.appium.clickElement(
            shareButton.elementId
          );

          shareButtonClicked =
            true;

          await this.sleep(1200);

          const shareSource =
            await this.appium.getPageSource();

          const sharePanelOpen =
            shareSource.includes(
              'com.zhiliaoapp.musically:id/g1i'
            ) ||
            shareSource.includes(
              'text="Enviar para"'
            ) ||
            shareSource.includes(
              'text="Send to"'
            );

          if (!sharePanelOpen) {
            throw new Error(
              'TikTok share panel did not open after clicking share.'
            );
          }

          this.log(
            'share',
            'success',
            'Opened TikTok share panel without sharing'
          );
        } catch (err: unknown) {
          const msg =
            err instanceof Error
              ? err.message
              : String(err);

          this.log(
            'share',
            'error',
            'TikTok share failed',
            msg
          );

          throw err;
        } finally {
          /*
           * Safety invariant:
           * after clicking Share we only close the panel.
           * No recipient/action inside the panel is ever clicked.
           */
          if (shareButtonClicked) {
            try {
              await this.appium.pressKey(4);
              await this.sleep(500);
            } catch {
              // Best effort: never replace the original share result.
            }
          }
        }

        break;
      }
      case 'scroll': {
        if (this.config.testMode) {
          this.log(
            'scroll',
            'success',
            '[TEST] Would scroll TikTok feed'
          );
          return;
        }

        const count = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          await this.swipeRelative(0.5, 0.625, 1 / 6, 400 + Math.floor(Math.random() * 400));
          await this.sleep(3000 + Math.random() * 5000);
        }
        this.log('scroll', 'success', `Scrolled through ${count} videos`);
        break;
      }
    }
  }

  // ── Twitter/X Actions ─────────────────────────────────────────────

  private async executeTwitterAction(action: MobileActionType): Promise<void> {
    switch (action) {
      case 'like': {
        if (this.config.testMode) { this.log('like', 'success', '[TEST] Would like a tweet'); return; }
        try {
          const likeBtn = await this.appium.findElement('accessibility id', 'Like');
          await this.appium.clickElement(likeBtn.elementId);
          await this.sleep(1500);
          this.log('like', 'success', 'Liked a tweet');
        } catch {
          // Fallback: try by content-desc
          try {
            const btns = await this.appium.findElements('uiautomator', 'new UiSelector().descriptionContains("Like")');
            if (btns.length > 0) {
              const idx = Math.floor(Math.random() * Math.min(3, btns.length));
              await this.appium.clickElement(btns[idx].elementId);
              await this.sleep(1500);
              this.log('like', 'success', 'Liked a tweet (fallback)');
            } else {
              this.log('like', 'skipped', 'No like buttons found');
            }
          } catch {
            this.log('like', 'skipped', 'Like button not found');
          }
        }
        break;
      }
      case 'reply': {
        const replyText = await this.generateComment('twitter');
        if (this.config.testMode) { this.log('reply', 'success', `[TEST] Would reply: "${replyText}"`); return; }
        try {
          const replyBtn = await this.appium.findElement('accessibility id', 'Reply');
          await this.appium.clickElement(replyBtn.elementId);
          await this.sleep(2000);
          const input = await this.appium.findElement('uiautomator', 'new UiSelector().className("android.widget.EditText")');
          await this.appium.sendKeys(input.elementId, replyText);
          await this.sleep(1000);
          const postBtn = await this.appium.findElement('uiautomator', 'new UiSelector().text("Reply")');
          await this.appium.clickElement(postBtn.elementId);
          await this.sleep(2000);
          this.log('reply', 'success', `Replied: "${replyText.slice(0, 60)}..."`);
        } catch (err: unknown) {
          await this.appium.pressKey(4);
          throw err;
        }
        break;
      }
      case 'retweet': {
        if (this.config.testMode) { this.log('retweet', 'success', '[TEST] Would repost a tweet'); return; }
        try {
          const rtBtn = await this.appium.findElement('accessibility id', 'Repost');
          await this.appium.clickElement(rtBtn.elementId);
          await this.sleep(1000);
          const repostOption = await this.appium.findElement('uiautomator', 'new UiSelector().text("Repost")');
          await this.appium.clickElement(repostOption.elementId);
          await this.sleep(1500);
          this.log('retweet', 'success', 'Reposted a tweet');
        } catch {
          this.log('retweet', 'skipped', 'Repost button not found');
        }
        break;
      }
      case 'follow': {
        if (this.config.testMode) { this.log('follow', 'success', '[TEST] Would follow user'); return; }
        try {
          const followBtn = await this.appium.findElement('uiautomator', 'new UiSelector().text("Follow")');
          await this.appium.clickElement(followBtn.elementId);
          await this.sleep(1500);
          this.log('follow', 'success', 'Followed a user');
        } catch {
          this.log('follow', 'skipped', 'No follow button found');
        }
        break;
      }
      case 'scroll': {
        const count = 2 + Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) {
          await this.appium.swipe(540, 1500, 540, 500, 500 + Math.floor(Math.random() * 500));
          await this.sleep(2000 + Math.random() * 4000);
        }
        this.log('scroll', 'success', `Scrolled feed (${count} swipes)`);
        break;
      }
    }
  }

  // ── Facebook Actions ──────────────────────────────────────────────

  private async executeFacebookAction(action: MobileActionType): Promise<void> {
    switch (action) {
      case 'like': {
        if (this.config.testMode) { this.log('like', 'success', '[TEST] Would like a post'); return; }
        try {
          const likeBtns = await this.appium.findElements('uiautomator', 'new UiSelector().descriptionContains("Like")');
          if (likeBtns.length > 0) {
            const idx = Math.floor(Math.random() * Math.min(3, likeBtns.length));
            await this.appium.clickElement(likeBtns[idx].elementId);
            await this.sleep(1500);
            this.log('like', 'success', 'Liked a post');
          } else {
            this.log('like', 'skipped', 'No like buttons found');
          }
        } catch {
          this.log('like', 'skipped', 'Like button not accessible');
        }
        break;
      }
      case 'comment': {
        const commentText = await this.generateComment('facebook');
        if (this.config.testMode) { this.log('comment', 'success', `[TEST] Would comment: "${commentText}"`); return; }
        try {
          const commentBtns = await this.appium.findElements('uiautomator', 'new UiSelector().descriptionContains("Comment")');
          if (commentBtns.length > 0) {
            await this.appium.clickElement(commentBtns[0].elementId);
            await this.sleep(2000);
            const input = await this.appium.findElement('uiautomator', 'new UiSelector().className("android.widget.EditText")');
            await this.appium.sendKeys(input.elementId, commentText);
            await this.sleep(1000);
            // Tap send
            const sendBtn = await this.appium.findElement('uiautomator', 'new UiSelector().descriptionContains("Send")');
            await this.appium.clickElement(sendBtn.elementId);
            await this.sleep(2000);
            await this.appium.pressKey(4); // Back
            this.log('comment', 'success', `Commented: "${commentText.slice(0, 60)}..."`);
          } else {
            this.log('comment', 'skipped', 'No comment buttons found');
          }
        } catch (err: unknown) {
          await this.appium.pressKey(4);
          throw err;
        }
        break;
      }
      case 'share': {
        if (this.config.testMode) { this.log('share', 'success', '[TEST] Would share a post'); return; }
        try {
          const shareBtns = await this.appium.findElements('uiautomator', 'new UiSelector().descriptionContains("Share")');
          if (shareBtns.length > 0) {
            await this.appium.clickElement(shareBtns[0].elementId);
            await this.sleep(1500);
            // Look for "Share now" or "Share to Feed"
            try {
              const shareNow = await this.appium.findElement('uiautomator', 'new UiSelector().textContains("Share now")');
              await this.appium.clickElement(shareNow.elementId);
              this.log('share', 'success', 'Shared a post');
            } catch {
              await this.appium.pressKey(4);
              this.log('share', 'skipped', 'Share dialog not available');
            }
            await this.sleep(2000);
          } else {
            this.log('share', 'skipped', 'No share buttons found');
          }
        } catch {
          await this.appium.pressKey(4);
          this.log('share', 'skipped', 'Share failed');
        }
        break;
      }
      case 'scroll': {
        const count = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          await this.appium.swipe(540, 1500, 540, 500, 500 + Math.floor(Math.random() * 500));
          await this.sleep(2000 + Math.random() * 4000);
        }
        this.log('scroll', 'success', `Scrolled feed (${count} swipes)`);
        break;
      }
    }
  }


  /**
   * Read-only TikTok relationship inspection.
   *
   * IMPORTANT:
   * - Does not click anything.
   * - Does not follow/unfollow.
   * - Does not navigate away from the current screen.
   * - Intended as a low-level primitive for the Android provider.
   *
   * The caller must already have the correct target profile/list row
   * visible before using this method.
   */
  async inspectTikTokCurrentRelationship(): Promise<
    'friends' | 'following' | 'follows_us' | 'not_following' | 'unknown'
  > {
    if (this.config.app !== 'tiktok') {
      throw new Error(
        'TikTok relationship inspection requires app=tiktok'
      );
    }

    const source =
      await this.appium.getPageSource();

    return classifyTikTokRelationshipFromXml(
      source,
    );
  }

  /**
   * Return TikTok to the Home feed using the mapped bottom navigation control.
   * Navigation-only: no engagement action is performed.
   */
  async goToTikTokHome(): Promise<void> {
    if (this.config.app !== 'tiktok') {
      throw new Error(
        'TikTok Home navigation requires app=tiktok',
      );
    }

    try {
      const home =
        await this.appium
          .findElement(
            'id',
            'com.zhiliaoapp.musically:id/olw',
          );

      await this.appium
        .clickElement(
          home.elementId,
        );

      await this.sleep(
        800,
      );

      return;
    }
    catch {
      // Fallback to localized accessibility labels.
    }

    for (
      const label of
        [
          'Início',
          'Home',
        ]
    ) {
      try {
        const home =
          await this.appium
            .findElement(
              'accessibility id',
              label,
            );

        await this.appium
          .clickElement(
            home.elementId,
          );

        await this.sleep(
          800,
        );

        return;
      }
      catch {
        // Try next label.
      }
    }

    throw new Error(
      'TikTok Home navigation control was not found.',
    );
  }

  /**
   * Navigate to one exact TikTok username.
   *
   * Read-only in terms of account relationship:
   * - does not follow;
   * - does not unfollow;
   * - does not like;
   * - does not comment;
   * - does not send messages.
   *
   * It only opens Search and navigates to an exact account.
   */
  async openTikTokProfileByUsername(
    username: string,
  ): Promise<boolean> {

    if (this.config.app !== 'tiktok') {
      throw new Error(
        'TikTok profile navigation requires app=tiktok'
      );
    }

    const normalizedUsername =
      username
        .trim()
        .replace(/^@/, '');

    if (
      !/^[A-Za-z0-9._]{2,24}$/.test(
        normalizedUsername,
      )
    ) {
      throw new Error(
        `Invalid TikTok username: ${username}`
      );
    }

    const wait = async (
      ms: number,
    ): Promise<void> => {
      await this.sleep(ms);
    };

    const findOptional =
      async (
        strategy: string,
        selector: string,
      ): Promise<
        { elementId: string } | null
      > => {

        try {
          return await this.appium
            .findElement(
              strategy,
              selector,
            );
        }
        catch {
          return null;
        }
      };

    const findSearchInput =
      async (): Promise<
        { elementId: string } | null
      > => {

        return (
          await findOptional(
            'id',
            'com.zhiliaoapp.musically:id/htb',
          )
        ) ?? (
          await findOptional(
            'uiautomator',
            'new UiSelector().className("android.widget.EditText")',
          )
        );
      };

    const findSearchButton =
      async (): Promise<
        { elementId: string } | null
      > => {

        return (
          await findOptional(
            'id',
            'com.zhiliaoapp.musically:id/k9z',
          )
        ) ?? (
          await findOptional(
            'uiautomator',
            'new UiSelector().description("Procurar")',
          )
        ) ?? (
          await findOptional(
            'uiautomator',
            'new UiSelector().description("Search")',
          )
        );
      };

    /*
     * A sessao usa noReset=true.
     * Portanto o TikTok pode abrir exatamente na tela
     * deixada pelo teste anterior.
     *
     * Primeiro verificamos se a busca JA esta aberta.
     */
    let searchInput =
      await findSearchInput();

    if (!searchInput) {

      /*
       * Remove apenas popups comuns conhecidos.
       */
      await this.dismissPopups();

      /*
       * Tenta usar a busca na tela atual.
       * Se nao existir, volta gradualmente.
       */
      for (
        let attempt = 0;
        attempt < 4 && !searchInput;
        attempt++
      ) {

        const searchButton =
          await findSearchButton();

        if (searchButton) {

          await this.appium
            .clickElement(
              searchButton.elementId,
            );

          await wait(700);

          searchInput =
            await findSearchInput();

          if (searchInput) {
            break;
          }
        }

        if (attempt < 3) {

          await this.appium
            .pressKey(4);

          await wait(500);

          searchInput =
            await findSearchInput();
        }
      }
    }

    /*
     * Recuperacao adicional:
     * vai para Home e tenta abrir a busca.
     *
     * Isso e apenas navegacao.
     */
    if (!searchInput) {

      const homeButton =
        await findOptional(
          'id',
          'com.zhiliaoapp.musically:id/olw',
        );

      if (homeButton) {

        await this.appium
          .clickElement(
            homeButton.elementId,
          );

        await wait(800);

        const searchButton =
          await findSearchButton();

        if (searchButton) {

          await this.appium
            .clickElement(
              searchButton.elementId,
            );

          await wait(700);

          searchInput =
            await findSearchInput();
        }
      }
    }

    if (!searchInput) {

      throw new Error(
        'TikTok search UI could not be reached safely',
      );
    }

    /*
     * Preenche a pesquisa.
     */
    await this.appium
      .clickElement(
        searchInput.elementId,
      );

    await this.appium
      .clearElement(
        searchInput.elementId,
      );

    await this.appium
      .setClipboard(
        `@${normalizedUsername}`,
      );

    // Android KEYCODE_PASTE
    await this.appium
      .pressKey(279);

    await wait(500);

    /*
     * Executa pesquisa.
     */
    const submit =
      await findOptional(
        'id',
        'com.zhiliaoapp.musically:id/tv_search_textview',
      );

    if (submit) {

      await this.appium
        .clickElement(
          submit.elementId,
        );
    }
    else {

      // ENTER
      await this.appium
        .pressKey(66);
    }

    await wait(2200);

    /*
     * Se o TikTok mostrar abas de resultado, preferimos a aba
     * de usuarios/contas antes de tocar no resultado.
     */
    const userTabSelectors = [
      'new UiSelector().textContains("Usu")',
      'new UiSelector().textContains("User")',
      'new UiSelector().textContains("Pessoas")',
      'new UiSelector().textContains("People")',
      'new UiSelector().textContains("Conta")',
      'new UiSelector().textContains("Account")',
    ];

    for (
      const selector of userTabSelectors
    ) {

      const tab =
        await findOptional(
          'uiautomator',
          selector,
        );

      if (tab) {

        await this.appium
          .clickElement(
            tab.elementId,
          );

        await wait(1200);
        break;
      }
    }

    /*
     * Usa o parser XML compartilhado e coberto por testes.
     * Ele ignora o campo de pesquisa, exige o username exato
     * e preserva os mesmos sinais de prioridade do fluxo anterior.
     */
    const resultsSource =
      await this.appium
        .getPageSource();

    const {
      candidate,
      mentions,
    } =
      findTikTokProfileSearchCandidate(
        resultsSource,
        normalizedUsername,
      );

    if (!candidate) {
      throw new Error(
        `Exact TikTok username not found: @${normalizedUsername}. XML matches: ${JSON.stringify(mentions)}`,
      );
    }

    if (!candidate.bounds) {
      throw new Error(
        `TikTok username found but bounds unavailable: @${normalizedUsername}`,
      );
    }

    /*
     * O TextView do username nem sempre e o elemento clicavel.
     * O ponto de toque vem dos bounds do username exato encontrado,
     * com apenas um clamp horizontal de seguranca.
     */
    const screen =
      await this.getScreenSize();

    const tapPoint =
      getTikTokProfileTapPoint(
        candidate.bounds,
        screen.width,
      );

    await this.appium
      .tap(
        tapPoint.x,
        tapPoint.y,
      );

    await wait(1800);

    /*
     * Confirma que saimos da tela de busca e que
     * o username esta presente na pagina aberta.
     */
    const profileSource =
      await this.appium
        .getPageSource();

    const profileLower =
      profileSource
        .toLocaleLowerCase(
          'pt-BR',
        );

    if (
      profileLower.includes(
        'com.zhiliaoapp.musically:id/htb',
      )
    ) {
      throw new Error(
        `TikTok search result was found but profile did not open: @${normalizedUsername}`,
      );
    }

    if (
      !tikTokProfileSourceMatchesUsername(
        profileSource,
        normalizedUsername,
      )
    ) {
      throw new Error(
        `TikTok profile identity could not be confirmed: @${normalizedUsername}`,
      );
    }

    return true;
  }
  private getTikTokCommentPolicy():
    TikTokCommentPolicyConfig {
    const configured =
      this.config.content
        .commentPolicy;

    if (configured) {
      return configured;
    }

    return {
      friendsOnly: false,
      requireVideoContext: true,
      minLength: 8,
      maxEmojis: 2,
      stylePreset: 'natural',
      previewOnly: false,
      requiredKeywords: [],
      excludedKeywords: [],
      keywordMatchMode: 'any',
      requiredHashtags: [],
      excludedHashtags: [],
      hashtagMatchMode: 'any',
      allowedProfiles: [],
      blockedProfiles: [],
      profileCooldownHours: 12,
      duplicateVideoWindowHours: 72,
      maxCommentsPerProfilePerDay: 2,
      avoidRecentCommentSimilarity: true,
      similarityThreshold: 0.8,
      recentCommentComparisonCount: 20,
      followExchange: {
        enabled: false,
        indicatorPhrases: [
          'sigo de volta',
          'sigo todos de volta',
          'segue que sigo',
          'seguindo de volta',
          'apoiando',
          'apoio por aqui',
          'garotas apoiam garotas',
          'follow back',
          'sdv',
        ],
        sampleSize: 15,
        maxScrolls: 3,
        minMatchedComments: 3,
        minConfidence: 0.15,
        commentEnabled: true,
        commentTemplates: [
          'Sigo todos de volta 💕',
          'Retribuo todos 🤝',
          'Apoiando por aqui ✨',
        ],
        useAiVariation: false,
        replaceNormalComment: true,
        bypassNormalContentFilters: true,
        likeCommentsEnabled: false,
        maxCommentLikesPerVideo: 3,
        dailyCommentLikeLimit: 10,
        likeOnlyMatchingSignals: true,
        excludeCreatorComments: true,
      },
    };
  }

  private async getTikTokCurrentVideoContext():
    Promise<TikTokVideoContext> {
    const source =
      await this.appium
        .getPageSource();

    return extractTikTokVideoContextFromXml(
      source,
    );
  }

  private async inspectTikTokCurrentCreatorRelationship(
    beforeContext:
      TikTokVideoContext,
  ): Promise<{
    relationship:
      TikTokRelationshipState;
    username:
      string | null;
    restored:
      boolean;
    restoredContext:
      TikTokVideoContext | null;
  }> {
    let profileOpened =
      false;

    let relationship:
      TikTokRelationshipState =
        'unknown';

    let username =
      beforeContext
        .creatorUsername;

    try {
      let profileEntry;

      try {
        profileEntry =
          await this.appium
            .findElement(
              'id',
              'com.zhiliaoapp.musically:id/user_avatar',
            );
      }
      catch {
        profileEntry =
          await this.appium
            .findElement(
              'id',
              'com.zhiliaoapp.musically:id/title',
            );
      }

      await this.appium
        .clickElement(
          profileEntry.elementId,
        );

      profileOpened =
        true;

      await this.sleep(
        1200,
      );

      const profileSource =
        await this.appium
          .getPageSource();

      const profileUsername =
        extractTikTokProfileUsername(
          profileSource,
        );

      if (
        beforeContext
          .creatorUsername &&
        profileUsername &&
        beforeContext
          .creatorUsername
          .toLocaleLowerCase(
            'pt-BR',
          ) !==
        profileUsername
          .toLocaleLowerCase(
            'pt-BR',
          )
      ) {
        throw new Error(
          `TikTok creator identity changed during friends check: expected @${beforeContext.creatorUsername}, got @${profileUsername}`,
        );
      }

      username =
        profileUsername ??
        username;

      relationship =
        classifyTikTokRelationshipFromXml(
          profileSource,
        );
    }
    finally {
      if (
        profileOpened
      ) {
        try {
          await this.appium
            .pressKey(4);

          await this.sleep(
            900,
          );
        }
        catch {
          return {
            relationship,
            username,
            restored:
              false,
            restoredContext:
              null,
          };
        }
      }
    }

    let restoredContext:
      TikTokVideoContext;

    try {
      restoredContext =
        await this
          .getTikTokCurrentVideoContext();
    }
    catch {
      return {
        relationship,
        username,
        restored:
          false,
        restoredContext:
          null,
      };
    }

    const contextForMatch = {
      ...beforeContext,
      creatorUsername:
        beforeContext
          .creatorUsername ??
        username,
    };

    return {
      relationship,
      username,
      restored:
        tikTokVideoContextsMatch(
          contextForMatch,
          restoredContext,
        ),
      restoredContext,
    };
  }

  private skipTikTokComment(
    reason: string,
    details?: Record<string, unknown>,
  ): void {
    this.stats.commentSkips += 1;
    this.log(
      'comment',
      'skipped',
      reason,
      details ? JSON.stringify(details) : undefined,
    );
  }

  private async openTikTokCommentsPanel(): Promise<void> {
    try {
      await this.appium.findElement(
        'id',
        'com.zhiliaoapp.musically:id/ejc',
      );
      return;
    }
    catch {
      // Open below.
    }

    let button;
    try {
      button = await this.appium.findElement(
        'uiautomator',
        'new UiSelector().descriptionStartsWith("Leia ou adicione comentários")',
      );
    }
    catch {
      button = await this.appium.findElement(
        'uiautomator',
        'new UiSelector().descriptionContains("comment")',
      );
    }

    await this.appium.clickElement(button.elementId);
    await this.sleep(1200);

    try {
      await this.appium.findElement(
        'id',
        'com.zhiliaoapp.musically:id/ejc',
      );
    }
    catch {
      await this.appium.findElement(
        'uiautomator',
        'new UiSelector().className("android.widget.EditText")',
      );
    }
  }

  private async closeTikTokCommentsPanel(): Promise<void> {
    try {
      await this.appium.pressKey(4);
      await this.sleep(700);
    }
    catch {
      // Best effort return to feed.
    }
  }

  private async sampleTikTokComments(
    sampleSize: number,
    maxScrolls: number,
  ): Promise<TikTokVisibleComment[]> {
    const collected = new Map<string, TikTokVisibleComment>();
    const scans = Math.max(1, maxScrolls + 1);

    for (let scan = 0; scan < scans; scan++) {
      const source = await this.appium.getPageSource();
      const visible = extractVisibleTikTokCommentsFromXml(source);

      for (const comment of visible) {
        if (!collected.has(comment.key)) {
          collected.set(comment.key, comment);
        }
        if (collected.size >= sampleSize) break;
      }

      if (collected.size >= sampleSize || scan === scans - 1) break;

      await this.swipeRelative(
        0.5,
        0.76,
        0.38,
        450,
      );
      await this.sleep(850);
    }

    return [...collected.values()].slice(0, sampleSize);
  }

  private async resetTikTokCommentsPanel(): Promise<void> {
    await this.closeTikTokCommentsPanel();
    await this.openTikTokCommentsPanel();
  }

  private async recordTikTokCommentHistory(
    entry: Omit<TikTokCommentHistoryEntry, 'timestamp'>,
  ): Promise<void> {
    try {
      await this.commentHistoryStore.record({
        ...entry,
        timestamp: new Date().toISOString(),
      });
    }
    catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : String(error);
      this.log(
        'system',
        'info',
        `TikTok comment history persistence skipped: ${message}`,
      );
    }
  }

  private async postTikTokCommentInOpenPanel(
    commentText: string,
  ): Promise<void> {
    let commentInput;

    try {
      commentInput = await this.appium.findElement(
        'id',
        'com.zhiliaoapp.musically:id/ejc',
      );
    }
    catch {
      commentInput = await this.appium.findElement(
        'uiautomator',
        'new UiSelector().className("android.widget.EditText")',
      );
    }

    await this.appium.clickElement(commentInput.elementId);
    await this.appium.clearElement(commentInput.elementId);
    await this.sleep(300);
    await this.appium.setClipboard(commentText);
    await this.appium.pressKey(279);
    await this.sleep(800);

    const source = await this.appium.getPageSource();

    const inputLine = source
      .split(/\r?\n/)
      .find(line =>
        line.includes('com.zhiliaoapp.musically:id/ejc'));

    if (!inputLine) {
      throw new Error('TikTok comment field could not be validated');
    }

    const sendLine = source
      .split(/\r?\n/)
      .find(line =>
        line.includes('com.zhiliaoapp.musically:id/d1u'));

    if (!sendLine || !sendLine.includes('enabled="true"')) {
      throw new Error('TikTok comment send button is disabled');
    }

    const sendButton = await this.appium.findElement(
      'id',
      'com.zhiliaoapp.musically:id/d1u',
    );

    await this.appium.clickElement(sendButton.elementId);
    await this.sleep(1500);
  }

  private async resolveTikTokGeneratedComment(
    videoContext: TikTokVideoContext,
    policy: TikTokCommentPolicyConfig,
    kind: TikTokCommentKind,
    detection?: TikTokFollowExchangeDetection,
  ): Promise<string | null> {
    const history = this.commentHistoryStore.list(500);
    const attempts = kind === 'normal' ? 2 : 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      let text: string;

      if (
        kind === 'follow_exchange' &&
        !policy.followExchange.useAiVariation
      ) {
        text = pickTikTokFollowExchangeTemplate(
          policy.followExchange.commentTemplates,
        );
      }
      else {
        text = await this.generateComment(
          'tiktok',
          videoContext,
          kind === 'follow_exchange'
            ? {
                followExchange: true,
                template: pickTikTokFollowExchangeTemplate(
                  policy.followExchange.commentTemplates,
                ),
                signals: detection?.matchedPhrases ?? [],
              }
            : undefined,
        );
      }

      if (text === 'SKIP_COMMENT') return null;

      const validation = validateGeneratedTikTokComment(
        text,
        this.config.content.maxLength,
        policy,
        history,
      );

      if (validation.valid) return text;

      this.log(
        'comment',
        'info',
        `Generated TikTok comment rejected by policy: ${validation.reasons.join('; ')}`,
      );

      if (
        kind === 'follow_exchange' &&
        policy.followExchange.useAiVariation
      ) {
        const fallback = pickTikTokFollowExchangeTemplate(
          policy.followExchange.commentTemplates,
        );
        const fallbackValidation = validateGeneratedTikTokComment(
          fallback,
          this.config.content.maxLength,
          policy,
          history,
        );
        if (fallbackValidation.valid) return fallback;
      }
    }

    return null;
  }

  private async publishOrPreviewTikTokComment(
    commentText: string,
    videoContext: TikTokVideoContext,
    policy: TikTokCommentPolicyConfig,
    kind: TikTokCommentKind,
    panelAlreadyOpen: boolean,
    metadata: Record<string, unknown> = {},
  ): Promise<boolean> {
    const videoKey = buildTikTokVideoKey(videoContext);
    const creator = videoContext.creatorUsername
      ? `@${videoContext.creatorUsername}`
      : 'creator unknown';

    if (this.config.testMode || policy.previewOnly) {
      this.log(
        'comment',
        'success',
        `${this.config.testMode ? '[TEST]' : '[PREVIEW]'} Would post TikTok ${kind === 'follow_exchange' ? 'follow-exchange ' : ''}comment on ${creator}: "${commentText}"`,
        JSON.stringify(metadata),
      );

      await this.recordTikTokCommentHistory({
        status: 'preview',
        kind,
        videoKey,
        creatorUsername: videoContext.creatorUsername,
        commentText,
        commentKey: null,
        metadata,
      });

      return false;
    }

    if (!panelAlreadyOpen) {
      await this.openTikTokCommentsPanel();
    }

    await this.postTikTokCommentInOpenPanel(commentText);

    await this.recordTikTokCommentHistory({
      status: 'published',
      kind,
      videoKey,
      creatorUsername: videoContext.creatorUsername,
      commentText,
      commentKey: null,
      metadata,
    });

    this.log(
      'comment',
      'success',
      `Posted TikTok ${kind === 'follow_exchange' ? 'follow-exchange ' : ''}comment: "${commentText.slice(0, 80)}"`,
    );

    return true;
  }

  private async engageTikTokFollowExchangeCommentLikes(
    videoContext: TikTokVideoContext,
    policy: TikTokCommentPolicyConfig,
    initialComments: TikTokVisibleComment[],
  ): Promise<number> {
    const config = policy.followExchange;

    if (
      !config.likeCommentsEnabled ||
      config.maxCommentLikesPerVideo <= 0 ||
      config.dailyCommentLikeLimit <= 0
    ) {
      return 0;
    }

    const history = this.commentHistoryStore.list(1500);
    const today = new Date().toISOString().slice(0, 10);

    const likedToday = history.filter(entry =>
      entry.status === 'comment_like' &&
      entry.timestamp.slice(0, 10) === today).length;

    const remainingDaily = Math.max(
      0,
      config.dailyCommentLikeLimit - likedToday,
    );

    const target = Math.min(
      config.maxCommentLikesPerVideo,
      remainingDaily,
    );

    if (target <= 0) {
      this.log(
        'comment',
        'skipped',
        'Follow-exchange comment likes skipped: daily comment-like limit reached',
      );
      return 0;
    }

    const alreadyLiked = new Set(
      history
        .filter(entry =>
          entry.status === 'comment_like' &&
          entry.commentKey)
        .map(entry => entry.commentKey!),
    );

    const creator = videoContext.creatorUsername
      ?.toLocaleLowerCase('pt-BR') ?? null;

    const eligible = (
      comments: TikTokVisibleComment[],
    ): TikTokVisibleComment[] =>
      comments.filter(comment => {
        if (!comment.likeBounds || alreadyLiked.has(comment.key)) return false;

        if (
          config.excludeCreatorComments &&
          creator &&
          comment.username?.toLocaleLowerCase('pt-BR') === creator
        ) {
          return false;
        }

        if (config.likeOnlyMatchingSignals) {
          return commentMatchesFollowExchangeSignals(
            comment.text,
            config.indicatorPhrases,
          ).matched;
        }

        return true;
      });

    if (this.config.testMode || policy.previewOnly) {
      const preview = eligible(initialComments).slice(0, target);

      for (const comment of preview) {
        this.log(
          'comment',
          'success',
          `${this.config.testMode ? '[TEST]' : '[PREVIEW]'} Would like follow-exchange comment: "${comment.text}"`,
        );
      }

      return preview.length;
    }

    await this.resetTikTokCommentsPanel();

    let liked = 0;
    const scans = Math.max(1, config.maxScrolls + 1);

    for (
      let scan = 0;
      scan < scans && liked < target;
      scan++
    ) {
      const source = await this.appium.getPageSource();
      const visible = eligible(
        extractVisibleTikTokCommentsFromXml(source),
      );

      for (const comment of visible) {
        if (liked >= target || !comment.likeBounds) break;

        const point = centerOfTikTokBounds(comment.likeBounds);
        await this.appium.tap(point.x, point.y);
        await this.sleep(650);

        alreadyLiked.add(comment.key);
        liked += 1;
        this.stats.commentLikes += 1;

        await this.recordTikTokCommentHistory({
          status: 'comment_like',
          kind: 'follow_exchange',
          videoKey: buildTikTokVideoKey(videoContext),
          creatorUsername: videoContext.creatorUsername,
          commentText: comment.text,
          commentKey: comment.key,
          metadata: {
            username: comment.username,
          },
        });

        this.log(
          'comment',
          'success',
          `Liked follow-exchange comment: "${comment.text.slice(0, 80)}"`,
        );
      }

      if (liked >= target || scan === scans - 1) break;

      await this.swipeRelative(
        0.5,
        0.76,
        0.38,
        450,
      );
      await this.sleep(850);
    }

    return liked;
  }

  private async executeTikTokCommentAction(): Promise<void> {
    const policy = this.getTikTokCommentPolicy();
    let videoContext = await this.getTikTokCurrentVideoContext();

    const base = evaluateTikTokCommentBaseEligibility(
      videoContext,
      policy,
      this.commentHistoryStore.list(500),
    );

    if (!base.allowed) {
      this.skipTikTokComment(
        `TikTok comment skipped: ${base.reasons.join('; ')}`,
      );
      return;
    }

    if (policy.friendsOnly) {
      const inspection = await this.inspectTikTokCurrentCreatorRelationship(
        videoContext,
      );

      if (inspection.relationship !== 'friends') {
        this.skipTikTokComment(
          `TikTok comment skipped: creator relationship is ${inspection.relationship}, friends required`,
        );
        return;
      }

      if (!inspection.restored || !inspection.restoredContext) {
        this.skipTikTokComment(
          'TikTok comment skipped: could not safely return to the same video after friends check',
        );
        return;
      }

      videoContext = {
        ...inspection.restoredContext,
        creatorUsername:
          inspection.username ??
          inspection.restoredContext.creatorUsername,
      };
    }

    let panelOpen = false;

    try {
      const exchangeConfig = policy.followExchange;
      let exchangeDetection: TikTokFollowExchangeDetection | null = null;
      let sampledComments: TikTokVisibleComment[] = [];

      if (exchangeConfig.enabled) {
        await this.openTikTokCommentsPanel();
        panelOpen = true;

        sampledComments = await this.sampleTikTokComments(
          exchangeConfig.sampleSize,
          exchangeConfig.maxScrolls,
        );

        exchangeDetection = detectTikTokFollowExchange(
          sampledComments.map(comment => comment.text),
          videoContext,
          exchangeConfig,
        );

        this.log(
          'comment',
          'info',
          `Follow-exchange scan: detected=${exchangeDetection.detected} confidence=${Math.round(exchangeDetection.confidence * 100)}% matches=${exchangeDetection.matchedComments}/${exchangeDetection.sampledComments}`,
          JSON.stringify({
            matchedPhrases: exchangeDetection.matchedPhrases,
            videoMatchedPhrases: exchangeDetection.videoMatchedPhrases,
          }),
        );

        if (exchangeDetection.detected) {
          this.stats.followExchangeDetections += 1;

          if (!exchangeConfig.bypassNormalContentFilters) {
            const content = evaluateTikTokCommentContentFilters(
              videoContext,
              policy,
            );

            if (!content.allowed) {
              this.skipTikTokComment(
                `Follow-exchange interaction skipped by normal content filters: ${content.reasons.join('; ')}`,
              );
              return;
            }
          }

          await this.engageTikTokFollowExchangeCommentLikes(
            videoContext,
            policy,
            sampledComments,
          );

          if (exchangeConfig.commentEnabled) {
            const specialText = await this.resolveTikTokGeneratedComment(
              videoContext,
              policy,
              'follow_exchange',
              exchangeDetection,
            );

            if (!specialText) {
              this.skipTikTokComment(
                'Follow-exchange comment skipped: no generated/template text passed policy validation',
              );
            }
            else {
              await this.publishOrPreviewTikTokComment(
                specialText,
                videoContext,
                policy,
                'follow_exchange',
                panelOpen,
                {
                  confidence: exchangeDetection.confidence,
                  matchedComments: exchangeDetection.matchedComments,
                  sampledComments: exchangeDetection.sampledComments,
                  matchedPhrases: exchangeDetection.matchedPhrases,
                },
              );
            }
          }

          if (exchangeConfig.replaceNormalComment) {
            return;
          }
        }
      }

      if (
        policy.requireVideoContext &&
        !hasMeaningfulTikTokVideoContext(videoContext)
      ) {
        this.skipTikTokComment(
          'TikTok comment skipped: current video has no reliable caption/hashtag context',
        );
        return;
      }

      const content = evaluateTikTokCommentContentFilters(
        videoContext,
        policy,
      );

      if (!content.allowed) {
        this.skipTikTokComment(
          `TikTok comment skipped by content filter: ${content.reasons.join('; ')}`,
        );
        return;
      }

      const commentText = await this.resolveTikTokGeneratedComment(
        videoContext,
        policy,
        'normal',
      );

      if (!commentText) {
        this.skipTikTokComment(
          'TikTok comment skipped: AI/context did not produce a policy-compliant comment',
        );
        return;
      }

      if (
        !panelOpen &&
        !this.config.testMode &&
        !policy.previewOnly
      ) {
        await this.openTikTokCommentsPanel();
        panelOpen = true;
      }

      await this.publishOrPreviewTikTokComment(
        commentText,
        videoContext,
        policy,
        'normal',
        panelOpen,
        {
          caption: videoContext.caption,
          hashtags: videoContext.hashtags,
          friendsOnly: policy.friendsOnly,
        },
      );
    }
    catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : String(err);

      this.log(
        'comment',
        'error',
        'TikTok comment failed',
        msg,
      );

      throw err;
    }
    finally {
      if (panelOpen) {
        await this.closeTikTokCommentsPanel();
      }
    }
  }

  // ── AI Comment Generation ─────────────────────────────────────────

  private async generateComment(
    platform:
      MobileApp,
    tikTokContext?:
      TikTokVideoContext,
    options?: {
      followExchange?: boolean;
      template?: string;
      signals?: string[];
    },
  ): Promise<string> {
    const {
      tone,
      language,
      topics,
      maxLength,
    } =
      this.config.content;

    const platformNames:
      Record<
        MobileApp,
        string
      > = {
        tiktok:
          'TikTok',
        twitter:
          'X (Twitter)',
        facebook:
          'Facebook',
      };

    const commentPolicy =
      this.getTikTokCommentPolicy();

    const styleInstruction =
      platform ===
        'tiktok'
        ? getTikTokCommentStyleInstruction(
            commentPolicy.stylePreset,
          )
        : '';

    const specialInstruction =
      options?.followExchange
        ? [
            'This video was classified as mutual-support/follow-exchange content from visible comments.',
            `Base phrase/template: ${options.template ?? 'Sigo todos de volta'}`,
            `Detected signals: ${options.signals?.join(', ') || 'follow exchange'}`,
            'Keep the same mutual-support intent. Do not make unrelated claims.',
          ].join('\n')
        : '';

    const contextBlock =
      platform ===
        'tiktok' &&
      tikTokContext
        ? [
            'CURRENT VIDEO CONTEXT (read from the TikTok Android UI):',
            `Creator: ${tikTokContext.creatorUsername ? '@' + tikTokContext.creatorUsername : 'unknown'}`,
            `Caption/description: ${tikTokContext.caption ?? 'not available'}`,
            `Hashtags: ${tikTokContext.hashtags.length > 0 ? tikTokContext.hashtags.map(tag => '#' + tag).join(' ') : 'none visible'}`,
            `Other visible text: ${tikTokContext.snippets.slice(0, 6).join(' | ') || 'none'}`,
          ]
            .join(
              '\n',
            )
        : '';

    const systemPrompt =
      `You are writing one social-media comment for ${platformNames[platform]}.
Write in ${language}. Tone: ${tone}.
Preferred themes, only when they genuinely match the visible content: ${topics.join(', ')}.

Rules:
- Minimum ${platform === 'tiktok' ? commentPolicy.minLength : 1} characters
- Maximum ${maxLength} characters
- Sound natural, specific and useful
- Maximum ${platform === 'tiktok' ? commentPolicy.maxEmojis : 2} emojis
${styleInstruction}
- Never mention automation, bots or AI
- Never use generic filler such as "Nice!" or "Great post!"
- For TikTok, use ONLY facts present in CURRENT VIDEO CONTEXT
- Never invent what is visible, spoken, sold, demonstrated or claimed
- If the TikTok context is insufficient to write a relevant comment, output exactly SKIP_COMMENT
- Output ONLY the comment text or SKIP_COMMENT

${contextBlock}

${specialInstruction}`;

    try {
      const response =
        await this.aiClient
          .chat({
            systemPrompt,
            messages: [
              {
                role:
                  'user',
                content:
                  platform ===
                    'tiktok'
                    ? 'Write one short comment that is directly relevant to the current TikTok video context.'
                    : `Write a short, engaging ${platform === 'twitter' ? 'reply' : 'comment'} about ${topics[Math.floor(Math.random() * topics.length)]}:`,
              },
            ],
            maxTokens:
              Math.ceil(
                maxLength /
                  2,
              ),
            temperature:
              0.75,
            isSubAgent:
              true,
          });

      let text =
        response.content
          .trim();

      if (
        (
          text.startsWith(
            '"',
          ) &&
          text.endsWith(
            '"',
          )
        ) ||
        (
          text.startsWith(
            "'",
          ) &&
          text.endsWith(
            "'",
          )
        )
      ) {
        text =
          text.slice(
            1,
            -1,
          );
      }

      if (
        platform ===
          'tiktok' &&
        text
          .trim()
          .toUpperCase() ===
          'SKIP_COMMENT'
      ) {
        return 'SKIP_COMMENT';
      }

      return text.slice(
        0,
        maxLength,
      );
    }
    catch (
      err:
        unknown
    ) {
      const msg =
        err instanceof Error
          ? err.message
          : String(err);

      this.log(
        'system',
        'error',
        `AI generation failed: ${msg}`,
      );

      throw new Error(
        `Content generation failed: ${msg}`,
      );
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async getScreenSize(): Promise<{ width: number; height: number }> {
    if (this.screenSize) return this.screenSize;

    try {
      const detected = await this.appium.getWindowSize();
      this.screenSize = detected;

      this.log(
        'system',
        'info',
        `Detected screen size: ${detected.width}x${detected.height}`
      );

      return detected;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      const fallback = { width: 1080, height: 2400 };
      this.screenSize = fallback;

      this.log(
        'system',
        'info',
        `Screen size detection failed, using 1080x2400 fallback: ${msg}`
      );

      return fallback;
    }
  }

  private async tapRelative(xRatio: number, yRatio: number): Promise<void> {
    const { width, height } = await this.getScreenSize();

    const x = Math.round(width * xRatio);
    const y = Math.round(height * yRatio);

    await this.appium.tap(x, y);
  }

  private async swipeRelative(
    xRatio: number,
    startYRatio: number,
    endYRatio: number,
    duration: number
  ): Promise<void> {
    const { width, height } = await this.getScreenSize();

    const x = Math.round(width * xRatio);
    const startY = Math.round(height * startYRatio);
    const endY = Math.round(height * endYRatio);

    await this.appium.swipe(
      x,
      startY,
      x,
      endY,
      duration
    );
  }
  private async dismissPopups(): Promise<void> {
    const popupTexts = [
      'Allow',
      'OK',
      'Continue',
      'Got it',
      'Not now',
      'Skip',
      'Maybe later',

      // pt-BR
      'Permitir',
      'Continuar',
      'Entendi',
      'Agora não',
      'Pular',
      'Talvez mais tarde',
    ];

    try {
      const source = await this.appium.getPageSource();

      for (const text of popupTexts) {
        if (!source.includes(text)) continue;

        try {
          const el = await this.appium.findElement(
            'uiautomator',
            `new UiSelector().text("${text}")`
          );

          const displayed = await this.appium.isElementDisplayed(el.elementId);

          if (displayed) {
            await this.appium.clickElement(el.elementId);
            this.log('system', 'info', `Dismissed popup: ${text}`);
            await this.sleep(500);
          }
        } catch {
          // Element changed/disappeared between source read and click.
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('system', 'info', `Popup scan skipped: ${msg}`);
    }
  }
  private incrementStat(action: MobileActionType): void {
    switch (action) {
      case 'like': this.stats.likes++; break;
      case 'comment': this.stats.comments++; break;
      case 'follow': this.stats.follows++; break;
      case 'scroll': this.stats.scrolls++; break;
      case 'share': this.stats.shares++; break;
      case 'retweet': this.stats.retweets++; break;
      case 'reply': this.stats.replies++; break;
    }
  }

  private pickNextAction(): MobileActionType | null {
    const now = Date.now();
    const available: { action: MobileActionType; priority: number }[] = [];
    for (const action of this.config.actions) {
      const schedule = this.config.schedule[action];
      if (!schedule) continue;
      const lastTime = this.lastActionTimes.get(action) || 0;
      const dailyCount = this.dailyActionCounts.get(action) || 0;
      if (dailyCount >= schedule.dailyLimit) continue;
      const elapsed = now - lastTime;
      const intervalMs = schedule.intervalMinutes * 60_000;
      if (elapsed < intervalMs) continue;
      available.push({ action, priority: elapsed / intervalMs });
    }
    if (available.length === 0) return null;
    const totalPriority = available.reduce((sum, a) => sum + a.priority, 0);
    let rand = Math.random() * totalPriority;
    for (const { action, priority } of available) {
      rand -= priority;
      if (rand <= 0) return action;
    }
    return available[0].action;
  }

  private isWithinActiveHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    const hours = isWeekend ? this.config.activeHours.weekend : this.config.activeHours.weekday;
    return hour >= hours.start && hour < hours.end;
  }

  private updateHourlyCount(): void {
    const now = Date.now();
    const lastAction = this.stats.lastActionAt ? new Date(this.stats.lastActionAt).getTime() : 0;
    if (now - lastAction > 3600_000) this.stats.actionsThisHour = 0;
  }

  private resetDailyCountsIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyResetDate !== today) { this.dailyResetDate = today; this.dailyActionCounts.clear(); }
  }

  private freshStats(): MobileAgentStats {
    return {
      likes: 0,
      comments: 0,
      follows: 0,
      scrolls: 0,
      shares: 0,
      retweets: 0,
      replies: 0,
      errors: 0,
      totalActions: 0,
      actionsThisHour: 0,
      commentLikes: 0,
      followExchangeDetections: 0,
      commentSkips: 0,
      lastActionAt: null,
    };
  }

  private log(action: MobileActionType | 'system', status: MobileAgentLogEntry['status'], message: string, details?: string): void {
    const entry: MobileAgentLogEntry = { timestamp: new Date().toISOString(), action, status, message, details };
    this.logs.push(entry);
    if (this.logs.length > 500) this.logs = this.logs.slice(-500);
    logger.info(`[MobileAgent] ${this.config.app}:${action}: ${message}`, { id: this.config.id, status });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

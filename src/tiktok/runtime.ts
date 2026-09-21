import logger from '../utils/logger.js';

import {
  createFollowBackSchedulerHandler,
} from './follow-back-handler.js';

import {
  TikTokProviderRegistry,
  tikTokProviderRegistry,
} from './provider-registry.js';

import {
  tikTokRelationshipManager,
  TikTokRelationshipManager,
} from './relationship-manager.js';

import {
  runTikTokScheduler,
  type TikTokSchedulerRunResult,
} from './scheduler.js';

import {
  createLiveAndroidTikTokProvider,
} from './providers/live-android-tiktok-provider.js';

import type {
  TikTokAutomationProvider,
} from './providers/tiktok-provider.js';

export interface TikTokRuntimeOptions {
  registry?: TikTokProviderRegistry;
  relationshipManager?: TikTokRelationshipManager;
  providers?: TikTokAutomationProvider[];
  intervalMs?: number;
  schedulerRunner?: typeof runTikTokScheduler;
}

export type TikTokRuntimeState =
  | 'stopped'
  | 'running'
  | 'paused';

export interface TikTokRuntimeStatus {
  state: TikTokRuntimeState;
  started: boolean;
  paused: boolean;
  tickActive: boolean;
  intervalMs: number;
  registeredProviders: string[];
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastResult: TikTokSchedulerRunResult | null;
  lastError: string | null;
}

const DEFAULT_TIKTOK_RUNTIME_INTERVAL_MS =
  60_000;

export class TikTokRuntime {

  private readonly registry:
    TikTokProviderRegistry;

  private readonly relationshipManager:
    TikTokRelationshipManager;

  private readonly providers:
    TikTokAutomationProvider[];

  private readonly intervalMs:
    number;

  private readonly schedulerRunner:
    typeof runTikTokScheduler;

  private timer:
    ReturnType<typeof setInterval> | null =
      null;

  private activeRun:
    Promise<TikTokSchedulerRunResult> | null =
      null;

  private started =
    false;

  private paused =
    false;

  private providersRegistered =
    false;

  private lastRunStartedAt:
    Date | null =
      null;

  private lastRunCompletedAt:
    Date | null =
      null;

  private lastResult:
    TikTokSchedulerRunResult | null =
      null;

  private lastError:
    string | null =
      null;

  constructor(
    options:
      TikTokRuntimeOptions = {},
  ) {
    this.registry =
      options.registry ??
      tikTokProviderRegistry;

    this.relationshipManager =
      options.relationshipManager ??
      tikTokRelationshipManager;

    this.providers =
      options.providers ??
      [
        createLiveAndroidTikTokProvider(),
      ];

    this.intervalMs =
      options.intervalMs ??
      DEFAULT_TIKTOK_RUNTIME_INTERVAL_MS;

    this.schedulerRunner =
      options.schedulerRunner ??
      runTikTokScheduler;
  }

  start(): void {

    if (this.started) {
      return;
    }

    this.ensureProvidersRegistered();

    this.started =
      true;

    this.paused =
      false;

    logger.info(
      'TikTok runtime started',
      {
        providers:
          this.registry.list(),
        intervalMs:
          this.intervalMs,
      },
    );

    this.runInitialTick();

    this.startTimer();
  }

  pause(): void {

    if (
      !this.started ||
      this.paused
    ) {
      return;
    }

    this.paused =
      true;

    this.clearTimer();

    logger.info(
      'TikTok runtime paused',
    );
  }

  resume(): void {

    if (
      !this.started ||
      !this.paused
    ) {
      return;
    }

    this.paused =
      false;

    logger.info(
      'TikTok runtime resumed',
      {
        providers:
          this.registry.list(),
        intervalMs:
          this.intervalMs,
      },
    );

    this.runInitialTick();

    this.startTimer();
  }

  async runOnce(): Promise<TikTokSchedulerRunResult> {

    this.ensureProvidersRegistered();

    if (this.activeRun) {
      return this.activeRun;
    }

    const providerNames =
      this.providers
        .filter(
          provider =>
            provider
              .isAvailable?.() !==
            false,
        )
        .map(
          provider =>
            provider.name,
        );

    const handler =
      createFollowBackSchedulerHandler(
        this.registry,
        this.relationshipManager,
      );

    this.lastRunStartedAt =
      new Date();

    this.lastError =
      null;

    const run =
      this.schedulerRunner({
        providerNames,
        checkFollowBackHandler:
          handler,
      });

    this.activeRun =
      run;

    try {
      const result =
        await run;

      this.lastResult =
        result;

      this.lastRunCompletedAt =
        new Date();

      if (
        result.processed > 0 ||
        result.failed > 0
      ) {
        logger.info(
          'TikTok scheduler tick completed',
          {
            providers:
              providerNames,
            ...result,
          },
        );
      }

      return result;
    }
    catch (error) {
      this.lastRunCompletedAt =
        new Date();

      this.lastError =
        error instanceof Error
          ? error.message
          : String(error);

      throw error;
    }
    finally {
      if (
        this.activeRun ===
          run
      ) {
        this.activeRun =
          null;
      }
    }
  }

  getStatus(): TikTokRuntimeStatus {

    return {
      state:
        !this.started
          ? 'stopped'
          : this.paused
            ? 'paused'
            : 'running',
      started:
        this.started,
      paused:
        this.paused,
      tickActive:
        this.activeRun !==
        null,
      intervalMs:
        this.intervalMs,
      registeredProviders:
        this.registry.list(),
      lastRunStartedAt:
        this.lastRunStartedAt
          ?.toISOString() ??
        null,
      lastRunCompletedAt:
        this.lastRunCompletedAt
          ?.toISOString() ??
        null,
      lastResult:
        this.lastResult,
      lastError:
        this.lastError,
    };
  }

  private runInitialTick(): void {

    void this.runOnce()
      .catch(
        error => {
          logger.warn(
            'TikTok scheduler tick failed',
            {
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          );
        },
      );
  }

  private startTimer(): void {

    this.clearTimer();

    this.timer =
      setInterval(
        () => {
          if (
            !this.started ||
            this.paused
          ) {
            return;
          }

          void this.runOnce()
            .catch(
              error => {
                logger.warn(
                  'TikTok scheduler tick failed',
                  {
                    error:
                      error instanceof Error
                        ? error.message
                        : String(error),
                  },
                );
              },
            );
        },
        this.intervalMs,
      );

    this.timer.unref?.();
  }

  private clearTimer(): void {

    if (!this.timer) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;
  }

  private ensureProvidersRegistered(): void {

    if (this.providersRegistered) {
      return;
    }

    for (
      const provider of
        this.providers
    ) {
      this.registry.register(
        provider,
      );
    }

    this.providersRegistered =
      true;
  }

  async stop(): Promise<void> {

    this.clearTimer();

    if (this.activeRun) {
      await this.activeRun
        .catch(
          () => {},
        );
    }

    for (
      const provider of
        this.providers
    ) {
      const close =
        (
          provider as
            TikTokAutomationProvider & {
              close?: () => Promise<void>;
            }
        ).close;

      if (
        typeof close ===
          'function'
      ) {
        await close
          .call(
            provider,
          )
          .catch(
            error => {
              logger.warn(
                'TikTok provider shutdown failed',
                {
                  provider:
                    provider.name,
                  error:
                    error instanceof Error
                      ? error.message
                      : String(error),
                },
              );
            },
          );
      }
    }

    this.started =
      false;

    this.paused =
      false;

    logger.info(
      'TikTok runtime stopped',
    );
  }

  getRegisteredProviders(): string[] {
    return this.registry
      .list();
  }
}

export function createTikTokRuntime(
  options:
    TikTokRuntimeOptions = {},
): TikTokRuntime {

  return new TikTokRuntime(
    options,
  );
}

let sharedTikTokRuntime:
  TikTokRuntime | null =
    null;

export function getTikTokRuntime(): TikTokRuntime {

  if (!sharedTikTokRuntime) {
    sharedTikTokRuntime =
      createTikTokRuntime();
  }

  return sharedTikTokRuntime;
}

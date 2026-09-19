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
  WebTikTokProvider,
} from './providers/web-tiktok-provider.js';

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

  private providersRegistered =
    false;

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
        new WebTikTokProvider(),
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

    logger.info(
      'TikTok runtime started',
      {
        providers:
          this.registry.list(),
        intervalMs:
          this.intervalMs,
      },
    );

    void this.runOnce()
      .catch(
        error => {
          logger.warn(
            'Initial TikTok scheduler tick failed',
            {
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          );
        },
      );

    this.timer =
      setInterval(
        () => {
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

  async runOnce(): Promise<TikTokSchedulerRunResult> {

    this.ensureProvidersRegistered();

    if (this.activeRun) {
      return this.activeRun;
    }

    const providerNames =
      this.registry.list();

    const handler =
      createFollowBackSchedulerHandler(
        this.registry,
        this.relationshipManager,
      );

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

    if (this.timer) {
      clearInterval(
        this.timer,
      );

      this.timer =
        null;
    }

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

import {
  execFileSync,
} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  resolve,
} from 'node:path';

import {
  MobileAgent,
} from '../actions/mobile/mobile-agent.js';
import {
  closeDatabase,
  initDatabase,
} from '../memory/database.js';
import {
  setTikTokConfigurationValue,
} from '../memory/repositories/tiktok-configuration.js';
import {
  listRecentTikTokActionsAcrossAccounts,
} from '../memory/repositories/tiktok-actions.js';
import {
  listRecentTikTokRelationships,
} from '../memory/repositories/tiktok-relationships.js';
import {
  setTikTokHashtagConfiguration,
} from './hashtag-policy.js';
import {
  cancelTikTokUnfollowReview,
  listPendingTikTokManualReviews,
  resolveTikTokManualDiscoveryReview,
} from './manual-review-service.js';
import {
  checkTikTokProviderRelationship,
  getTikTokProviderControlStatus,
} from './provider-control-service.js';
import {
  tikTokProviderRegistry,
} from './provider-registry.js';
import {
  createLiveAndroidTikTokProvider,
} from './providers/live-android-tiktok-provider.js';
import {
  createTikTokRuntime,
  type TikTokRuntime,
} from './runtime.js';
import {
  buildStandaloneTikTokAgentConfig,
  getEnabledStandaloneTikTokActions,
  parseStandaloneTikTokBotConfig,
  type StandaloneTikTokBotConfig,
} from './standalone-bot-config.js';

export async function runStandaloneTikTokBot(): Promise<void> {
  const projectRoot =
    process.cwd();
  
  const configPath =
    resolve(
      process.env.TIKTOK_BOT_CONFIG ??
        'config/tiktok-bot.json',
    );
  
  const runtimeDir =
    resolve(
      projectRoot,
      '.runtime',
    );
  
  const statusPath =
    resolve(
      runtimeDir,
      'tiktok-bot.status.json',
    );
  
  const stopPath =
    resolve(
      runtimeDir,
      'tiktok-bot.stop',
    );

  const commandPath =
    resolve(
      runtimeDir,
      'tiktok-bot.command.json',
    );
  
  mkdirSync(
    runtimeDir,
    {
      recursive: true,
    },
  );
  
  function readConfig():
    StandaloneTikTokBotConfig {
    if (
      !existsSync(
        configPath,
      )
    ) {
      throw new Error(
        `TikTok bot config not found: ${configPath}`,
      );
    }
  
    const parsed =
      JSON.parse(
        readFileSync(
          configPath,
          'utf8',
        ),
      ) as unknown;
  
    const config =
      parseStandaloneTikTokBotConfig(
        parsed,
      );
  
    const mode =
      process.env
        .TIKTOK_BOT_MODE
        ?.trim()
        .toLowerCase();
  
    if (
      mode === 'real'
    ) {
      return {
        ...config,
        testMode:
          false,
      };
    }
  
    if (
      mode === 'test'
    ) {
      return {
        ...config,
        testMode:
          true,
      };
    }
  
    return config;
  }
  
  function listAuthorizedDevices():
    string[] {
    const output =
      execFileSync(
        'adb',
        [
          'devices',
        ],
        {
          encoding:
            'utf8',
          timeout:
            5000,
        },
      );
  
    return output
      .split(
        /\r?\n/,
      )
      .slice(1)
      .map(
        line =>
          line.trim(),
      )
      .filter(Boolean)
      .map(
        line => {
          const [
            id,
            state,
          ] =
            line.split(
              /\s+/,
            );
  
          return {
            id,
            state,
          };
        },
      )
      .filter(
        device =>
          device.id &&
          device.state ===
            'device',
      )
      .map(
        device =>
          device.id,
      );
  }
  
  function resolveDeviceId(
    requested:
      string | null,
  ): string {
    const devices =
      listAuthorizedDevices();
  
    if (
      requested
    ) {
      if (
        !devices.includes(
          requested,
        )
      ) {
        throw new Error(
          `Configured Android device is not authorized/online: ${requested}. Available: ${devices.join(', ') || 'none'}`,
        );
      }
  
      return requested;
    }
  
    if (
      devices.length === 0
    ) {
      throw new Error(
        'No authorized Android device found. Enable USB debugging or connect ADB over Wi-Fi.',
      );
    }
  
    const usbDevices =
      devices.filter(
        id =>
          !id.includes(':') &&
          !id.includes(
            '_adb-tls-connect._tcp',
          ),
      );
  
    if (
      usbDevices.length === 1
    ) {
      return usbDevices[0];
    }
  
    if (
      devices.length === 1
    ) {
      return devices[0];
    }
  
    throw new Error(
      `Multiple Android devices found. Set deviceId in config/tiktok-bot.json: ${devices.join(', ')}`,
    );
  }
  
  function assertTikTokInstalled(
    deviceId:
      string,
  ): void {
    const output =
      execFileSync(
        'adb',
        [
          '-s',
          deviceId,
          'shell',
          'pm',
          'path',
          'com.zhiliaoapp.musically',
        ],
        {
          encoding:
            'utf8',
          timeout:
            8000,
        },
      );
  
    if (
      !output.includes(
        'package:',
      )
    ) {
      throw new Error(
        'TikTok package com.zhiliaoapp.musically was not found on the selected Android device.',
      );
    }
  }
  
  async function assertAppiumConnected(
    appiumUrl:
      string,
  ): Promise<void> {
    const controller =
      new AbortController();
  
    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        5000,
      );
  
    try {
      const response =
        await fetch(
          `${appiumUrl.replace(/\/$/, '')}/status`,
          {
            signal:
              controller.signal,
          },
        );
  
      if (
        !response.ok
      ) {
        throw new Error(
          `HTTP ${response.status}`,
        );
      }
    }
    catch (
      error:
        unknown
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);
  
      throw new Error(
        `Appium is not reachable at ${appiumUrl}: ${message}`,
      );
    }
    finally {
      clearTimeout(
        timeout,
      );
    }
  }
  
  function processIsAlive(
    pid:
      number,
  ): boolean {
    try {
      process.kill(
        pid,
        0,
      );
  
      return true;
    }
    catch {
      return false;
    }
  }
  
  function assertNoOtherInstance():
    void {
    if (
      !existsSync(
        statusPath,
      )
    ) {
      return;
    }
  
    try {
      const previous =
        JSON.parse(
          readFileSync(
            statusPath,
            'utf8',
          ),
        ) as {
          pid?: unknown;
          state?: unknown;
        };
  
      const pid =
        typeof previous.pid ===
          'number'
          ? previous.pid
          : 0;
  
      if (
        pid > 0 &&
        previous.state !==
          'stopped' &&
        processIsAlive(
          pid,
        )
      ) {
        throw new Error(
          `TikTok bot is already running with PID ${pid}.`,
        );
      }
    }
    catch (
      error:
        unknown
    ) {
      if (
        error instanceof Error &&
        error.message.includes(
          'already running',
        )
      ) {
        throw error;
      }
    }
  }
  
  const config =
    readConfig();
  
  const enabledActions =
    getEnabledStandaloneTikTokActions(
      config,
    );
  
  if (
    enabledActions.length === 0
  ) {
    throw new Error(
      'No TikTok actions are enabled in config/tiktok-bot.json.',
    );
  }
  
  assertNoOtherInstance();
  
  const deviceId =
    resolveDeviceId(
      config.deviceId,
    );
  
  assertTikTokInstalled(
    deviceId,
  );
  
  await assertAppiumConnected(
    config.appiumUrl,
  );
  
  const agentConfig =
    buildStandaloneTikTokAgentConfig(
      config,
      deviceId,
    );
  
  let databaseInitialized =
    false;

  let databaseError:
    string | null =
      null;

  const databaseRequired =
    !config.testMode &&
    enabledActions.includes(
      'follow',
    );

  if (
    databaseRequired ||
    config.automationCore.enabled
  ) {
    try {
      await initDatabase();

      databaseInitialized =
        true;
    }
    catch (
      error:
        unknown
    ) {
      databaseError =
        error instanceof Error
          ? error.message
          : String(error);

      if (
        databaseRequired
      ) {
        throw new Error(
          `Real FOLLOW is enabled, but the persistence database could not be initialized: ${databaseError}`,
        );
      }

      console.warn(
        `TikTok persistent panel data is unavailable: ${databaseError}`,
      );
    }
  }
  
  let automationRuntime:
    TikTokRuntime | null =
      null;

  if (
    databaseInitialized &&
    config.automationCore.enabled
  ) {
    await setTikTokConfigurationValue(
      'follow_back_check_hours',
      config.automationCore
        .followBackCheckHours,
      'Standalone TikTok panel follow-back delay.',
    );

    await setTikTokHashtagConfiguration({
      enabled:
        config.automationCore
          .hashtags.enabled,
      include:
        config.automationCore
          .hashtags.include,
      exclude:
        config.automationCore
          .hashtags.exclude,
      matchMode:
        config.automationCore
          .hashtags.matchMode,
      maxCandidatesPerCycle:
        config.automationCore
          .hashtags.maxCandidatesPerCycle,
    });
  }

  if (
    existsSync(
      stopPath,
    )
  ) {
    rmSync(
      stopPath,
      {
        force: true,
      },
    );
  }
  
  if (
    existsSync(
      commandPath,
    )
  ) {
    rmSync(
      commandPath,
      {
        force: true,
      },
    );
  }

  const agent =
    MobileAgent.createAgent(
      agentConfig,
    );

  if (
    !tikTokProviderRegistry.has(
      'android',
    )
  ) {
    tikTokProviderRegistry.register(
      createLiveAndroidTikTokProvider(),
    );
  }
  
  let shuttingDown =
    false;
  
  let statusTimer:
    ReturnType<typeof setInterval> |
    null =
      null;
  
  let resolveDone:
    (() => void) |
    null =
      null;
  
  const done =
    new Promise<void>(
      resolveDonePromise => {
        resolveDone =
          resolveDonePromise;
      },
    );

  let manualReviews:
    unknown[] =
      [];

  let recentActions:
    unknown[] =
      [];

  let recentRelationships:
    unknown[] =
      [];

  let persistentDataError:
    string | null =
      databaseError;

  let persistentDataUpdatedAt:
    string | null =
      null;

  let lastPersistentRefreshAt =
    0;

  let lastControlResult:
    Record<string, unknown> | null =
      null;

  async function refreshPersistentPanelData(
    force =
      false,
  ): Promise<void> {
    if (
      !databaseInitialized
    ) {
      return;
    }

    const now =
      Date.now();

    if (
      !force &&
      now -
        lastPersistentRefreshAt <
        5_000
    ) {
      return;
    }

    lastPersistentRefreshAt =
      now;

    try {
      const [
        reviews,
        actions,
        relationships,
      ] =
        await Promise.all([
          listPendingTikTokManualReviews(),
          listRecentTikTokActionsAcrossAccounts(
            100,
          ),
          listRecentTikTokRelationships(
            100,
          ),
        ]);

      manualReviews =
        reviews;

      recentActions =
        actions;

      recentRelationships =
        relationships;

      persistentDataError =
        null;

      persistentDataUpdatedAt =
        new Date()
          .toISOString();
    }
    catch (
      error:
        unknown
    ) {
      persistentDataError =
        error instanceof Error
          ? error.message
          : String(error);
    }
  }

  function writeStatus(
    stateOverride?:
      'stopped',
  ): void {
    const current =
      agent.getStatus();
  
    writeFileSync(
      statusPath,
      JSON.stringify(
        {
          pid:
            process.pid,
          mode:
            config.testMode
              ? 'test'
              : 'real',
          state:
            stateOverride ??
            current.state,
          deviceId:
            current.deviceId,
          appiumUrl:
            current.config
              .appiumUrl,
          actions:
            current.config
              .actions,
          startedAt:
            current.startedAt,
          currentAction:
            current.currentAction,
          lastAction:
            current.lastAction,
          lastActionTime:
            current.lastActionTime,
          nextActionTime:
            current.nextActionTime,
          lastError:
            current.lastError,
          stats:
            current.stats,
          commentHistory:
            current.commentHistory,
          followSafety:
            current.followSafety,
          feedNavigation:
            current.feedNavigation,
          logs:
            agent.getLogs(200),
          automationCore:
            automationRuntime
              ? automationRuntime
                  .getStatus()
              : {
                  state:
                    'stopped',
                  started:
                    false,
                  paused:
                    false,
                  tickActive:
                    false,
                  intervalMs:
                    60_000,
                  registeredProviders:
                    [],
                  lastRunStartedAt:
                    null,
                  lastRunCompletedAt:
                    null,
                  lastResult:
                    null,
                  lastError:
                    null,
                },
          followBackCheckHours:
            config.automationCore
              .followBackCheckHours,
          hashtagFilters:
            config.automationCore
              .hashtags,
          providerControl:
            getTikTokProviderControlStatus(),
          database: {
            connected:
              databaseInitialized,
            error:
              persistentDataError,
          },
          manualReviews,
          recentActions,
          recentRelationships,
          persistentDataUpdatedAt,
          lastControlResult,
          updatedAt:
            new Date()
              .toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );
  }
  
  async function handleControlCommand():
    Promise<void> {
    if (
      !existsSync(
        commandPath,
      )
    ) {
      return;
    }

    let payload:
      Record<string, unknown> =
        {};

    try {
      payload =
        JSON.parse(
          readFileSync(
            commandPath,
            'utf8',
          ),
        ) as Record<string, unknown>;
    }
    finally {
      rmSync(
        commandPath,
        {
          force: true,
        },
      );
    }

    const command =
      typeof payload.command ===
        'string'
        ? payload.command
            .trim()
            .toLowerCase()
        : '';

    const requestId =
      typeof payload.requestId ===
        'string'
        ? payload.requestId
        : null;

    const complete =
      (
        success:
          boolean,
        result:
          unknown =
            null,
        error:
          string | null =
            null,
      ): void => {
        lastControlResult = {
          requestId,
          command,
          success,
          result,
          error,
          completedAt:
            new Date()
              .toISOString(),
        };
      };

    const requireDatabase =
      (): void => {
        if (
          !databaseInitialized
        ) {
          throw new Error(
            persistentDataError
              ? `TikTok database is unavailable: ${persistentDataError}`
              : 'TikTok database is unavailable.',
          );
        }
      };

    try {
      if (
        command === 'pause'
      ) {
        agent.pause();
        automationRuntime
          ?.pause();

        complete(
          true,
          {
            state:
              'paused',
          },
        );

        console.log(
          'TIKTOK_BOT_PAUSED=YES',
        );

        return;
      }

      if (
        command === 'resume'
      ) {
        agent.resume();
        automationRuntime
          ?.resume();

        complete(
          true,
          {
            state:
              'running',
          },
        );

        console.log(
          'TIKTOK_BOT_RESUMED=YES',
        );

        return;
      }

      if (
        command ===
          'activate_follow_cooldown'
      ) {
        const configuredHours =
          config.safety
            .followSafety
            .restrictionCooldownHours;

        const requestedHours =
          typeof payload.hours ===
            'number' &&
          Number.isFinite(
            payload.hours,
          )
            ? Math.max(
                1,
                Math.min(
                  24 * 30,
                  Math.floor(
                    payload.hours,
                  ),
                ),
              )
            : configuredHours;

        const result =
          await agent
            .activateTikTokFollowCooldown(
              requestedHours,
              'Manual follow restriction/cooldown activated from standalone panel',
            );

        complete(
          true,
          result,
        );

        return;
      }

      if (
        command ===
          'clear_follow_cooldown'
      ) {
        const result =
          await agent
            .clearTikTokFollowCooldown();

        complete(
          true,
          result,
        );

        return;
      }

      if (
        command === 'run_core_once'
      ) {
        if (
          !automationRuntime
        ) {
          throw new Error(
            'TikTok Automation Core is not running.',
          );
        }

        const result =
          await automationRuntime
            .runOnce();

        await refreshPersistentPanelData(
          true,
        );

        complete(
          true,
          result,
        );

        return;
      }

      if (
        command === 'check_relationship'
      ) {
        const username =
          typeof payload.username ===
            'string'
            ? payload.username
                .trim()
            : '';

        if (!username) {
          throw new Error(
            'username is required for relationship check.',
          );
        }

        const result =
          await checkTikTokProviderRelationship({
            provider:
              'android',
            accountKey:
              agentConfig.id,
            username,
          });

        complete(
          true,
          result,
        );

        return;
      }

      if (
        command ===
          'approve_discovery' ||
        command ===
          'reject_discovery'
      ) {
        requireDatabase();

        const actionId =
          typeof payload.actionId ===
            'string'
            ? payload.actionId
                .trim()
            : '';

        if (!actionId) {
          throw new Error(
            'actionId is required for discovery review.',
          );
        }

        const result =
          await resolveTikTokManualDiscoveryReview(
            actionId,
            command ===
              'approve_discovery'
              ? 'approved'
              : 'rejected',
          );

        await refreshPersistentPanelData(
          true,
        );

        complete(
          true,
          {
            id:
              result.id,
            status:
              result.status,
            type:
              result.type,
            engagementCreated:
              false,
            engagementExecuted:
              false,
          },
        );

        return;
      }

      if (
        command ===
          'cancel_unfollow'
      ) {
        requireDatabase();

        const actionId =
          typeof payload.actionId ===
            'string'
            ? payload.actionId
                .trim()
            : '';

        if (!actionId) {
          throw new Error(
            'actionId is required for UNFOLLOW review.',
          );
        }

        const result =
          await cancelTikTokUnfollowReview(
            actionId,
          );

        await refreshPersistentPanelData(
          true,
        );

        complete(
          true,
          {
            id:
              result.id,
            status:
              result.status,
            type:
              result.type,
            unfollowExecuted:
              false,
          },
        );

        return;
      }

      if (
        command ===
          'refresh_persistent'
      ) {
        requireDatabase();

        await refreshPersistentPanelData(
          true,
        );

        complete(
          true,
          {
            reviews:
              manualReviews.length,
            actions:
              recentActions.length,
            relationships:
              recentRelationships.length,
          },
        );

        return;
      }

      if (
        command === 'stop'
      ) {
        complete(
          true,
          {
            state:
              'stopping',
          },
        );

        await shutdown(
          'control command',
        );

        return;
      }

      throw new Error(
        `Unknown TikTok panel command: ${command || '(empty)'}`,
      );
    }
    catch (
      error:
        unknown
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      complete(
        false,
        null,
        message,
      );

      console.error(
        `TikTok panel command failed (${command}): ${message}`,
      );
    }
  }

  async function shutdown(
    reason:
      string,
  ): Promise<void> {
    if (
      shuttingDown
    ) {
      return;
    }

    shuttingDown =
      true;

    console.log('');
    console.log(
      `Stopping TikTok bot: ${reason}`,
    );

    if (
      statusTimer
    ) {
      clearInterval(
        statusTimer,
      );

      statusTimer =
        null;
    }

    try {
      if (
        automationRuntime
      ) {
        await automationRuntime
          .stop();

        automationRuntime =
          null;
      }

      await agent.stop();
    }
    finally {
      if (
        databaseInitialized
      ) {
        await closeDatabase();
      }

      for (
        const runtimeFile of
          [
            stopPath,
            commandPath,
          ]
      ) {
        if (
          existsSync(
            runtimeFile,
          )
        ) {
          rmSync(
            runtimeFile,
            {
              force: true,
            },
          );
        }
      }

      writeStatus(
        'stopped',
      );

      console.log(
        'TIKTOK_BOT_STOPPED=YES',
      );

      resolveDone?.();
    }
  }

  process.on(
    'SIGINT',
    () => {
      void shutdown(
        'Ctrl+C',
      );
    },
  );

  process.on(
    'SIGTERM',
    () => {
      void shutdown(
        'SIGTERM',
      );
    },
  );

  console.log(
    '============================================================',
  );
  console.log(
    ' TIKTOK BOT - ANDROID / APPIUM',
  );
  console.log(
    '============================================================',
  );
  console.log(
    `DEVICE=${deviceId}`,
  );
  console.log(
    `APPIUM=${config.appiumUrl}`,
  );
  console.log(
    `MODE=${config.testMode ? 'TEST' : 'REAL'}`,
  );
  console.log(
    `ACTIONS=${enabledActions.join(',')}`,
  );
  console.log(
    `MIN_DELAY_SECONDS=${config.safety.minDelaySeconds}`,
  );
  console.log(
    `MAX_ACTIONS_PER_HOUR=${config.safety.maxActionsPerHour}`,
  );
  console.log(
    `FOLLOW_BACK_CHECK_HOURS=${config.automationCore.followBackCheckHours}`,
  );
  console.log(
    'Stop with Ctrl+C, panel, or .\\PARAR_TIKTOK_BOT.ps1',
  );
  console.log(
    '============================================================',
  );
  console.log('');

  try {
    await agent.start();

    if (
      databaseInitialized &&
      config.automationCore.enabled
    ) {
      automationRuntime =
        createTikTokRuntime();

      automationRuntime
        .start();
    }

    await refreshPersistentPanelData(
      true,
    );

    writeStatus();

    statusTimer =
      setInterval(
        () => {
          void (
            async () => {
              try {
                await handleControlCommand();

                if (
                  shuttingDown
                ) {
                  return;
                }

                if (
                  existsSync(
                    stopPath,
                  )
                ) {
                  await shutdown(
                    'PARAR_TIKTOK_BOT.ps1',
                  );

                  return;
                }

                await refreshPersistentPanelData();

                writeStatus();
              }
              catch (
                error:
                  unknown
              ) {
                const message =
                  error instanceof Error
                    ? error.message
                    : String(error);

                console.error(
                  `Status monitor error: ${message}`,
                );
              }
            }
          )();
        },
        1000,
      );

    await done;
  }
  catch (
    error:
      unknown
  ) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `TIKTOK_BOT_ERROR=${message}`,
    );

    await shutdown(
      'startup/runtime error',
    );

    process.exitCode =
      1;
  }
}

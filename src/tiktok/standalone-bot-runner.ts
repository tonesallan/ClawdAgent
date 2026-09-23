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
  setTikTokHashtagConfiguration,
} from './hashtag-policy.js';
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
  
  if (
    !config.testMode &&
    enabledActions.includes(
      'follow',
    )
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
      const message =
        error instanceof Error
          ? error.message
          : String(error);
  
      throw new Error(
        `Real FOLLOW is enabled, but the persistence database could not be initialized: ${message}`,
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

    let command:
      string | null =
        null;

    try {
      const payload =
        JSON.parse(
          readFileSync(
            commandPath,
            'utf8',
          ),
        ) as {
          command?: unknown;
        };

      command =
        typeof payload.command ===
          'string'
          ? payload.command
              .trim()
              .toLowerCase()
          : null;
    }
    finally {
      rmSync(
        commandPath,
        {
          force: true,
        },
      );
    }

    if (
      command === 'pause'
    ) {
      agent.pause();
      automationRuntime
        ?.pause();

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

      console.log(
        'TIKTOK_BOT_RESUMED=YES',
      );

      return;
    }

    if (
      command === 'stop'
    ) {
      await shutdown(
        'control command',
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
      setInterval(
        () => {
          void (
            async () => {
              try {
                await handleControlCommand();

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

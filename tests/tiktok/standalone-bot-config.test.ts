import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  buildStandaloneTikTokAgentConfig,
  getEnabledStandaloneTikTokActions,
  parseStandaloneTikTokBotConfig,
} from '../../src/tiktok/standalone-bot-config.js';

describe(
  'standalone TikTok bot config',
  () => {
    it(
      'uses the agreed safe defaults',
      () => {
        const config =
          parseStandaloneTikTokBotConfig(
            {},
          );

        expect(
          config.testMode,
        ).toBe(true);

        expect(
          config.safety,
        ).toEqual({
          minDelaySeconds:
            60,
          maxActionsPerHour:
            10,
          pauseOnErrorCount:
            2,
          pauseDurationMinutes:
            5,
        });

        expect(
          config.actions.scroll,
        ).toEqual({
          enabled:
            true,
          intervalMinutes:
            1,
          dailyLimit:
            20,
        });

        expect(
          config.content.commentPolicy,
        ).toEqual({
          friendsOnly:
            false,
          requireVideoContext:
            true,
        });

        expect(
          config.automationCore,
        ).toEqual({
          enabled:
            true,
          followBackCheckHours:
            48,
          hashtags: {
            enabled:
              false,
            include:
              [],
            exclude:
              [],
            matchMode:
              'any',
            maxCandidatesPerCycle:
              20,
          },
        });


        expect(
          getEnabledStandaloneTikTokActions(
            config,
          ),
        ).toEqual([
          'scroll',
          'like',
          'comment',
          'follow',
        ]);
      },
    );

    it(
      'builds a MobileAgent config without dashboard dependencies',
      () => {
        const config =
          parseStandaloneTikTokBotConfig({
            testMode:
              false,
            actions: {
              scroll: {
                enabled:
                  true,
                intervalMinutes:
                  2,
                dailyLimit:
                  12,
              },
              like: {
                enabled:
                  false,
                intervalMinutes:
                  15,
                dailyLimit:
                  30,
              },
              comment: {
                enabled:
                  false,
                intervalMinutes:
                  60,
                dailyLimit:
                  5,
              },
              follow: {
                enabled:
                  false,
                intervalMinutes:
                  30,
                dailyLimit:
                  10,
              },
              share: {
                enabled:
                  false,
                intervalMinutes:
                  45,
                dailyLimit:
                  5,
              },
            },
          });

        const mobile =
          buildStandaloneTikTokAgentConfig(
            config,
            'device-1',
          );

        expect(
          mobile.id,
        ).toBe(
          'device-1:tiktok-standalone',
        );

        expect(
          mobile.actions,
        ).toEqual([
          'scroll',
        ]);

        expect(
          mobile.schedule.scroll,
        ).toEqual({
          intervalMinutes:
            2,
          dailyLimit:
            12,
        });

        expect(
          mobile.testMode,
        ).toBe(false);

        expect(
          mobile.content.commentPolicy,
        ).toEqual({
          friendsOnly:
            false,
          requireVideoContext:
            true,
        });
      },
    );

    it(
      'rejects a configuration with no enabled actions when building the agent',
      () => {
        const config =
          parseStandaloneTikTokBotConfig({
            actions: {
              scroll: {
                enabled:
                  false,
                intervalMinutes:
                  1,
                dailyLimit:
                  20,
              },
              like: {
                enabled:
                  false,
                intervalMinutes:
                  15,
                dailyLimit:
                  30,
              },
              comment: {
                enabled:
                  false,
                intervalMinutes:
                  60,
                dailyLimit:
                  5,
              },
              follow: {
                enabled:
                  false,
                intervalMinutes:
                  30,
                dailyLimit:
                  10,
              },
              share: {
                enabled:
                  false,
                intervalMinutes:
                  45,
                dailyLimit:
                  5,
              },
            },
          });

        expect(
          () =>
            buildStandaloneTikTokAgentConfig(
              config,
              'device-1',
            ),
        ).toThrow(
          'At least one TikTok action must be enabled.',
        );
      },
    );
  },
);

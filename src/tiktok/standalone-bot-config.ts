import { z } from 'zod';

import type {
  MobileAgentConfig,
} from '../actions/mobile/mobile-agent.js';

export const STANDALONE_TIKTOK_ACTIONS = [
  'scroll',
  'like',
  'comment',
  'follow',
  'share',
] as const;

export type StandaloneTikTokAction =
  typeof STANDALONE_TIKTOK_ACTIONS[number];

const actionSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z
    .number()
    .positive(),
  dailyLimit: z
    .number()
    .int()
    .nonnegative(),
});

const hourRangeSchema = z
  .object({
    start: z
      .number()
      .int()
      .min(0)
      .max(23),
    end: z
      .number()
      .int()
      .min(1)
      .max(24),
  })
  .refine(
    value =>
      value.start < value.end,
    {
      message:
        'Active-hours start must be before end.',
    },
  );

export const standaloneTikTokBotConfigSchema =
  z.object({
    deviceId: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .default(null),
    appiumUrl: z
      .string()
      .url()
      .default(
        'http://127.0.0.1:4723',
      ),
    testMode: z
      .boolean()
      .default(true),
    warmupSeconds: z
      .number()
      .nonnegative()
      .optional(),
    actions: z
      .object({
        scroll:
          actionSchema.default({
            enabled: true,
            intervalMinutes: 1,
            dailyLimit: 20,
          }),
        like:
          actionSchema.default({
            enabled: true,
            intervalMinutes: 15,
            dailyLimit: 30,
          }),
        comment:
          actionSchema.default({
            enabled: true,
            intervalMinutes: 60,
            dailyLimit: 5,
          }),
        follow:
          actionSchema.default({
            enabled: true,
            intervalMinutes: 30,
            dailyLimit: 10,
          }),
        share:
          actionSchema.default({
            enabled: false,
            intervalMinutes: 45,
            dailyLimit: 5,
          }),
      })
      .default({
        scroll: {
          enabled: true,
          intervalMinutes: 1,
          dailyLimit: 20,
        },
        like: {
          enabled: true,
          intervalMinutes: 15,
          dailyLimit: 30,
        },
        comment: {
          enabled: true,
          intervalMinutes: 60,
          dailyLimit: 5,
        },
        follow: {
          enabled: true,
          intervalMinutes: 30,
          dailyLimit: 10,
        },
        share: {
          enabled: false,
          intervalMinutes: 45,
          dailyLimit: 5,
        },
      }),
    activeHours: z
      .object({
        weekday:
          hourRangeSchema.default({
            start: 0,
            end: 24,
          }),
        weekend:
          hourRangeSchema.default({
            start: 0,
            end: 24,
          }),
      })
      .default({
        weekday: {
          start: 0,
          end: 24,
        },
        weekend: {
          start: 0,
          end: 24,
        },
      }),
    automationCore: z
      .object({
        enabled: z
          .boolean()
          .default(true),
        followBackCheckHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 30)
          .default(48),
        hashtags: z
          .object({
            enabled: z
              .boolean()
              .default(false),
            include: z
              .array(z.string().trim().min(1))
              .default([]),
            exclude: z
              .array(z.string().trim().min(1))
              .default([]),
            matchMode: z
              .enum(['any', 'all'])
              .default('any'),
            maxCandidatesPerCycle: z
              .number()
              .int()
              .min(1)
              .max(100)
              .default(20),
          })
          .default({
            enabled: false,
            include: [],
            exclude: [],
            matchMode: 'any',
            maxCandidatesPerCycle: 20,
          }),
      })
      .default({
        enabled: true,
        followBackCheckHours: 48,
        hashtags: {
          enabled: false,
          include: [],
          exclude: [],
          matchMode: 'any',
          maxCandidatesPerCycle: 20,
        },
      }),
    content: z
      .object({
        tone: z
          .string()
          .trim()
          .min(1)
          .default(
            'Natural, amigável e relevante',
          ),
        language: z
          .string()
          .trim()
          .min(1)
          .default('pt-BR'),
        topics: z
          .array(
            z
              .string()
              .trim()
              .min(1),
          )
          .min(1)
          .default([
            'tecnologia',
            'produtos',
            'dicas',
          ]),
        maxLength: z
          .number()
          .int()
          .min(20)
          .max(500)
          .default(5),
      })
      .default({
        tone:
          'Natural, amigável e relevante',
        language:
          'pt-BR',
        topics: [
          'tecnologia',
          'produtos',
          'dicas',
        ],
        maxLength:
          120,
      }),
    safety: z
      .object({
        minDelaySeconds: z
          .number()
          .int()
          .min(1)
          .default(60),
        maxActionsPerHour: z
          .number()
          .int()
          .min(1)
          .default(10),
        pauseOnErrorCount: z
          .number()
          .int()
          .min(1)
          .default(2),
        pauseDurationMinutes: z
          .number()
          .int()
          .min(1)
          .default(120),
      })
      .default({
        minDelaySeconds:
          60,
        maxActionsPerHour:
          10,
        pauseOnErrorCount:
          2,
        pauseDurationMinutes:
          5,
      }),
  })
    .strict();

export type StandaloneTikTokBotConfig =
  z.infer<
    typeof standaloneTikTokBotConfigSchema
  >;

export function parseStandaloneTikTokBotConfig(
  input: unknown,
): StandaloneTikTokBotConfig {
  return standaloneTikTokBotConfigSchema
    .parse(input);
}

export function getEnabledStandaloneTikTokActions(
  config:
    StandaloneTikTokBotConfig,
): StandaloneTikTokAction[] {
  return STANDALONE_TIKTOK_ACTIONS
    .filter(
      action =>
        config.actions[action]
          .enabled,
    );
}

export function buildStandaloneTikTokAgentConfig(
  config:
    StandaloneTikTokBotConfig,
  deviceId:
    string,
): MobileAgentConfig {
  const actions =
    getEnabledStandaloneTikTokActions(
      config,
    );

  if (actions.length === 0) {
    throw new Error(
      'At least one TikTok action must be enabled.',
    );
  }

  const schedule:
    MobileAgentConfig['schedule'] =
      {};

  for (
    const action of
      actions
  ) {
    schedule[action] = {
      intervalMinutes:
        config.actions[action]
          .intervalMinutes,
      dailyLimit:
        config.actions[action]
          .dailyLimit,
    };
  }

  return {
    id:
      `${deviceId}:tiktok-standalone`,
    app:
      'tiktok',
    deviceId,
    appiumUrl:
      config.appiumUrl,
    actions,
    schedule,
    activeHours:
      config.activeHours,
    content:
      config.content,
    safety:
      config.safety,
    testMode:
      config.testMode,
    warmupSeconds:
      config.warmupSeconds,
  };
}

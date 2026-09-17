import type {
  TikTokActionType,
} from './domain.js';

import {
  getTikTokActionLimit,
} from '../memory/repositories/tiktok-limits.js';

import {
  countTikTokSuccessfulActionsSince,
  getLastTikTokSuccessfulActionAt,
} from '../memory/repositories/tiktok-actions.js';

export type TikTokLimitPolicyReason =
  | 'allowed'
  | 'no_policy'
  | 'disabled'
  | 'hour_not_allowed'
  | 'weekday_not_allowed'
  | 'hourly_limit_reached'
  | 'daily_limit_reached'
  | 'minimum_interval'
  | 'cooldown';

export interface TikTokLimitPolicyInput {
  accountKey: string;
  actionType: TikTokActionType;
  now?: Date;
}

export interface TikTokLimitPolicyDecision {
  allowed: boolean;
  reason: TikTokLimitPolicyReason;

  retryAt: Date | null;

  usage: {
    hourly: number;
    daily: number;
  };

  limits: {
    hourly: number | null;
    daily: number | null;
    minIntervalSeconds: number | null;
    maxIntervalSeconds: number | null;
    cooldownSeconds: number | null;
  };
}

function normalizeIntegerArray(
  value: unknown,
): number[] {

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => Number(item))
    .filter(item =>
      Number.isInteger(item)
    );
}

function positiveOrNull(
  value: number | null,
): number | null {

  if (
    value === null ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}

function startOfLocalHour(
  now: Date,
): Date {

  const result =
    new Date(now);

  result.setMinutes(
    0,
    0,
    0,
  );

  return result;
}

function startOfLocalDay(
  now: Date,
): Date {

  const result =
    new Date(now);

  result.setHours(
    0,
    0,
    0,
    0,
  );

  return result;
}

function nextLocalHour(
  now: Date,
): Date {

  const result =
    startOfLocalHour(now);

  result.setHours(
    result.getHours() + 1,
  );

  return result;
}

function nextLocalDay(
  now: Date,
): Date {

  const result =
    startOfLocalDay(now);

  result.setDate(
    result.getDate() + 1,
  );

  return result;
}

function nextAllowedHour(
  now: Date,
  allowedHours: number[],
  allowedWeekdays: number[],
): Date | null {

  if (
    allowedHours.length === 0 &&
    allowedWeekdays.length === 0
  ) {
    return null;
  }

  /*
   * Search at most eight days ahead.
   *
   * Hours and weekdays currently use the local timezone of
   * the machine running ClawdAgent. A configurable timezone
   * can be added later without changing policy semantics.
   */
  const candidate =
    new Date(now);

  candidate.setMinutes(
    0,
    0,
    0,
  );

  candidate.setHours(
    candidate.getHours() + 1,
  );

  const maxIterations =
    8 * 24;

  for (
    let i = 0;
    i < maxIterations;
    i++
  ) {

    const hourAllowed =
      allowedHours.length === 0 ||
      allowedHours.includes(
        candidate.getHours(),
      );

    const weekdayAllowed =
      allowedWeekdays.length === 0 ||
      allowedWeekdays.includes(
        candidate.getDay(),
      );

    if (
      hourAllowed &&
      weekdayAllowed
    ) {
      return candidate;
    }

    candidate.setHours(
      candidate.getHours() + 1,
    );
  }

  return null;
}

export class TikTokLimitPolicy {

  async evaluate(
    input: TikTokLimitPolicyInput,
  ): Promise<TikTokLimitPolicyDecision> {

    const now =
      input.now ?? new Date();

    const policy =
      await getTikTokActionLimit(
        input.accountKey,
        input.actionType,
      );

    const emptyUsage = {
      hourly: 0,
      daily: 0,
    };

    const emptyLimits = {
      hourly: null,
      daily: null,
      minIntervalSeconds: null,
      maxIntervalSeconds: null,
      cooldownSeconds: null,
    };

    /*
     * Backward-compatible behavior:
     * absence of a configured policy does not suddenly
     * disable existing automation.
     */
    if (!policy) {

      return {
        allowed: true,
        reason: 'no_policy',
        retryAt: null,
        usage: emptyUsage,
        limits: emptyLimits,
      };
    }

    const hourlyLimit =
      positiveOrNull(
        policy.hourlyLimit,
      );

    const dailyLimit =
      positiveOrNull(
        policy.dailyLimit,
      );

    const minIntervalSeconds =
      positiveOrNull(
        policy.minIntervalSeconds,
      );

    const maxIntervalSeconds =
      positiveOrNull(
        policy.maxIntervalSeconds,
      );

    const cooldownSeconds =
      positiveOrNull(
        policy.cooldownSeconds,
      );

    const limits = {
      hourly: hourlyLimit,
      daily: dailyLimit,
      minIntervalSeconds,
      maxIntervalSeconds,
      cooldownSeconds,
    };

    if (!policy.enabled) {

      return {
        allowed: false,
        reason: 'disabled',
        retryAt: null,
        usage: emptyUsage,
        limits,
      };
    }

    const allowedHours =
      normalizeIntegerArray(
        policy.allowedHours,
      )
        .filter(value =>
          value >= 0 &&
          value <= 23
        );

    /*
     * JavaScript Date:
     * 0 = Sunday
     * 1 = Monday
     * ...
     * 6 = Saturday
     */
    const allowedWeekdays =
      normalizeIntegerArray(
        policy.allowedWeekdays,
      )
        .filter(value =>
          value >= 0 &&
          value <= 6
        );

    if (
      allowedWeekdays.length > 0 &&
      !allowedWeekdays.includes(
        now.getDay(),
      )
    ) {

      return {
        allowed: false,
        reason: 'weekday_not_allowed',
        retryAt:
          nextAllowedHour(
            now,
            allowedHours,
            allowedWeekdays,
          ),
        usage: emptyUsage,
        limits,
      };
    }

    if (
      allowedHours.length > 0 &&
      !allowedHours.includes(
        now.getHours(),
      )
    ) {

      return {
        allowed: false,
        reason: 'hour_not_allowed',
        retryAt:
          nextAllowedHour(
            now,
            allowedHours,
            allowedWeekdays,
          ),
        usage: emptyUsage,
        limits,
      };
    }

    const hourStart =
      startOfLocalHour(now);

    const dayStart =
      startOfLocalDay(now);

    /*
     * Only successful executions consume action quota.
     * Failed attempts are handled separately through
     * maxAttempts/backoff.
     */
    const [
      hourlyUsage,
      dailyUsage,
      lastSuccessAt,
    ] =
      await Promise.all([
        countTikTokSuccessfulActionsSince(
          input.accountKey,
          input.actionType,
          hourStart,
        ),

        countTikTokSuccessfulActionsSince(
          input.accountKey,
          input.actionType,
          dayStart,
        ),

        getLastTikTokSuccessfulActionAt(
          input.accountKey,
          input.actionType,
        ),
      ]);

    const usage = {
      hourly: hourlyUsage,
      daily: dailyUsage,
    };

    if (
      hourlyLimit !== null &&
      hourlyUsage >= hourlyLimit
    ) {

      return {
        allowed: false,
        reason: 'hourly_limit_reached',
        retryAt:
          nextLocalHour(now),
        usage,
        limits,
      };
    }

    if (
      dailyLimit !== null &&
      dailyUsage >= dailyLimit
    ) {

      return {
        allowed: false,
        reason: 'daily_limit_reached',
        retryAt:
          nextLocalDay(now),
        usage,
        limits,
      };
    }

    if (
      lastSuccessAt &&
      minIntervalSeconds !== null
    ) {

      const retryAt =
        new Date(
          lastSuccessAt.getTime() +
          minIntervalSeconds * 1000,
        );

      if (
        retryAt.getTime() >
        now.getTime()
      ) {

        return {
          allowed: false,
          reason: 'minimum_interval',
          retryAt,
          usage,
          limits,
        };
      }
    }

    /*
     * Cooldown is an additional post-success safety window.
     * If minInterval and cooldown are both configured,
     * whichever produces the later time wins naturally.
     */
    if (
      lastSuccessAt &&
      cooldownSeconds !== null
    ) {

      const retryAt =
        new Date(
          lastSuccessAt.getTime() +
          cooldownSeconds * 1000,
        );

      if (
        retryAt.getTime() >
        now.getTime()
      ) {

        return {
          allowed: false,
          reason: 'cooldown',
          retryAt,
          usage,
          limits,
        };
      }
    }

    /*
     * maxIntervalSeconds is persisted/exposed here but does
     * not block an execution. It belongs to future queue
     * scheduling/jitter rather than an allow/deny check.
     */
    return {
      allowed: true,
      reason: 'allowed',
      retryAt: null,
      usage,
      limits,
    };
  }
}

export const tikTokLimitPolicy =
  new TikTokLimitPolicy();
import {
  TIKTOK_ACTION_STATUSES,
  TIKTOK_ACTION_TYPES,
} from './domain.js';

import {
  tikTokLimitPolicy,
} from './limit-policy.js';

import {
  listDueScheduledTikTokActions,
  rescheduleTikTokAction,
  transitionTikTokAction,
  type TikTokAction,
} from '../memory/repositories/tiktok-actions.js';

export interface TikTokSchedulerHandlerResult {
  result?: Record<string, unknown>;
}

export type TikTokSchedulerHandler =
  (
    action: TikTokAction,
  ) => Promise<TikTokSchedulerHandlerResult>;

export interface RunTikTokSchedulerOptions {
  now?: Date;
  limit?: number;

  /**
   * Policy is injectable for tests/composition.
   *
   * By default the persistent TikTokLimitPolicy is used.
   */
  limitPolicy?: typeof tikTokLimitPolicy;

  /**
   * CHECK_FOLLOW_BACK is the only automated business action
   * currently accepted by this scheduler.
   *
   * The handler is intentionally injected.
   * The scheduler itself never talks to TikTok/Appium.
   */
  checkFollowBackHandler?: TikTokSchedulerHandler;
}

export interface TikTokSchedulerRunResult {
  scanned: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

const AUTOMATED_TYPES = new Set<string>([
  TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
]);

function getAttempts(action: TikTokAction): number {
  return action.attempts ?? 0;
}

function getMaxAttempts(action: TikTokAction): number {
  return action.maxAttempts ?? 3;
}

export async function runTikTokScheduler(
  options: RunTikTokSchedulerOptions = {},
): Promise<TikTokSchedulerRunResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;

  const actions =
    await listDueScheduledTikTokActions(
      now,
      limit,
    );

  const summary: TikTokSchedulerRunResult = {
    scanned: actions.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  for (const action of actions) {

    /*
     * Defense in depth:
     * Even if another action type somehow becomes scheduled,
     * this scheduler will not execute it.
     */
    if (!AUTOMATED_TYPES.has(action.type)) {
      summary.skipped += 1;
      continue;
    }

    if (
      action.type ===
      TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK
    ) {
      const handler =
        options.checkFollowBackHandler;

      if (!handler) {
        summary.skipped += 1;
        continue;
      }

      /*
       * Limits are evaluated BEFORE marking the action RUNNING
       * or consuming an attempt.
       *
       * A policy deferral is a scheduling decision, not an
       * execution failure.
       */
      const policy =
        options.limitPolicy ??
        tikTokLimitPolicy;

      const policyDecision =
        await policy.evaluate({
          accountKey:
            action.accountKey,
          actionType:
            TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
          now,
        });

      if (!policyDecision.allowed) {

        /*
         * When policy knows the next valid execution time,
         * persistently move executeAt forward.
         */
        if (
          policyDecision.retryAt &&
          policyDecision.retryAt.getTime() >
            now.getTime()
        ) {

          await rescheduleTikTokAction(
            action.id,
            policyDecision.retryAt,
          );
        }

        /*
         * enabled=false intentionally has retryAt=null.
         *
         * The action stays scheduled and is reconsidered on a
         * future scheduler cycle so a panel/config change can
         * reactivate it without rebuilding the queue.
         *
         * Most importantly: no attempts are consumed.
         */
        summary.skipped += 1;

        continue;
      }

      const nextAttempts =
        getAttempts(action) + 1;

      await transitionTikTokAction(
        action.id,
        {
          status:
            TIKTOK_ACTION_STATUSES.RUNNING,
          attempts: nextAttempts,
        },
      );

      summary.processed += 1;

      try {
        const handlerResult =
          await handler(action);

        /*
         * The CHECK_FOLLOW_BACK domain handler may already
         * transition the action to SUCCESS because it also
         * persists the relationship result.
         *
         * This transition is therefore deliberately NOT
         * duplicated here.
         */
        if (handlerResult.result) {
          // Result is returned only for scheduler reporting.
        }

        summary.succeeded += 1;
      }
      catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        const maxAttempts =
          getMaxAttempts(action);

        const exhausted =
          nextAttempts >= maxAttempts;

        await transitionTikTokAction(
          action.id,
          {
            status: exhausted
              ? TIKTOK_ACTION_STATUSES.FAILED
              : TIKTOK_ACTION_STATUSES.SCHEDULED,
            attempts: nextAttempts,
            error: message,
          },
        );

        summary.failed += 1;
      }
    }
  }

  return summary;
}

/**
 * Explicit helper for future diagnostics and tests.
 *
 * Important:
 * PENDING actions are not returned by
 * listDueScheduledTikTokActions(), therefore manual-review
 * UNFOLLOW actions cannot enter this scheduler.
 */
export function isTikTokAutomatedSchedulerType(
  type: string,
): boolean {
  return AUTOMATED_TYPES.has(type);
}
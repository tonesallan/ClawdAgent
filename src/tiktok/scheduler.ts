import {
  TIKTOK_ACTION_STATUSES,
  TIKTOK_ACTION_TYPES,
} from './domain.js';

import {
  tikTokLimitPolicy,
} from './limit-policy.js';

import {
  listDueScheduledTikTokActions,
  recoverStaleTikTokRunningActions,
  claimDueTikTokScheduledAction,
  deferDueTikTokScheduledAction,
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

/**
 * Blocked policies without an explicit retryAt must still
 * leave the current due queue.
 *
 * Otherwise an enabled=false action at the front of the queue
 * can be selected forever and starve later actions.
 */
const DEFAULT_POLICY_RECHECK_SECONDS =
  5 * 60;

/**
 * Technical retry backoff:
 *
 * attempt 1 -> 60s
 * attempt 2 -> 120s
 * attempt 3 -> 240s
 * ...
 *
 * capped at 30 minutes.
 */
const DEFAULT_RETRY_BACKOFF_SECONDS =
  60;

const MAX_RETRY_BACKOFF_SECONDS =
  30 * 60;

function getRetryBackoffSeconds(
  attempts: number,
): number {

  const exponent =
    Math.max(
      0,
      attempts - 1,
    );

  return Math.min(
    DEFAULT_RETRY_BACKOFF_SECONDS *
      (2 ** exponent),

    MAX_RETRY_BACKOFF_SECONDS,
  );
}

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

  /*
   * Recover only the currently automated read-only action type.
   *
   * This runs before due actions are selected so an interrupted
   * CHECK_FOLLOW_BACK cannot remain RUNNING forever.
   */
  await recoverStaleTikTokRunningActions(
    TIKTOK_ACTION_TYPES.CHECK_FOLLOW_BACK,
    now,
  );
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
         * Policy blocking is not an execution attempt.
         *
         * The action must nevertheless leave the current due
         * queue. If the policy does not provide a retryAt
         * (for example enabled=false), use a short persistent
         * recheck interval.
         */
        const retryAt =
          policyDecision.retryAt &&
          policyDecision.retryAt.getTime() >
            now.getTime()
            ? policyDecision.retryAt
            : new Date(
                now.getTime() +
                DEFAULT_POLICY_RECHECK_SECONDS *
                  1000,
              );

        await deferDueTikTokScheduledAction(
          action.id,
          now,
          retryAt,
          {
            reason:
              'policy_deferred',

            policyReason:
              policyDecision.reason,
          },
        );
        summary.skipped += 1;

        continue;
      }

      const claimedAction =
        await claimDueTikTokScheduledAction(
          action.id,
          now,
        );

      /*
       * Another scheduler may have read the same due row.
       *
       * Only the process that atomically changed
       * SCHEDULED -> RUNNING is allowed to continue.
       */
      if (!claimedAction) {

        summary.skipped += 1;

        continue;
      }

      const nextAttempts =
        getAttempts(
          claimedAction,
        );

      summary.processed += 1;

      try {
        const handlerResult =
          await handler(
            claimedAction,
          );

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
          getMaxAttempts(claimedAction);

        const exhausted =
          nextAttempts >= maxAttempts;

        if (exhausted) {

          /*
           * Terminal failure: do not reschedule after
           * maxAttempts has been consumed.
           */
          await transitionTikTokAction(
            action.id,
            {
              status:
                TIKTOK_ACTION_STATUSES.FAILED,

              attempts:
                nextAttempts,

              error:
                message,

              metadata: {
                reason:
                  'retry_exhausted',
              },
            },
          );
        }
        else {

          /*
           * Technical failures use persistent exponential
           * backoff instead of immediately becoming due again.
           */
          const failureBaseTime =
            options.now
              ? now
              : new Date();

          const backoffSeconds =
            getRetryBackoffSeconds(
              nextAttempts,
            );

          const retryAt =
            new Date(
              failureBaseTime.getTime() +
              backoffSeconds * 1000,
            );

          await rescheduleTikTokAction(
            action.id,
            retryAt,
            undefined,
            {
              expectedStatus:
                TIKTOK_ACTION_STATUSES.RUNNING,

              error:
                message,

              attempts:
                nextAttempts,

              metadata: {
                reason:
                  'retry_backoff',

                backoffSeconds,
              },
            },
          );
        }

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
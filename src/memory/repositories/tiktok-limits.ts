import { and, eq } from 'drizzle-orm';
import { getDb } from '../database.js';
import { tiktokActionLimits } from '../schema.js';
import type { TikTokActionType } from '../../tiktok/domain.js';

export type TikTokActionLimit =
  typeof tiktokActionLimits.$inferSelect;

export interface UpsertTikTokActionLimitInput {
  accountKey: string;
  actionType: TikTokActionType;
  enabled?: boolean;
  dailyLimit?: number | null;
  hourlyLimit?: number | null;
  minIntervalSeconds?: number | null;
  maxIntervalSeconds?: number | null;
  cooldownSeconds?: number | null;
  allowedHours?: number[];
  allowedWeekdays?: number[];
}

export async function getTikTokActionLimit(
  accountKey: string,
  actionType: TikTokActionType,
): Promise<TikTokActionLimit | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(tiktokActionLimits)
    .where(
      and(
        eq(tiktokActionLimits.accountKey, accountKey),
        eq(tiktokActionLimits.actionType, actionType),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function upsertTikTokActionLimit(
  input: UpsertTikTokActionLimitInput,
): Promise<TikTokActionLimit> {
  const db = getDb();

  const [row] = await db
    .insert(tiktokActionLimits)
    .values({
      accountKey: input.accountKey,
      actionType: input.actionType,
      enabled: input.enabled ?? true,
      dailyLimit: input.dailyLimit ?? null,
      hourlyLimit: input.hourlyLimit ?? null,
      minIntervalSeconds: input.minIntervalSeconds ?? null,
      maxIntervalSeconds: input.maxIntervalSeconds ?? null,
      cooldownSeconds: input.cooldownSeconds ?? null,
      allowedHours: input.allowedHours ?? [],
      allowedWeekdays: input.allowedWeekdays ?? [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        tiktokActionLimits.accountKey,
        tiktokActionLimits.actionType,
      ],
      set: {
        enabled: input.enabled ?? true,
        dailyLimit: input.dailyLimit ?? null,
        hourlyLimit: input.hourlyLimit ?? null,
        minIntervalSeconds: input.minIntervalSeconds ?? null,
        maxIntervalSeconds: input.maxIntervalSeconds ?? null,
        cooldownSeconds: input.cooldownSeconds ?? null,
        allowedHours: input.allowedHours ?? [],
        allowedWeekdays: input.allowedWeekdays ?? [],
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new Error('Failed to persist TikTok action limit.');
  }

  return row;
}
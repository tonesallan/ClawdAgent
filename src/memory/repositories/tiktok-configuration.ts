import { eq } from 'drizzle-orm';
import { getDb } from '../database.js';
import { tiktokConfiguration } from '../schema.js';

export async function getTikTokConfigurationValue<T>(
  key: string,
  fallback: T,
): Promise<T> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(tiktokConfiguration)
    .where(eq(tiktokConfiguration.key, key))
    .limit(1);

  if (!row) {
    return fallback;
  }

  return row.value as T;
}

export async function setTikTokConfigurationValue(
  key: string,
  value: unknown,
  description?: string | null,
): Promise<void> {
  const db = getDb();

  await db
    .insert(tiktokConfiguration)
    .values({
      key,
      value,
      description: description ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tiktokConfiguration.key,
      set: {
        value,
        description: description ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function getTikTokNumberConfiguration(
  key: string,
  fallback: number,
  options: {
    min?: number;
    max?: number;
  } = {},
): Promise<number> {
  const raw = await getTikTokConfigurationValue<unknown>(
    key,
    fallback,
  );

  const value =
    typeof raw === 'number'
      ? raw
      : Number(raw);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  if (
    options.min !== undefined &&
    value < options.min
  ) {
    return fallback;
  }

  if (
    options.max !== undefined &&
    value > options.max
  ) {
    return fallback;
  }

  return value;
}
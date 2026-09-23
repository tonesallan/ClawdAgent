import {
  getTikTokConfigurationValue,
  setTikTokConfigurationValue,
} from '../memory/repositories/tiktok-configuration.js';

export const TIKTOK_HASHTAG_CONFIGURATION_KEY =
  'hashtag_filters';

export interface TikTokHashtagConfiguration {
  enabled: boolean;

  /**
   * At least one include hashtag must match when this list
   * is non-empty.
   */
  include: string[];

  /**
   * include matching mode:
   * - any: at least one include hashtag must match;
   * - all: every configured include hashtag must match.
   */
  matchMode: 'any' | 'all';

  /**
   * Any exclude hashtag rejects the candidate.
   */
  exclude: string[];

  /**
   * Maximum number of accepted candidates exposed by one
   * filtering cycle.
   *
   * This does not execute any TikTok action.
   */
  maxCandidatesPerCycle: number;
}

export interface TikTokHashtagCandidate {
  hashtags: string[];

  [key: string]: unknown;
}

export interface TikTokHashtagEvaluation {
  accepted: boolean;

  reason:
    | 'disabled'
    | 'included'
    | 'no_include_filter'
    | 'excluded'
    | 'no_hashtags';

  normalizedHashtags: string[];
}

const DEFAULT_CONFIGURATION:
  TikTokHashtagConfiguration = {

    enabled: false,

    include: [],

    matchMode: 'any',

    exclude: [],

    maxCandidatesPerCycle:
      20,
  };

export function normalizeTikTokHashtag(
  value: unknown,
): string | null {

  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .replace(/^#+/, '')
      .normalize('NFKC')
      .toLocaleLowerCase();

  if (!normalized) {
    return null;
  }

  /*
   * TikTok hashtags may contain Unicode letters/numbers and
   * underscores.
   *
   * Spaces and punctuation are intentionally rejected.
   */
  if (
    !/^[\p{L}\p{N}_]+$/u.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
}

export function normalizeTikTokHashtagList(
  input: unknown,
): string[] {

  if (!Array.isArray(input)) {
    return [];
  }

  const result =
    new Set<string>();

  for (const item of input) {

    const normalized =
      normalizeTikTokHashtag(
        item,
      );

    if (normalized) {
      result.add(normalized);
    }
  }

  return [
    ...result,
  ];
}

function normalizeMaxCandidates(
  value: unknown,
): number {

  const numeric =
    Number(value);

  if (
    !Number.isFinite(numeric)
  ) {
    return (
      DEFAULT_CONFIGURATION
        .maxCandidatesPerCycle
    );
  }

  return Math.min(
    100,
    Math.max(
      1,
      Math.floor(numeric),
    ),
  );
}

export function normalizeTikTokHashtagConfiguration(
  input: unknown,
): TikTokHashtagConfiguration {

  if (
    !input ||
    typeof input !== 'object'
  ) {
    return {
      ...DEFAULT_CONFIGURATION,
    };
  }

  const raw =
    input as
      Record<string, unknown>;

  return {
    enabled:
      raw.enabled === true,

    include:
      normalizeTikTokHashtagList(
        raw.include,
      ),

    matchMode:
      raw.matchMode === 'all'
        ? 'all'
        : 'any',

    exclude:
      normalizeTikTokHashtagList(
        raw.exclude,
      ),

    maxCandidatesPerCycle:
      normalizeMaxCandidates(
        raw.maxCandidatesPerCycle,
      ),
  };
}

export async function getTikTokHashtagConfiguration():
  Promise<TikTokHashtagConfiguration> {

  const raw =
    await getTikTokConfigurationValue<unknown>(
      TIKTOK_HASHTAG_CONFIGURATION_KEY,
      DEFAULT_CONFIGURATION,
    );

  return normalizeTikTokHashtagConfiguration(
    raw,
  );
}

export async function setTikTokHashtagConfiguration(
  input:
    Partial<TikTokHashtagConfiguration>,
): Promise<TikTokHashtagConfiguration> {

  const current =
    await getTikTokHashtagConfiguration();

  const normalized =
    normalizeTikTokHashtagConfiguration({
      ...current,
      ...input,
    });

  await setTikTokConfigurationValue(
    TIKTOK_HASHTAG_CONFIGURATION_KEY,

    normalized,

    'TikTok hashtag discovery/filter configuration.',
  );

  return normalized;
}

export function evaluateTikTokHashtags(
  hashtags: unknown,
  configuration:
    TikTokHashtagConfiguration,
): TikTokHashtagEvaluation {

  const normalizedHashtags =
    normalizeTikTokHashtagList(
      hashtags,
    );

  if (!configuration.enabled) {

    return {
      accepted: false,
      reason: 'disabled',
      normalizedHashtags,
    };
  }

  if (
    normalizedHashtags.length === 0
  ) {

    return {
      accepted: false,
      reason: 'no_hashtags',
      normalizedHashtags,
    };
  }

  const excluded =
    normalizedHashtags.some(
      hashtag =>
        configuration.exclude.includes(
          hashtag,
        ),
    );

  if (excluded) {

    return {
      accepted: false,
      reason: 'excluded',
      normalizedHashtags,
    };
  }

  if (
    configuration.include.length === 0
  ) {

    return {
      accepted: true,
      reason: 'no_include_filter',
      normalizedHashtags,
    };
  }

  const included =
    configuration.matchMode ===
      'all'
      ? configuration.include.every(
          hashtag =>
            normalizedHashtags.includes(
              hashtag,
            ),
        )
      : normalizedHashtags.some(
          hashtag =>
            configuration.include.includes(
              hashtag,
            ),
        );

  return {
    accepted:
      included,

    reason:
      included
        ? 'included'
        : 'no_include_filter',

    normalizedHashtags,
  };
}

export function filterTikTokHashtagCandidates<
  T extends TikTokHashtagCandidate,
>(
  candidates: T[],
  configuration:
    TikTokHashtagConfiguration,
): T[] {

  if (!configuration.enabled) {
    return [];
  }

  const result: T[] =
    [];

  for (const candidate of candidates) {

    const evaluation =
      evaluateTikTokHashtags(
        candidate.hashtags,
        configuration,
      );

    if (!evaluation.accepted) {
      continue;
    }

    result.push(
      candidate,
    );

    if (
      result.length >=
      configuration.maxCandidatesPerCycle
    ) {
      break;
    }
  }

  return result;
}
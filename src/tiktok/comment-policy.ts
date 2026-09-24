import type {
  TikTokVideoContext,
} from './android-video-context.js';

export type TikTokCommentMatchMode = 'any' | 'all';
export type TikTokCommentStylePreset =
  | 'natural'
  | 'short'
  | 'curious'
  | 'question'
  | 'informative'
  | 'light_humor';

export interface TikTokFollowExchangeConfig {
  enabled: boolean;
  indicatorPhrases: string[];
  sampleSize: number;
  maxScrolls: number;
  minMatchedComments: number;
  minConfidence: number;
  commentEnabled: boolean;
  commentTemplates: string[];
  useAiVariation: boolean;
  allowRepeatedTemplates: boolean;
  replaceNormalComment: boolean;
  bypassNormalContentFilters: boolean;
  likeCommentsEnabled: boolean;
  maxCommentLikesPerVideo: number;
  dailyCommentLikeLimit: number;
  likeOnlyMatchingSignals: boolean;
  excludeCreatorComments: boolean;
}

export interface TikTokCommentPolicyConfig {
  friendsOnly: boolean;
  requireVideoContext: boolean;
  minLength: number;
  maxEmojis: number;
  stylePreset: TikTokCommentStylePreset;
  previewOnly: boolean;
  requiredKeywords: string[];
  excludedKeywords: string[];
  keywordMatchMode: TikTokCommentMatchMode;
  requiredHashtags: string[];
  excludedHashtags: string[];
  hashtagMatchMode: TikTokCommentMatchMode;
  allowedProfiles: string[];
  blockedProfiles: string[];
  profileCooldownHours: number;
  duplicateVideoWindowHours: number;
  maxCommentsPerProfilePerDay: number;
  avoidRecentCommentSimilarity: boolean;
  similarityThreshold: number;
  recentCommentComparisonCount: number;
  followExchange: TikTokFollowExchangeConfig;
}

export type TikTokCommentHistoryStatus =
  | 'preview'
  | 'published'
  | 'comment_like';

export type TikTokCommentKind =
  | 'normal'
  | 'follow_exchange';

export interface TikTokCommentHistoryEntry {
  timestamp: string;
  status: TikTokCommentHistoryStatus;
  kind: TikTokCommentKind;
  videoKey: string;
  creatorUsername: string | null;
  commentText: string | null;
  commentKey: string | null;
  metadata?: Record<string, unknown>;
}

export interface TikTokCommentEligibility {
  allowed: boolean;
  reasons: string[];
}

export interface TikTokGeneratedCommentValidation {
  valid: boolean;
  reasons: string[];
  emojiCount: number;
  similarTo?: string;
  similarity?: number;
}

export interface TikTokFollowExchangeDetection {
  detected: boolean;
  confidence: number;
  sampledComments: number;
  matchedComments: number;
  matchedPhrases: string[];
  videoMatchedPhrases: string[];
  matchedCommentTexts: string[];
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeProfile(value: string): string {
  return normalizeText(value.replace(/^@/, ''));
}

function normalizeHashtag(value: string): string {
  return normalizeText(value.replace(/^#/, ''));
}

function includesPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  return normalizedPhrase
    ? normalizeText(haystack).includes(normalizedPhrase)
    : false;
}

function matchesList(
  haystack: string,
  values: string[],
  mode: TikTokCommentMatchMode,
): boolean {
  if (values.length === 0) return true;
  const matches = values.map(value => includesPhrase(haystack, value));
  return mode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

function contextText(context: TikTokVideoContext): string {
  return [
    context.caption ?? '',
    context.hashtags.map(tag => `#${tag}`).join(' '),
    ...context.snippets,
  ].join(' ');
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildTikTokVideoKey(context: TikTokVideoContext): string {
  const raw = context.fingerprint || [
    context.creatorUsername ?? '',
    context.caption ?? '',
    context.hashtags.join(','),
  ].join('|');
  return `video:${simpleHash(normalizeText(raw))}`;
}

export function evaluateTikTokCommentBaseEligibility(
  context: TikTokVideoContext,
  policy: TikTokCommentPolicyConfig,
  history: TikTokCommentHistoryEntry[],
  now = new Date(),
): TikTokCommentEligibility {
  const reasons: string[] = [];
  const username = context.creatorUsername
    ? normalizeProfile(context.creatorUsername)
    : null;
  const allowedProfiles = policy.allowedProfiles.map(normalizeProfile).filter(Boolean);
  const blockedProfiles = policy.blockedProfiles.map(normalizeProfile).filter(Boolean);

  if (username && blockedProfiles.includes(username)) {
    reasons.push('creator is in blocked profile list');
  }

  if (allowedProfiles.length > 0 && (!username || !allowedProfiles.includes(username))) {
    reasons.push('creator is not in allowed profile list');
  }

  const published = history
    .filter(entry => entry.status === 'published')
    .sort((left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

  if (username && policy.profileCooldownHours > 0) {
    const latest = published.find(entry =>
      entry.creatorUsername &&
      normalizeProfile(entry.creatorUsername) === username);
    if (latest) {
      const elapsed = now.getTime() - new Date(latest.timestamp).getTime();
      if (elapsed < policy.profileCooldownHours * 3_600_000) {
        reasons.push(`profile cooldown active (${policy.profileCooldownHours}h)`);
      }
    }
  }

  const videoKey = buildTikTokVideoKey(context);
  if (policy.duplicateVideoWindowHours > 0) {
    const duplicate = published.find(entry =>
      entry.videoKey === videoKey &&
      now.getTime() - new Date(entry.timestamp).getTime() <
        policy.duplicateVideoWindowHours * 3_600_000);
    if (duplicate) {
      reasons.push(`video already commented within ${policy.duplicateVideoWindowHours}h`);
    }
  }

  if (username && policy.maxCommentsPerProfilePerDay > 0) {
    const today = now.toISOString().slice(0, 10);
    const todayCount = published.filter(entry =>
      entry.creatorUsername &&
      normalizeProfile(entry.creatorUsername) === username &&
      entry.timestamp.slice(0, 10) === today).length;
    if (todayCount >= policy.maxCommentsPerProfilePerDay) {
      reasons.push(
        `daily profile comment limit reached (${todayCount}/${policy.maxCommentsPerProfilePerDay})`,
      );
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

export function evaluateTikTokCommentContentFilters(
  context: TikTokVideoContext,
  policy: TikTokCommentPolicyConfig,
): TikTokCommentEligibility {
  const reasons: string[] = [];
  const visible = contextText(context);

  if (policy.excludedKeywords.some(keyword => includesPhrase(visible, keyword))) {
    reasons.push('video matches an excluded keyword/topic');
  }

  if (!matchesList(visible, policy.requiredKeywords, policy.keywordMatchMode)) {
    reasons.push(`required keyword rule (${policy.keywordMatchMode}) not satisfied`);
  }

  const hashtags = context.hashtags.map(normalizeHashtag);
  const excluded = policy.excludedHashtags.map(normalizeHashtag).filter(Boolean);
  if (excluded.some(tag => hashtags.includes(tag))) {
    reasons.push('video contains an excluded hashtag');
  }

  const required = policy.requiredHashtags.map(normalizeHashtag).filter(Boolean);
  if (required.length > 0) {
    const matches = required.map(tag => hashtags.includes(tag));
    const satisfied = policy.hashtagMatchMode === 'all'
      ? matches.every(Boolean)
      : matches.some(Boolean);
    if (!satisfied) {
      reasons.push(`required hashtag rule (${policy.hashtagMatchMode}) not satisfied`);
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

export function countTikTokCommentEmojis(value: string): number {
  return (value.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(token => token.length >= 2),
  );
}

export function tikTokCommentSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function validateGeneratedTikTokComment(
  text: string,
  maxLength: number,
  policy: TikTokCommentPolicyConfig,
  history: TikTokCommentHistoryEntry[],
): TikTokGeneratedCommentValidation {
  const reasons: string[] = [];
  const trimmed = text.trim();

  if (trimmed.length < policy.minLength) {
    reasons.push(`comment shorter than minimum (${trimmed.length}/${policy.minLength})`);
  }
  if (trimmed.length > maxLength) {
    reasons.push(`comment longer than maximum (${trimmed.length}/${maxLength})`);
  }

  const emojiCount = countTikTokCommentEmojis(trimmed);
  if (emojiCount > policy.maxEmojis) {
    reasons.push(`too many emojis (${emojiCount}/${policy.maxEmojis})`);
  }

  const forbidden = policy.excludedKeywords.find(keyword => includesPhrase(trimmed, keyword));
  if (forbidden) {
    reasons.push(`generated comment contains excluded term: ${forbidden}`);
  }

  let similarTo: string | undefined;
  let similarity: number | undefined;

  if (policy.avoidRecentCommentSimilarity) {
    const recent = history
      .filter(entry =>
        entry.status === 'published' &&
        typeof entry.commentText === 'string' &&
        entry.commentText.trim().length > 0)
      .slice(0, policy.recentCommentComparisonCount);

    for (const entry of recent) {
      const candidate = entry.commentText ?? '';
      const score = tikTokCommentSimilarity(trimmed, candidate);
      if (score >= policy.similarityThreshold) {
        similarTo = candidate;
        similarity = score;
        reasons.push(
          `comment too similar to recent comment (${Math.round(score * 100)}%)`,
        );
        break;
      }
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
    emojiCount,
    similarTo,
    similarity,
  };
}

export function commentMatchesFollowExchangeSignals(
  text: string,
  phrases: string[],
): { matched: boolean; phrases: string[] } {
  const matched = phrases.filter(phrase => includesPhrase(text, phrase));
  return { matched: matched.length > 0, phrases: matched };
}

export function detectTikTokFollowExchange(
  commentTexts: string[],
  context: TikTokVideoContext,
  config: TikTokFollowExchangeConfig,
): TikTokFollowExchangeDetection {
  const sampled = commentTexts
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, config.sampleSize);

  const matchedCommentTexts: string[] = [];
  const matchedPhrases = new Set<string>();

  for (const comment of sampled) {
    const result = commentMatchesFollowExchangeSignals(comment, config.indicatorPhrases);
    if (!result.matched) continue;
    matchedCommentTexts.push(comment);
    for (const phrase of result.phrases) matchedPhrases.add(phrase);
  }

  const visible = contextText(context);
  const videoMatchedPhrases = config.indicatorPhrases
    .filter(phrase => includesPhrase(visible, phrase));

  const baseConfidence = sampled.length > 0
    ? matchedCommentTexts.length / sampled.length
    : 0;
  const confidence = Math.min(
    1,
    baseConfidence + (videoMatchedPhrases.length > 0 ? 0.1 : 0),
  );

  return {
    detected:
      config.enabled &&
      matchedCommentTexts.length >= config.minMatchedComments &&
      confidence >= config.minConfidence,
    confidence,
    sampledComments: sampled.length,
    matchedComments: matchedCommentTexts.length,
    matchedPhrases: [...matchedPhrases],
    videoMatchedPhrases,
    matchedCommentTexts,
  };
}

export function getTikTokCommentStyleInstruction(
  preset: TikTokCommentStylePreset,
): string {
  switch (preset) {
    case 'short':
      return 'Prefer a concise one-sentence response.';
    case 'curious':
      return 'Sound naturally curious and interested.';
    case 'question':
      return 'Prefer a relevant, natural question when the context supports it.';
    case 'informative':
      return 'Prefer a useful observation that adds information without sounding formal.';
    case 'light_humor':
      return 'Use light, friendly humor only when it naturally fits the context.';
    case 'natural':
    default:
      return 'Write like a normal person reacting naturally to the specific post.';
  }
}

export function pickTikTokFollowExchangeTemplate(templates: string[]): string {
  const usable = templates.map(value => value.trim()).filter(Boolean);
  const candidates = usable.length > 0 ? usable : ['Sigo todos de volta 💕'];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

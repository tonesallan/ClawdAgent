import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  TikTokVideoContext,
} from '../../src/tiktok/android-video-context.js';
import {
  buildTikTokVideoKey,
  detectTikTokFollowExchange,
  evaluateTikTokCommentBaseEligibility,
  evaluateTikTokCommentContentFilters,
  tikTokCommentSimilarity,
  validateGeneratedTikTokComment,
  type TikTokCommentHistoryEntry,
  type TikTokCommentPolicyConfig,
} from '../../src/tiktok/comment-policy.js';

const context: TikTokVideoContext = {
  caption: 'Garotas apoiam garotas #apoio #amizade',
  hashtags: ['apoio', 'amizade'],
  creatorUsername: 'ana.teste',
  snippets: ['vamos crescer juntas'],
  fingerprint: 'ana.teste|garotas apoiam garotas|apoio,amizade',
};

const policy: TikTokCommentPolicyConfig = {
  friendsOnly: false,
  requireVideoContext: true,
  minLength: 8,
  maxEmojis: 2,
  stylePreset: 'natural',
  previewOnly: false,
  requiredKeywords: [],
  excludedKeywords: [],
  keywordMatchMode: 'any',
  requiredHashtags: [],
  excludedHashtags: [],
  hashtagMatchMode: 'any',
  allowedProfiles: [],
  blockedProfiles: [],
  profileCooldownHours: 12,
  duplicateVideoWindowHours: 72,
  maxCommentsPerProfilePerDay: 2,
  avoidRecentCommentSimilarity: true,
  similarityThreshold: 0.8,
  recentCommentComparisonCount: 20,
  followExchange: {
    enabled: true,
    indicatorPhrases: [
      'sigo de volta',
      'apoiando',
      'garotas apoiam garotas',
    ],
    sampleSize: 10,
    maxScrolls: 2,
    minMatchedComments: 2,
    minConfidence: 0.2,
    commentEnabled: true,
    commentTemplates: ['Sigo todos de volta 💕'],
    useAiVariation: false,
    allowRepeatedTemplates: true,
    replaceNormalComment: true,
    bypassNormalContentFilters: true,
    likeCommentsEnabled: true,
    maxCommentLikesPerVideo: 3,
    dailyCommentLikeLimit: 10,
    likeOnlyMatchingSignals: true,
    excludeCreatorComments: true,
  },
};

describe(
  'TikTok comment policy',
  () => {
    it(
      'detects follow-exchange content from repeated comment signals',
      () => {
        const detection = detectTikTokFollowExchange(
          [
            'Sigo de volta todo mundo',
            'Apoiando por aqui',
            'Que vídeo lindo',
            'Garotas apoiam garotas 💕',
          ],
          context,
          policy.followExchange,
        );

        expect(detection.detected).toBe(true);
        expect(detection.matchedComments).toBe(3);
        expect(detection.confidence).toBeGreaterThan(0.5);
      },
    );

    it(
      'applies cooldown and duplicate-video controls',
      () => {
        const now = new Date('2026-09-24T10:00:00.000Z');
        const history: TikTokCommentHistoryEntry[] = [
          {
            timestamp: '2026-09-24T08:00:00.000Z',
            status: 'published',
            kind: 'normal',
            videoKey: buildTikTokVideoKey(context),
            creatorUsername: 'ana.teste',
            commentText: 'Comentário anterior',
            commentKey: null,
          },
        ];

        const result = evaluateTikTokCommentBaseEligibility(
          context,
          policy,
          history,
          now,
        );

        expect(result.allowed).toBe(false);
        expect(result.reasons.join(' ')).toContain('cooldown');
        expect(result.reasons.join(' ')).toContain('already commented');
      },
    );

    it(
      'applies keyword and hashtag filters',
      () => {
        const filtered: TikTokCommentPolicyConfig = {
          ...policy,
          requiredKeywords: ['crescer'],
          requiredHashtags: ['apoio'],
          excludedHashtags: ['politica'],
        };

        expect(
          evaluateTikTokCommentContentFilters(
            context,
            filtered,
          ).allowed,
        ).toBe(true);

        expect(
          evaluateTikTokCommentContentFilters(
            {
              ...context,
              hashtags: ['politica'],
            },
            filtered,
          ).allowed,
        ).toBe(false);
      },
    );

    it(
      'rejects recent near-duplicate generated comments',
      () => {
        const history: TikTokCommentHistoryEntry[] = [
          {
            timestamp: '2026-09-24T08:00:00.000Z',
            status: 'published',
            kind: 'normal',
            videoKey: 'video:old',
            creatorUsername: 'outra',
            commentText: 'Apoiando por aqui, sigo todo mundo de volta 💕',
            commentKey: null,
          },
        ];

        const invalid = validateGeneratedTikTokComment(
          'Apoiando por aqui, sigo todo mundo de volta 💕',
          120,
          policy,
          history,
        );

        expect(invalid.valid).toBe(false);
        expect(invalid.similarity).toBeGreaterThanOrEqual(0.8);

        expect(
          tikTokCommentSimilarity(
            'Apoiando por aqui',
            'Apoiando por aqui!',
          ),
        ).toBe(1);
      },
    );
  },
);

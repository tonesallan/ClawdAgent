import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import express from 'express';
import type {
  AddressInfo,
} from 'node:net';
import type {
  Server,
} from 'node:http';

const approvalMocks =
  vi.hoisted(() => ({
    getApprovalGate:
      vi.fn(),
  }));

const actionMocks =
  vi.hoisted(() => ({
    listTikTokActionsByTypeAcrossAccounts:
      vi.fn(),
  }));

const reviewMocks =
  vi.hoisted(() => ({
    resolveTikTokDiscoveryReview:
      vi.fn(),
  }));

vi.mock(
  '../../src/core/intelligence-bridge.js',
  () => ({
    getDashboardData:
      vi.fn(() => ({})),
    isBridgeReady:
      vi.fn(() => false),
  }),
);

vi.mock(
  '../../src/agents/registry.js',
  () => ({
    getAllAgents:
      vi.fn(() => []),
  }),
);

vi.mock(
  '../../src/core/ollama-model-registry.js',
  () => ({
    checkOllamaModels:
      vi.fn(async () => ({
        available: [],
        missing: [],
      })),
    getAgentModelMapping:
      vi.fn(() => []),
    OLLAMA_MODELS: [],
  }),
);

vi.mock(
  '../../src/memory/database.js',
  () => ({
    getDb:
      vi.fn(),
  }),
);

vi.mock(
  '../../src/core/approval-gate.js',
  () => approvalMocks,
);

vi.mock(
  '../../src/memory/repositories/tiktok-actions.js',
  () => actionMocks,
);

vi.mock(
  '../../src/tiktok/hashtag-review-queue.js',
  () => reviewMocks,
);

import {
  setupDashboardRoutes,
} from '../../src/interfaces/web/routes/dashboard.js';

function createGate() {
  return {
    getPending:
      vi.fn(() => []),
    getHistory:
      vi.fn(() => []),
    getStats:
      vi.fn(() => ({
        pending: 0,
        approvedToday: 0,
        deniedToday: 0,
      })),
    approve:
      vi.fn(() => true),
    deny:
      vi.fn(() => true),
  };
}

function createDiscoveryAction(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'review-1',
    accountKey: 'default',
    type: 'DISCOVERY_REVIEW',
    targetKey: 'discovery:abc',
    targetUsername: null,
    targetDisplayName: null,
    status: 'pending',
    executeAt: null,
    priority: 10,
    attempts: 0,
    maxAttempts: 1,
    provider: 'android',
    payload: {
      requiresReview: true,
      query: '#test',
      candidate: {
        username: 'candidate',
        hashtags: ['test'],
      },
    },
    result: null,
    error: null,
    createdAt:
      new Date(
        '2026-09-17T20:00:00.000Z',
      ),
    updatedAt:
      new Date(
        '2026-09-17T20:00:00.000Z',
      ),
    ...overrides,
  };
}

function createApp() {
  const app =
    express();

  app.use(
    '/dashboard',
    setupDashboardRoutes({
      getUptime:
        () => 1,
      getCronTasks:
        () => [],
      getUsageSummary:
        () => ({}),
      getWorkflowCount:
        () => 0,
      getMcpInfo:
        () => ({
          servers: 0,
          tools: 0,
        }),
    }),
  );

  return app;
}

async function listen(
  app: ReturnType<typeof createApp>,
): Promise<{
  server: Server;
  baseUrl: string;
}> {
  const server =
    await new Promise<Server>(
      resolve => {
        const next =
          app.listen(
            0,
            '127.0.0.1',
            () =>
              resolve(next),
          );
      },
    );

  const address =
    server.address() as
      AddressInfo;

  return {
    server,
    baseUrl:
      `http://127.0.0.1:${address.port}/dashboard`,
  };
}

async function closeServer(
  server: Server | null,
): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      server.close(
        error =>
          error
            ? reject(error)
            : resolve(),
      );
    },
  );
}

describe(
  'dashboard TikTok approval route safety',
  () => {
    let server:
      Server | null = null;

    beforeEach(() => {
      vi.clearAllMocks();

      const gate =
        createGate();

      approvalMocks
        .getApprovalGate
        .mockReturnValue(
          gate,
        );

      actionMocks
        .listTikTokActionsByTypeAcrossAccounts
        .mockResolvedValue([]);

      reviewMocks
        .resolveTikTokDiscoveryReview
        .mockResolvedValue(
          createDiscoveryAction({
            status: 'success',
            result: {
              reviewDecision:
                'approved',
              engagementCreated:
                false,
              engagementExecuted:
                false,
            },
          }),
        );
    });

    afterEach(
      async () => {
        await closeServer(
          server,
        );
        server = null;
      },
    );

    it('lists only DISCOVERY_REVIEW actions from TikTok persistence', async () => {
      const pending =
        createDiscoveryAction();

      actionMocks
        .listTikTokActionsByTypeAcrossAccounts
        .mockImplementation(
          async (
            type: string,
            statuses:
              string[],
          ) => {
            if (
              type ===
                'DISCOVERY_REVIEW' &&
              statuses.includes(
                'pending',
              )
            ) {
              return [
                pending,
              ];
            }

            return [];
          },
        );

      const app =
        createApp();

      const started =
        await listen(app);

      server =
        started.server;

      const response =
        await fetch(
          `${started.baseUrl}/approvals`,
        );

      expect(
        response.status,
      ).toBe(200);

      const body =
        await response.json() as any;

      expect(
        actionMocks
          .listTikTokActionsByTypeAcrossAccounts,
      ).toHaveBeenNthCalledWith(
        1,
        'DISCOVERY_REVIEW',
        ['pending'],
        200,
      );

      expect(
        actionMocks
          .listTikTokActionsByTypeAcrossAccounts,
      ).toHaveBeenNthCalledWith(
        2,
        'DISCOVERY_REVIEW',
        [
          'success',
          'cancelled',
        ],
        500,
      );

      expect(
        body.pending,
      ).toHaveLength(1);

      expect(
        body.pending[0],
      ).toMatchObject({
        id:
          'tiktok-review:review-1',
        action:
          'DISCOVERY_REVIEW',
        source:
          'tiktok',
        persistent:
          true,
        tiktokActionId:
          'review-1',
      });
    });

    it('lists only resolved DISCOVERY_REVIEW actions in TikTok approval history', async () => {
      const approved =
        createDiscoveryAction({
          id:
            'review-approved',
          status:
            'success',
          result: {
            reviewDecision:
              'approved',
            reviewedAt:
              '2026-09-17T21:00:00.000Z',
          },
        });

      const denied =
        createDiscoveryAction({
          id:
            'review-denied',
          status:
            'cancelled',
          result: {
            reviewDecision:
              'rejected',
            reviewedAt:
              '2026-09-17T20:30:00.000Z',
          },
        });

      actionMocks
        .listTikTokActionsByTypeAcrossAccounts
        .mockResolvedValue([
          approved,
          denied,
        ]);

      const app =
        createApp();

      const started =
        await listen(app);

      server =
        started.server;

      const response =
        await fetch(
          `${started.baseUrl}/approvals/history`,
        );

      expect(
        response.status,
      ).toBe(200);

      expect(
        actionMocks
          .listTikTokActionsByTypeAcrossAccounts,
      ).toHaveBeenCalledTimes(
        1,
      );

      expect(
        actionMocks
          .listTikTokActionsByTypeAcrossAccounts,
      ).toHaveBeenCalledWith(
        'DISCOVERY_REVIEW',
        [
          'success',
          'cancelled',
        ],
        100,
      );

      const body =
        await response.json() as any[];

      expect(body).toHaveLength(2);

      expect(
        body.map(
          item =>
            item.action,
        ),
      ).toEqual([
        'DISCOVERY_REVIEW',
        'DISCOVERY_REVIEW',
      ]);

      expect(
        body.map(
          item =>
            item.id,
        ),
      ).toEqual([
        'tiktok-review:review-approved',
        'tiktok-review:review-denied',
      ]);

      expect(
        body.some(
          item =>
            item.action ===
            'UNFOLLOW',
        ),
      ).toBe(false);
    });

    it('approves a TikTok discovery review as decision-only', async () => {
      const app =
        createApp();

      const started =
        await listen(app);

      server =
        started.server;

      const response =
        await fetch(
          `${started.baseUrl}/approvals/tiktok-review:review-1/approve`,
          {
            method: 'POST',
          },
        );

      expect(
        response.status,
      ).toBe(200);

      expect(
        reviewMocks
          .resolveTikTokDiscoveryReview,
      ).toHaveBeenCalledWith(
        'review-1',
        'approved',
        'approved_via_dashboard',
      );

      const body =
        await response.json() as any;

      expect(
        body,
      ).toMatchObject({
        ok: true,
        action:
          'approved',
        source:
          'tiktok',
        tiktokActionId:
          'review-1',
        engagementCreated:
          false,
        engagementExecuted:
          false,
      });
    });

    it('denies a TikTok discovery review as decision-only', async () => {
      reviewMocks
        .resolveTikTokDiscoveryReview
        .mockResolvedValue(
          createDiscoveryAction({
            status:
              'cancelled',
            result: {
              reviewDecision:
                'rejected',
              engagementCreated:
                false,
              engagementExecuted:
                false,
            },
          }),
        );

      const app =
        createApp();

      const started =
        await listen(app);

      server =
        started.server;

      const response =
        await fetch(
          `${started.baseUrl}/approvals/tiktok-review:review-1/deny`,
          {
            method: 'POST',
          },
        );

      expect(
        response.status,
      ).toBe(200);

      expect(
        reviewMocks
          .resolveTikTokDiscoveryReview,
      ).toHaveBeenCalledWith(
        'review-1',
        'rejected',
        'rejected_via_dashboard',
      );

      const body =
        await response.json() as any;

      expect(
        body,
      ).toMatchObject({
        ok: true,
        action:
          'denied',
        source:
          'tiktok',
        engagementCreated:
          false,
        engagementExecuted:
          false,
      });
    });

    it('returns 409 when a fabricated TikTok review id points to an UNFOLLOW action', async () => {
      reviewMocks
        .resolveTikTokDiscoveryReview
        .mockRejectedValue(
          new Error(
            'Action is not a discovery review: unfollow-review-1',
          ),
        );

      const gate =
        createGate();

      approvalMocks
        .getApprovalGate
        .mockReturnValue(
          gate,
        );

      const app =
        createApp();

      const started =
        await listen(app);

      server =
        started.server;

      const response =
        await fetch(
          `${started.baseUrl}/approvals/tiktok-review:unfollow-review-1/approve`,
          {
            method: 'POST',
          },
        );

      expect(
        response.status,
      ).toBe(409);

      const body =
        await response.json() as any;

      expect(
        body,
      ).toMatchObject({
        ok: false,
        source:
          'tiktok',
        error:
          'Action is not a discovery review: unfollow-review-1',
      });

      expect(
        reviewMocks
          .resolveTikTokDiscoveryReview,
      ).toHaveBeenCalledWith(
        'unfollow-review-1',
        'approved',
        'approved_via_dashboard',
      );

      expect(
        gate.approve,
      ).not.toHaveBeenCalled();
    });

    it('returns 409 for the same fabricated UNFOLLOW id on deny', async () => {
      reviewMocks
        .resolveTikTokDiscoveryReview
        .mockRejectedValue(
          new Error(
            'Action is not a discovery review: unfollow-review-1',
          ),
        );

      const gate =
        createGate();

      approvalMocks
        .getApprovalGate
        .mockReturnValue(
          gate,
        );

      const app =
        createApp();

      const started =
        await listen(app);

      server =
        started.server;

      const response =
        await fetch(
          `${started.baseUrl}/approvals/tiktok-review:unfollow-review-1/deny`,
          {
            method: 'POST',
          },
        );

      expect(
        response.status,
      ).toBe(409);

      expect(
        gate.deny,
      ).not.toHaveBeenCalled();
    });
  },
);

import 'dotenv/config';

import {
  MobileAgent,
  type MobileAgentConfig,
  type MobileActionType,
} from '../src/actions/mobile/mobile-agent.js';

const deviceId =
  process.env.TIKTOK_SMOKE_DEVICE?.trim();

const appiumUrl =
  (
    process.env.TIKTOK_SMOKE_APPIUM_URL ??
    'http://127.0.0.1:4723'
  ).trim();

if (!deviceId) {
  throw new Error(
    'TIKTOK_SMOKE_DEVICE is required.',
  );
}

const actions: MobileActionType[] = [
  'like',
  'comment',
  'follow',
  'share',
  'scroll',
];

const suffix =
  `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

const agentId =
  `tiktok-integrated-smoke-${suffix}`;

const schedule =
  Object.fromEntries(
    actions.map(
      action => [
        action,
        {
          intervalMinutes:
            0.01,
          dailyLimit:
            1,
        },
      ],
    ),
  );

const config: MobileAgentConfig = {
  id:
    agentId,
  app:
    'tiktok',
  deviceId,
  appiumUrl,
  actions,
  schedule,
  activeHours: {
    weekday: {
      start: 0,
      end: 24,
    },
    weekend: {
      start: 0,
      end: 24,
    },
  },
  content: {
    tone:
      'integrated-smoke',
    language:
      'pt-BR',
    topics: [
      'smoke-test',
    ],
    maxLength:
      32,
  },
  safety: {
    minDelaySeconds:
      1,
    maxActionsPerHour:
      10,
    pauseOnErrorCount:
      1,
    pauseDurationMinutes:
      60,
  },
  testMode:
    true,
  warmupSeconds:
    0,
};

const agent =
  MobileAgent.createAgent(
    config,
  );

const sleep =
  (ms: number) =>
    new Promise<void>(
      resolve =>
        setTimeout(
          resolve,
          ms,
        ),
    );

function completedActions(): string[] {
  const stats =
    agent.getStatus().stats;

  return [
    stats.likes >= 1
      ? 'like'
      : null,
    stats.comments >= 1
      ? 'comment'
      : null,
    stats.follows >= 1
      ? 'follow'
      : null,
    stats.shares >= 1
      ? 'share'
      : null,
    stats.scrolls >= 1
      ? 'scroll'
      : null,
  ].filter(
    (
      value,
    ): value is string =>
      value !== null,
  );
}

try {
  console.log(
    '[1/3] Starting normal MobileAgent loop in testMode...',
  );

  await agent.start();

  const startedAt =
    Date.now();

  const timeoutMs =
    45_000;

  while (
    completedActions().length <
      actions.length
  ) {
    if (
      Date.now() -
        startedAt >
      timeoutMs
    ) {
      throw new Error(
        `Integrated MobileAgent smoke timed out. Completed: ${completedActions().join(', ')}`,
      );
    }

    await sleep(
      250,
    );
  }

  agent.pause();

  console.log(
    '[2/3] All configured TikTok actions passed through the normal scheduler loop.',
  );

  const status =
    agent.getStatus();

  const logs =
    agent.getLogs(
      100,
    );

  const warmupSkipped =
    logs.some(
      entry =>
        entry.action ===
          'system' &&
        entry.message ===
          'Warmup skipped — beginning action loop',
    );

  if (!warmupSkipped) {
    throw new Error(
      'Expected warmup skip marker was not found.',
    );
  }

  const actionErrors =
    logs.filter(
      entry =>
        entry.status ===
          'error',
    );

  if (
    actionErrors.length >
      0
  ) {
    throw new Error(
      `Integrated MobileAgent smoke logged errors: ${JSON.stringify(actionErrors)}`,
    );
  }

  if (
    status.stats.totalActions !==
      actions.length
  ) {
    throw new Error(
      `Expected ${actions.length} total actions, got ${status.stats.totalActions}.`,
    );
  }

  console.log(
    '[3/3] Warmup/test-mode safety and counters confirmed.',
  );

  console.log('');
  console.log(
    'MOBILE_AGENT_INTEGRATED_SMOKE=PASS',
  );
  console.log(
    'WARMUP=SKIPPED',
  );
  console.log(
    'TEST_MODE_MUTATIONS=false',
  );
  console.log(
    `ACTIONS=${actions.join(',')}`,
  );
  console.log(
    `TOTAL_ACTIONS=${status.stats.totalActions}`,
  );
  console.log(
    `STATS=${JSON.stringify(status.stats)}`,
  );
}
finally {
  await agent.stop();
}

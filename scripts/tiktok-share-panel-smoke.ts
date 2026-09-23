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

const suffix =
  `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

const agentId =
  `tiktok-share-smoke-${suffix}`;

const config: MobileAgentConfig = {
  id:
    agentId,
  app:
    'tiktok',
  deviceId,
  appiumUrl,
  actions: [
    'share',
  ],
  schedule: {
    share: {
      intervalMinutes:
        60,
      dailyLimit:
        1,
    },
  },
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
      'share-smoke',
    language:
      'pt-BR',
    topics: [],
    maxLength:
      1,
  },
  safety: {
    minDelaySeconds:
      3600,
    maxActionsPerHour:
      1,
    pauseOnErrorCount:
      1,
    pauseDurationMinutes:
      60,
  },
  testMode:
    false,
  warmupSeconds:
    0,
};

const agent =
  MobileAgent.createAgent(
    config,
  );

type ShareCapableMobileAgent = {
  executeTikTokAction(
    action: MobileActionType,
  ): Promise<void>;
};

try {
  console.log(
    '[1/3] Starting TikTok Android session...',
  );

  await agent.start();

  /*
   * Stop the autonomous warmup/action loop immediately.
   * The share smoke invokes only the production share handler below.
   */
  agent.pause();

  console.log(
    '[2/3] Opening and closing TikTok share panel...',
  );

  await (
    agent as unknown as
      ShareCapableMobileAgent
  ).executeTikTokAction(
    'share',
  );

  const logs =
    agent.getLogs(
      20,
    );

  const success =
    logs.some(
      entry =>
        entry.action ===
          'share' &&
        entry.status ===
          'success' &&
        entry.message ===
          'Opened TikTok share panel without sharing',
    );

  if (!success) {
    throw new Error(
      'Share handler returned without the expected safe success marker.',
    );
  }

  console.log(
    '[3/3] Safe share panel flow confirmed.',
  );

  console.log('');
  console.log(
    'SHARE_SMOKE_RESULT=PASS',
  );
  console.log(
    'SHARE_PANEL=OPENED_AND_CLOSED',
  );
  console.log(
    'RECIPIENT_CLICKED=false',
  );
  console.log(
    'SHARE_SENT=false',
  );
}
finally {
  await agent.stop();
}

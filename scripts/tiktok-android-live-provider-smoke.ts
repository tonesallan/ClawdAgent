import 'dotenv/config';

import {
  execSync,
} from 'child_process';

import {
  MobileAgent,
  type MobileAgentConfig,
} from '../src/actions/mobile/mobile-agent.js';

import {
  createLiveAndroidTikTokProvider,
} from '../src/tiktok/providers/live-android-tiktok-provider.js';

function resolveDeviceId(): string {
  const configured =
    process.env
      .TIKTOK_SMOKE_DEVICE
      ?.trim();

  if (configured) {
    return configured;
  }

  const output =
    execSync(
      'adb devices',
      {
        timeout:
          5_000,
      },
    )
      .toString();

  const devices =
    output
      .split(
        /\r?\n/,
      )
      .slice(
        1,
      )
      .map(
        line =>
          line.trim(),
      )
      .filter(
        Boolean,
      )
      .map(
        line => {
          const [
            id,
            status,
          ] =
            line.split(
              /\s+/,
            );

          return {
            id,
            status,
          };
        },
      )
      .filter(
        device =>
          device.id &&
          device.status ===
            'device',
      );

  if (
    devices.length ===
      0
  ) {
    throw new Error(
      'No authorized Android device found via ADB.',
    );
  }

  const usbDevices =
    devices.filter(
      device =>
        !device.id.includes(
          ':',
        ),
    );

  if (
    usbDevices.length ===
      1
  ) {
    return usbDevices[0]
      .id;
  }

  if (
    devices.length ===
      1
  ) {
    return devices[0]
      .id;
  }

  throw new Error(
    `Multiple Android devices found: ${devices.map(device => device.id).join(', ')}`,
  );
}

const deviceId =
  resolveDeviceId();

const appiumUrl =
  (
    process.env
      .TIKTOK_SMOKE_APPIUM_URL ??
    process.env
      .APPIUM_URL ??
    'http://127.0.0.1:4723'
  )
    .trim();

const username =
  (
    process.env
      .TIKTOK_SMOKE_USERNAME ??
    'tiktok'
  )
    .trim()
    .replace(
      /^@/,
      '',
    );

const agentId =
  `${deviceId}:tiktok`;

const config:
  MobileAgentConfig = {
    id:
      agentId,
    app:
      'tiktok',
    deviceId,
    appiumUrl,
    actions:
      [],
    schedule:
      {},
    activeHours: {
      weekday: {
        start:
          0,
        end:
          24,
      },
      weekend: {
        start:
          0,
        end:
          24,
      },
    },
    content: {
      tone:
        'android-readonly-smoke',
      language:
        'pt-BR',
      topics:
        [],
      maxLength:
        1,
    },
    safety: {
      minDelaySeconds:
        3600,
      maxActionsPerHour:
        0,
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

console.log(
  '============================================================',
);

console.log(
  ' TIKTOK ANDROID - REAL READ-ONLY PROVIDER SMOKE',
);

console.log(
  '============================================================',
);

console.log(
  `DEVICE_ID=${deviceId}`,
);

console.log(
  `APPIUM_URL=${appiumUrl}`,
);

console.log(
  `TARGET=@${username}`,
);

console.log(
  'BROWSER_OPENED=false',
);

console.log(
  'SOCIAL_MUTATIONS_PERFORMED=false',
);

try {
  await agent.start();

  /*
   * Prevent the normal autonomous scheduler from running.
   * The Appium session remains active for the read-only provider.
   */
  agent.pause();

  const provider =
    createLiveAndroidTikTokProvider();

  const observation =
    await provider
      .checkRelationship({
        targetKey:
          `username:${username.toLowerCase()}`,
        accountKey:
          agentId,
        username,
      });

  console.log(
    `PROVIDER=${observation.provider}`,
  );

  console.log(
    `RELATIONSHIP=${observation.relationship}`,
  );

  console.log(
    `DETAILS=${JSON.stringify(observation.details ?? {})}`,
  );

  if (
    observation.provider !==
      'android'
  ) {
    throw new Error(
      `Unexpected provider: ${observation.provider}`,
    );
  }

  if (
    observation.relationship ===
      'unknown'
  ) {
    throw new Error(
      'Android relationship classification returned unknown.',
    );
  }

  if (
    observation.details
      ?.readOnly !==
      true
  ) {
    throw new Error(
      'Android observation is not marked readOnly=true.',
    );
  }

  console.log(
    '',
  );

  console.log(
    'TIKTOK_ANDROID_LIVE_PROVIDER_SMOKE=PASS',
  );

  console.log(
    'ANDROID_APP_NAVIGATION=PASS',
  );

  console.log(
    'READ_ONLY=PASS',
  );

  console.log(
    'BROWSER_OPENED=false',
  );

  console.log(
    'SOCIAL_MUTATIONS_PERFORMED=false',
  );
}
finally {
  await agent.stop();

  MobileAgent.removeAgent(
    agentId,
  );

  console.log(
    'ANDROID_SESSION_CLOSE=PASS',
  );
}

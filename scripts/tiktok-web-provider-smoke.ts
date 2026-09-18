import 'dotenv/config';

import {
  WebTikTokProvider,
} from '../src/tiktok/providers/web-tiktok-provider.js';

const accountId =
  process.env.TIKTOK_WEB_ACCOUNT_ID?.trim() ??
  '';

const targetUsername =
  (
    process.env.TIKTOK_WEB_PROVIDER_SMOKE_USERNAME ??
    'tiktok'
  )
    .trim()
    .replace(
      /^@/,
      '',
    );

const expectedRelationship =
  (
    process.env.TIKTOK_WEB_PROVIDER_SMOKE_EXPECTED ??
    'not_following'
  )
    .trim();

if (!accountId) {
  throw new Error(
    'TIKTOK_WEB_ACCOUNT_ID is required for the real Web provider smoke.',
  );
}

if (!targetUsername) {
  throw new Error(
    'TIKTOK_WEB_PROVIDER_SMOKE_USERNAME resolved to an empty username.',
  );
}

console.log(
  '============================================================',
);

console.log(
  ' TIKTOK WEB PROVIDER - REAL READ-ONLY SMOKE',
);

console.log(
  '============================================================',
);

console.log(
  `ACCOUNT_ID=${accountId}`,
);

console.log(
  `TARGET=@${targetUsername}`,
);

console.log(
  'MOBILE_DEVICE=Pixel 5',
);

console.log(
  'BROWSER_MODE=headed',
);

console.log(
  'MUTATIONS_PERFORMED=false',
);

const provider =
  new WebTikTokProvider({
    mobileDeviceName:
      'Pixel 5',
    headed:
      true,
  });

const observation =
  await provider.checkRelationship({
    targetKey:
      `username:${targetUsername}`,
    accountKey:
      accountId,
    username:
      targetUsername,
  });

console.log(
  `PROVIDER=${observation.provider}`,
);

console.log(
  `RELATIONSHIP=${observation.relationship}`,
);

console.log(
  `OBSERVED_AT=${observation.observedAt.toISOString()}`,
);

console.log(
  `DETAILS=${JSON.stringify(observation.details ?? {})}`,
);

if (
  observation.provider !==
    'web'
) {
  throw new Error(
    `Unexpected provider: ${observation.provider}`,
  );
}

if (
  observation.targetKey !==
    `username:${targetUsername}`
) {
  throw new Error(
    `Unexpected targetKey: ${observation.targetKey}`,
  );
}

if (
  observation.relationship !==
    expectedRelationship
) {
  throw new Error(
    `Unexpected relationship. Expected ${expectedRelationship}, got ${observation.relationship}.`,
  );
}

console.log(
  '',
);

console.log(
  'TIKTOK_WEB_PROVIDER_SMOKE=PASS',
);

console.log(
  `EXPECTED_RELATIONSHIP=${expectedRelationship}`,
);

console.log(
  'READ_ONLY=PASS',
);

console.log(
  'MUTATIONS_PERFORMED=false',
);

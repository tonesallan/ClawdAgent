import 'dotenv/config';

import express from 'express';

import {
  closeDatabase,
  initDatabase,
} from '../src/memory/database.js';

import {
  setupTikTokRoutes,
} from '../src/interfaces/web/routes/tiktok-api.js';

import {
  getTikTokRuntime,
} from '../src/tiktok/runtime.js';

console.log(
  '============================================================',
);

console.log(
  ' TIKTOK FINAL API / DASHBOARD BACKEND SMOKE',
);

console.log(
  '============================================================',
);

console.log(
  'DB_MUTATIONS_PERFORMED=false',
);

console.log(
  'BROWSER_OPENED=false',
);

await initDatabase();

const app =
  express();

app.use(
  express.json(),
);

app.use(
  '/api/tiktok',
  setupTikTokRoutes(),
);

const server =
  await new Promise<
    ReturnType<typeof app.listen>
  >(
    (
      resolve,
      reject,
    ) => {
      const instance =
        app.listen(
          0,
          '127.0.0.1',
          () =>
            resolve(
              instance,
            ),
        );

      instance.on(
        'error',
        reject,
      );
    },
  );

try {
  const address =
    server.address();

  if (
    !address ||
    typeof address ===
      'string'
  ) {
    throw new Error(
      'Failed to resolve ephemeral API port.',
    );
  }

  const baseUrl =
    `http://127.0.0.1:${address.port}/api/tiktok`;

  const endpoints = [
    '/provider-status',
    '/core/overview?limit=10',
    '/reviews',
    '/runtime/status',
  ];

  for (
    const endpoint of
      endpoints
  ) {
    const response =
      await fetch(
        `${baseUrl}${endpoint}`,
      );

    const body =
      await response.text();

    console.log(
      `ENDPOINT ${endpoint} STATUS=${response.status}`,
    );

    if (
      response.status !==
        200
    ) {
      throw new Error(
        `Endpoint failed: ${endpoint} -> ${response.status}: ${body}`,
      );
    }

    if (
      body.includes(
        'sessionid',
      ) ||
      body.includes(
        '"cookies":',
      )
    ) {
      throw new Error(
        `Sensitive cookie material appeared in ${endpoint}.`,
      );
    }

    if (
      endpoint ===
        '/provider-status' &&
      (
        body.includes(
          '"browserProvider"',
        ) ||
        body.includes(
          '"accounts"',
        )
      )
    ) {
      throw new Error(
        'Provider status still exposes legacy Web/browser controls.',
      );
    }
  }

  console.log(
    '',
  );

  console.log(
    'TIKTOK_FINAL_API_SMOKE=PASS',
  );

  console.log(
    'DASHBOARD_BACKEND_ROUTES=PASS',
  );

  console.log(
    'SENSITIVE_COOKIE_FIELDS=ABSENT',
  );

  console.log(
    'LEGACY_BROWSER_PROVIDER_FIELDS=ABSENT',
  );

  console.log(
    'DB_MUTATIONS_PERFORMED=false',
  );

  console.log(
    'BROWSER_OPENED=false',
  );
}
finally {
  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      server.close(
        error => {
          if (error) {
            reject(
              error,
            );
            return;
          }

          resolve();
        },
      );
    },
  );

  await getTikTokRuntime()
    .stop();

  await closeDatabase();

  console.log(
    'API_SERVER_CLOSE=PASS',
  );

  console.log(
    'DATABASE_CLOSE=PASS',
  );
}

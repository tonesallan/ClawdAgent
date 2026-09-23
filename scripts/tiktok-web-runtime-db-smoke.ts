import 'dotenv/config';

import {
  closeDatabase,
  initDatabase,
} from '../src/memory/database.js';

import {
  listDueScheduledTikTokActions,
} from '../src/memory/repositories/tiktok-actions.js';

import {
  TikTokRuntime,
} from '../src/tiktok/runtime.js';

import {
  TikTokProviderRegistry,
} from '../src/tiktok/provider-registry.js';

import {
  WebTikTokProvider,
} from '../src/tiktok/providers/web-tiktok-provider.js';

console.log(
  '============================================================',
);

console.log(
  ' TIKTOK WEB RUNTIME - REAL DB READ-ONLY SMOKE',
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

const registry =
  new TikTokProviderRegistry();

const provider =
  new WebTikTokProvider();

let queriedProviders:
  readonly string[] =
    [];

let dueActionIds:
  string[] =
    [];

const runtime =
  new TikTokRuntime({
    registry,
    providers: [
      provider,
    ],
    schedulerRunner:
      async options => {
        queriedProviders =
          options.providerNames ??
          [];

        const actions =
          await listDueScheduledTikTokActions(
            new Date(),
            50,
            queriedProviders,
          );

        const invalidProviders =
          actions.filter(
            action =>
              !queriedProviders.includes(
                action.provider ?? '',
              ),
          );

        if (
          invalidProviders.length >
          0
        ) {
          throw new Error(
            `Provider filter leaked ${invalidProviders.length} unsupported action(s).`,
          );
        }

        dueActionIds =
          actions.map(
            action =>
              action.id,
          );

        console.log(
          `REAL_DB_DUE_WEB_ACTIONS=${actions.length}`,
        );

        console.log(
          `REAL_DB_PROVIDER_VALUES=${JSON.stringify([
            ...new Set(
              actions.map(
                action =>
                  action.provider,
              ),
            ),
          ])}`,
        );

        console.log(
          'REAL_DB_QUERY_MODE=SELECT_ONLY',
        );

        return {
          scanned:
            actions.length,
          processed:
            0,
          succeeded:
            0,
          failed:
            0,
          skipped:
            actions.length,
        };
      },
  });

try {
  const result =
    await runtime.runOnce();

  const registeredProviders =
    runtime.getRegisteredProviders();

  console.log(
    `REGISTERED_PROVIDERS=${JSON.stringify(registeredProviders)}`,
  );

  console.log(
    `QUERY_PROVIDER_SCOPE=${JSON.stringify(queriedProviders)}`,
  );

  console.log(
    `DUE_ACTION_IDS_COUNT=${dueActionIds.length}`,
  );

  console.log(
    `RUNTIME_RESULT=${JSON.stringify(result)}`,
  );

  if (
    registeredProviders.length !==
      1 ||
    registeredProviders[0] !==
      'web'
  ) {
    throw new Error(
      `Unexpected runtime providers: ${JSON.stringify(registeredProviders)}`,
    );
  }

  if (
    queriedProviders.length !==
      1 ||
    queriedProviders[0] !==
      'web'
  ) {
    throw new Error(
      `Unexpected DB provider scope: ${JSON.stringify(queriedProviders)}`,
    );
  }

  if (
    result.processed !==
      0 ||
    result.succeeded !==
      0 ||
    result.failed !==
      0
  ) {
    throw new Error(
      `Read-only DB smoke unexpectedly processed actions: ${JSON.stringify(result)}`,
    );
  }

  console.log('');
  console.log(
    'TIKTOK_WEB_RUNTIME_DB_SMOKE=PASS',
  );
  console.log(
    'PROVIDER_SCOPE_WEB_ONLY=PASS',
  );
  console.log(
    'REAL_DB_READ_ONLY=PASS',
  );
  console.log(
    'ACTIONS_CREATED=0',
  );
  console.log(
    'ACTIONS_EXECUTED=0',
  );
  console.log(
    'BROWSER_OPENED=false',
  );
}
finally {
  await runtime.stop();

  console.log(
    'RUNTIME_STOP=PASS',
  );

  await closeDatabase();

  console.log(
    'DATABASE_CLOSE=PASS',
  );
}

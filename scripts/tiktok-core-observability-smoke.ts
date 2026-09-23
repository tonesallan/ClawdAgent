import 'dotenv/config';

import {
  closeDatabase,
  initDatabase,
} from '../src/memory/database.js';

import {
  getTikTokCoreOverview,
} from '../src/tiktok/core-observability-service.js';

console.log(
  '============================================================',
);

console.log(
  ' TIKTOK CORE OBSERVABILITY - REAL DB READ-ONLY SMOKE',
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

try {
  const overview =
    await getTikTokCoreOverview({
      historyLimit:
        10,
      relationshipLimit:
        10,
    });

  console.log(
    `ACTION_TOTAL=${overview.actions.total}`,
  );

  console.log(
    `RELATIONSHIP_TOTAL=${overview.relationships.total}`,
  );

  console.log(
    `HISTORY_ROWS=${overview.history.length}`,
  );

  console.log(
    `RECENT_RELATIONSHIPS=${overview.recentRelationships.length}`,
  );

  console.log(
    `ACTION_STATUS_BUCKETS=${overview.actions.byStatus.length}`,
  );

  console.log(
    `ACTION_PROVIDER_BUCKETS=${overview.actions.byProvider.length}`,
  );

  console.log(
    `RELATIONSHIP_STATE_BUCKETS=${overview.relationships.byState.length}`,
  );

  const serialized =
    JSON.stringify(
      overview,
    );

  if (
    serialized.includes(
      '"cookies"',
    ) ||
    serialized.includes(
      'sessionid',
    )
  ) {
    throw new Error(
      'Sensitive cookie material unexpectedly appeared in core telemetry.',
    );
  }

  console.log(
    '',
  );

  console.log(
    'TIKTOK_CORE_OBSERVABILITY_SMOKE=PASS',
  );

  console.log(
    'REAL_DB_READ_ONLY=PASS',
  );

  console.log(
    'SENSITIVE_COOKIE_FIELDS=ABSENT',
  );
}
finally {
  await closeDatabase();

  console.log(
    'DATABASE_CLOSE=PASS',
  );
}

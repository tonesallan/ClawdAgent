import 'dotenv/config';

import {
  existsSync,
  readFileSync,
} from 'fs';

import {
  resolve,
} from 'path';

import {
  TikTokAccountManager,
} from '../src/actions/browser/tiktok-manager.js';

import {
  validateTikTokCookies,
} from '../src/actions/browser/tiktok-cookies.js';

const dataDir =
  resolve(
    process.cwd(),
    'data',
  );

const accountsFile =
  resolve(
    dataDir,
    'tiktok-accounts.json',
  );

if (
  !existsSync(
    accountsFile,
  )
) {
  throw new Error(
    `TikTok accounts file not found: ${accountsFile}`,
  );
}

function readStoredAccounts():
  Array<Record<string, unknown>> {

  const parsed =
    JSON.parse(
      readFileSync(
        accountsFile,
        'utf-8',
      ),
    );

  if (
    !Array.isArray(
      parsed,
    )
  ) {
    throw new Error(
      'TikTok accounts metadata file is not an array.',
    );
  }

  return parsed as
    Array<Record<string, unknown>>;
}

const before =
  readStoredAccounts();

const legacyCookieFieldsBefore =
  before.filter(
    account =>
      Array.isArray(
        account.cookies,
      ),
  ).length;

console.log(
  '============================================================',
);

console.log(
  ' TIKTOK COOKIE VAULT - REAL MIGRATION SMOKE',
);

console.log(
  '============================================================',
);

console.log(
  `PLATFORM=${process.platform}`,
);

console.log(
  `ACCOUNT_COUNT_BEFORE=${before.length}`,
);

console.log(
  `LEGACY_COOKIE_FIELDS_BEFORE=${legacyCookieFieldsBefore}`,
);

console.log(
  'COOKIE_VALUES_PRINTED=false',
);

const manager =
  TikTokAccountManager
    .getInstance();

/*
 * First load performs the one-time legacy migration when necessary.
 * Second load proves the active JSON can be rehydrated from the vault.
 */
const firstLoad =
  manager.listAccounts();

const secondLoad =
  manager.listAccounts();

const after =
  readStoredAccounts();

const plaintextCookieFieldsAfter =
  after.filter(
    account =>
      Object.prototype
        .hasOwnProperty
        .call(
          account,
          'cookies',
        ),
  ).length;

const invalidReferences =
  after.filter(
    account =>
      typeof account
        .cookieSecretRef !==
          'string' ||
      !String(
        account.cookieSecretRef,
      ).startsWith(
        'vault:',
      ),
  );

if (
  plaintextCookieFieldsAfter !==
    0
) {
  throw new Error(
    `Plaintext cookie fields remain in tiktok-accounts.json: ${plaintextCookieFieldsAfter}`,
  );
}

if (
  invalidReferences.length >
    0
) {
  throw new Error(
    `Invalid cookie vault references found: ${invalidReferences.length}`,
  );
}

if (
  firstLoad.length !==
    after.length ||
  secondLoad.length !==
    after.length
) {
  throw new Error(
    'Account count changed during cookie vault migration.',
  );
}

const invalidActiveAccounts =
  secondLoad.filter(
    account =>
      account.status ===
        'active' &&
      !validateTikTokCookies(
        account.cookies,
      ).valid,
  );

if (
  invalidActiveAccounts.length >
    0
) {
  throw new Error(
    `Active TikTok accounts could not be rehydrated from the encrypted vault: ${invalidActiveAccounts.length}`,
  );
}

const schemes =
  new Set<string>();

for (
  const account of
    after
) {
  const id =
    String(
      account.id ?? '',
    );

  if (!id) {
    throw new Error(
      'TikTok account metadata contains an empty id.',
    );
  }

  const safeId =
    id.replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );

  const vaultFile =
    resolve(
      dataDir,
      'tiktok-cookie-vault',
      `${safeId}.json`,
    );

  if (
    !existsSync(
      vaultFile,
    )
  ) {
    throw new Error(
      `Encrypted cookie vault file missing for account ${id}.`,
    );
  }

  const vaultRecord =
    JSON.parse(
      readFileSync(
        vaultFile,
        'utf-8',
      ),
    ) as
      Record<string, unknown>;

  if (
    typeof vaultRecord.scheme !==
      'string'
  ) {
    throw new Error(
      `Cookie vault scheme missing for account ${id}.`,
    );
  }

  schemes.add(
    vaultRecord.scheme,
  );

  const rawVault =
    readFileSync(
      vaultFile,
      'utf-8',
    );

  for (
    const cookie of
      secondLoad.find(
        item =>
          item.id ===
            id,
      )?.cookies ?? []
  ) {
    if (
      cookie.value &&
      rawVault.includes(
        cookie.value,
      )
    ) {
      throw new Error(
        `Plaintext cookie value detected in encrypted vault for account ${id}.`,
      );
    }
  }
}

console.log(
  `ACCOUNT_COUNT_AFTER=${after.length}`,
);

console.log(
  `PLAINTEXT_COOKIE_FIELDS_AFTER=${plaintextCookieFieldsAfter}`,
);

console.log(
  `VAULT_REFERENCES=${after.length}`,
);

console.log(
  `VAULT_SCHEMES=${JSON.stringify([
    ...schemes,
  ])}`,
);

console.log(
  `ACTIVE_ACCOUNTS_REHYDRATED=${
    secondLoad.filter(
      account =>
        account.status ===
          'active',
    ).length
  }`,
);

console.log(
  'COOKIE_VALUES_PRINTED=false',
);

console.log(
  '',
);

console.log(
  'TIKTOK_COOKIE_VAULT_MIGRATION=PASS',
);

console.log(
  'PLAINTEXT_ACCOUNT_JSON=REMOVED',
);

console.log(
  'VAULT_REHYDRATION=PASS',
);

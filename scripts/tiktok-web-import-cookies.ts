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
  parseTikTokCookies,
  validateTikTokCookies,
} from '../src/actions/browser/tiktok-cookies.js';

const accountManager =
  TikTokAccountManager.getInstance();

const cookieFileInput =
  process.env.TIKTOK_WEB_COOKIE_FILE?.trim() ??
  '';

const accountName =
  (
    process.env.TIKTOK_WEB_ACCOUNT_NAME ??
    'TikTok Web Local'
  ).trim();

const requestedAccountId =
  process.env.TIKTOK_WEB_ACCOUNT_ID?.trim() ??
  '';

if (!cookieFileInput) {
  throw new Error(
    'TIKTOK_WEB_COOKIE_FILE is required.',
  );
}

if (!accountName) {
  throw new Error(
    'TIKTOK_WEB_ACCOUNT_NAME resolved to an empty value.',
  );
}

const cookieFile =
  resolve(
    cookieFileInput,
  );

if (
  !existsSync(
    cookieFile,
  )
) {
  throw new Error(
    `TikTok cookie file not found: ${cookieFile}`,
  );
}

const cookieInput =
  readFileSync(
    cookieFile,
    'utf8',
  ).trim();

if (!cookieInput) {
  throw new Error(
    'TikTok cookie file is empty.',
  );
}

console.log(
  '[1/3] Loading TikTok cookies from local file...',
);

console.log(
  `COOKIE_FILE=${cookieFile}`,
);

console.log(
  'COOKIE_VALUES_PRINTED=false',
);

const parsed =
  parseTikTokCookies(
    cookieInput,
  );

if (parsed.error) {
  throw new Error(
    `Cookie parse error: ${parsed.error}`,
  );
}

if (
  parsed.cookies.length ===
    0
) {
  throw new Error(
    'No TikTok cookies were found in the file.',
  );
}

const preValidation =
  validateTikTokCookies(
    parsed.cookies,
  );

if (!preValidation.valid) {
  throw new Error(
    `Imported TikTok cookies are missing required cookies: ${preValidation.missing.join(', ')}`,
  );
}

const existingAccounts =
  accountManager.listAccounts();

let accountId:
  string;

let cookieCount:
  number;

let validation:
  {
    valid: boolean;
    missing: string[];
    warnings: string[];
  };

if (requestedAccountId) {
  const existing =
    existingAccounts.find(
      account =>
        account.id ===
        requestedAccountId,
    );

  if (!existing) {
    throw new Error(
      `TikTok Web account not found for update: ${requestedAccountId}`,
    );
  }

  const updated =
    accountManager.updateCookies(
      requestedAccountId,
      cookieInput,
    );

  accountId =
    updated.account.id;

  cookieCount =
    updated.account.cookies.length;

  validation =
    updated.validation;

  console.log(
    '[2/3] Existing TikTok Web account cookies updated.',
  );
} else {
  const created =
    accountManager.addAccount(
      accountName,
      cookieInput,
    );

  accountId =
    created.account.id;

  cookieCount =
    created.account.cookies.length;

  validation =
    created.validation;

  console.log(
    '[2/3] TikTok Web account created from imported cookies.',
  );
}

if (!validation.valid) {
  throw new Error(
    `Imported TikTok cookies are missing required cookies: ${validation.missing.join(', ')}`,
  );
}

console.log(
  '[3/3] Cookie validation passed.',
);

console.log('');
console.log(
  'TIKTOK_WEB_COOKIE_IMPORT=PASS',
);
console.log(
  `ACCOUNT_ID=${accountId}`,
);
console.log(
  `COOKIE_COUNT=${cookieCount}`,
);
console.log(
  'COOKIE_VALIDATION=PASS',
);
console.log(
  `WARNINGS=${JSON.stringify(validation.warnings)}`,
);
console.log(
  'COOKIE_VALUES_PRINTED=false',
);

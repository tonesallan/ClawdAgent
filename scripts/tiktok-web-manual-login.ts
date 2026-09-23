import 'dotenv/config';

import {
  BrowserSessionManager,
} from '../src/actions/browser/session-manager.js';

import {
  TikTokAccountManager,
} from '../src/actions/browser/tiktok-manager.js';

const browserManager =
  BrowserSessionManager.getInstance();

const accountManager =
  TikTokAccountManager.getInstance();

const accountName =
  (
    process.env.TIKTOK_WEB_ACCOUNT_NAME ??
    'TikTok Web Local'
  ).trim();

if (!accountName) {
  throw new Error(
    'TIKTOK_WEB_ACCOUNT_NAME resolved to an empty value.',
  );
}

const existingAccounts =
  accountManager.listAccounts();

if (existingAccounts.length > 0) {
  console.log(
    'TIKTOK_WEB_MANUAL_LOGIN=SKIPPED',
  );
  console.log(
    'REASON=ACCOUNT_ALREADY_CONFIGURED',
  );
  console.log(
    `ACCOUNTS=${JSON.stringify(
      existingAccounts.map(
        account => ({
          id: account.id,
          name: account.name,
          handle: account.handle ?? null,
          status: account.status,
          cookieCount: account.cookies.length,
          lastVerified: account.lastVerified ?? null,
        }),
      ),
    )}`,
  );
  process.exit(0);
}

let sessionId:
  string | null =
    null;

try {
  console.log(
    '[1/4] Opening a visible TikTok browser session...',
  );

  console.log(
    'Complete the TikTok login manually in the browser window.',
  );

  console.log(
    'The script never reads or prints your password.',
  );

  const session =
    await browserManager.createSession(
      'https://www.tiktok.com/login',
      true,
    );

  sessionId =
    session.id;

  const page =
    browserManager.getPage(
      session.id,
    );

  if (!page) {
    throw new Error(
      'Visible TikTok browser session has no Playwright page.',
    );
  }

  console.log(
    '[2/4] Waiting for an authenticated TikTok session...',
  );

  const deadline =
    Date.now() +
    10 * 60_000;

  let sessionDetected =
    false;

  while (
    Date.now() <
      deadline
  ) {
    const cookies =
      await page.context().cookies(
        [
          'https://www.tiktok.com',
        ],
      );

    const hasSessionId =
      cookies.some(
        (
          cookie: {
            name: string;
          },
        ) =>
          cookie.name ===
          'sessionid',
      );

    if (hasSessionId) {
      sessionDetected =
        true;

      break;
    }

    await page.waitForTimeout(
      2_000,
    );
  }

  if (!sessionDetected) {
    throw new Error(
      'TikTok login was not completed before the manual-login timeout.',
    );
  }

  console.log(
    '[3/4] Authenticated session detected. Capturing account cookies...',
  );

  let detectedHandle:
    string | null =
      null;

  try {
    await page.goto(
      'https://www.tiktok.com/profile',
      {
        waitUntil:
          'domcontentloaded',
        timeout:
          30_000,
      },
    );

    await page.waitForTimeout(
      3_000,
    );

    const profileUrl =
      page.url();

    const handleMatch =
      profileUrl.match(
        /tiktok\.com\/@([^/?#]+)/i,
      );

    if (handleMatch) {
      detectedHandle =
        decodeURIComponent(
          handleMatch[1],
        );
    }
  } catch {
    // Handle discovery is optional; the authenticated cookies are primary.
  }

  const browserCookies =
    await page.context().cookies(
      [
        'https://www.tiktok.com',
      ],
    );

  const tiktokCookies =
    browserCookies
      .filter(
        (
          cookie: {
            domain: string;
          },
        ) =>
          cookie.domain.includes(
            'tiktok',
          ),
      )
      .map(
        (
          cookie: {
            name: string;
            value: string;
            domain: string;
            path: string;
            httpOnly: boolean;
            secure: boolean;
            expires: number;
            sameSite:
              | 'Strict'
              | 'Lax'
              | 'None';
          },
        ) => ({
          name:
            cookie.name,
          value:
            cookie.value,
          domain:
            cookie.domain,
          path:
            cookie.path || '/',
          httpOnly:
            cookie.httpOnly,
          secure:
            cookie.secure,
          expirationDate:
            cookie.expires > 0
              ? cookie.expires
              : undefined,
          sameSite:
            cookie.sameSite,
          hostOnly:
            !cookie.domain.startsWith(
              '.',
            ),
        }),
      );

  if (
    !tiktokCookies.some(
      cookie =>
        cookie.name ===
        'sessionid',
    )
  ) {
    throw new Error(
      'Authenticated browser no longer contains the required TikTok sessionid cookie.',
    );
  }

  const saved =
    accountManager.addAccount(
      detectedHandle
        ? `${accountName} (@${detectedHandle})`
        : accountName,
      JSON.stringify(
        tiktokCookies,
      ),
    );

  console.log(
    '[4/4] TikTok Web account saved locally.',
  );

  console.log('');
  console.log(
    'TIKTOK_WEB_MANUAL_LOGIN=PASS',
  );
  console.log(
    `ACCOUNT_ID=${saved.account.id}`,
  );
  console.log(
    `ACCOUNT_NAME=${saved.account.name}`,
  );
  console.log(
    `DETECTED_HANDLE=${detectedHandle ?? ''}`,
  );
  console.log(
    `COOKIE_COUNT=${saved.account.cookies.length}`,
  );
  console.log(
    `COOKIE_VALIDATION=${saved.validation.valid ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    'COOKIE_VALUES_PRINTED=false',
  );
}
finally {
  if (sessionId) {
    await browserManager
      .closeSession(
        sessionId,
      )
      .catch(
        () => {},
      );
  }

  await browserManager.closeAll();
}

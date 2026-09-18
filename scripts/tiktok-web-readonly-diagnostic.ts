import 'dotenv/config';

import {
  mkdirSync,
  writeFileSync,
} from 'fs';

import {
  resolve,
} from 'path';

import {
  BrowserSessionManager,
} from '../src/actions/browser/session-manager.js';

import {
  TikTokAccountManager,
  dismissTikTokBanners,
  type TikTokAccount,
} from '../src/actions/browser/tiktok-manager.js';

const accountManager =
  TikTokAccountManager.getInstance();

const browserManager =
  BrowserSessionManager.getInstance();

const requestedAccountId =
  process.env.TIKTOK_WEB_ACCOUNT_ID?.trim() ??
  '';

const targetUsername =
  (
    process.env.TIKTOK_WEB_DIAGNOSTIC_USERNAME ??
    'tiktok'
  )
    .trim()
    .replace(/^@/, '');

if (!targetUsername) {
  throw new Error(
    'TIKTOK_WEB_DIAGNOSTIC_USERNAME resolved to an empty username.',
  );
}

function safeAccountSummary(
  account: TikTokAccount,
) {
  return {
    id:
      account.id,
    name:
      account.name,
    handle:
      account.handle ?? null,
    status:
      account.status,
    cookieCount:
      account.cookies.length,
    lastVerified:
      account.lastVerified ?? null,
  };
}

function resolveAccount(): TikTokAccount {
  const accounts =
    accountManager.listAccounts();

  if (requestedAccountId) {
    const requested =
      accounts.find(
        account =>
          account.id ===
          requestedAccountId,
      );

    if (!requested) {
      throw new Error(
        `TikTok Web account not found: ${requestedAccountId}. Available accounts: ${JSON.stringify(accounts.map(safeAccountSummary))}`,
      );
    }

    return requested;
  }

  const active =
    accounts.filter(
      account =>
        account.status ===
        'active',
    );

  if (active.length === 1) {
    return active[0];
  }

  if (
    active.length === 0 &&
    accounts.length === 1
  ) {
    return accounts[0];
  }

  if (accounts.length === 0) {
    throw new Error(
      'No TikTok Web account is configured. Add an account through the existing TikTok account flow before running this read-only diagnostic.',
    );
  }

  throw new Error(
    `Multiple TikTok Web accounts are available. Set TIKTOK_WEB_ACCOUNT_ID to one of: ${JSON.stringify(accounts.map(safeAccountSummary))}`,
  );
}

const account =
  resolveAccount();

console.log(
  '[1/5] TikTok Web account selected.',
);

console.log(
  `ACCOUNT=${JSON.stringify(safeAccountSummary(account))}`,
);

console.log(
  `TARGET=@${targetUsername}`,
);

let sessionId:
  string | null =
    null;

try {
  console.log(
    '[2/5] Launching authenticated headless TikTok session...',
  );

  const session =
    await accountManager.launchSession(
      account.id,
      false,
    );

  sessionId =
    session.sessionId;

  const page =
    browserManager.getPage(
      sessionId,
    );

  if (!page) {
    throw new Error(
      'TikTok browser session has no Playwright page.',
    );
  }

  console.log(
    '[3/5] Opening exact profile in read-only mode...',
  );

  const targetUrl =
    `https://www.tiktok.com/@${targetUsername}`;

  await page.goto(
    targetUrl,
    {
      waitUntil:
        'domcontentloaded',
      timeout:
        30_000,
    },
  );

  await page.waitForTimeout(
    4_000,
  );

  await dismissTikTokBanners(
    page,
  );

  await page.waitForTimeout(
    1_000,
  );

  console.log(
    '[4/5] Inspecting relationship-related DOM without clicking...',
  );

  const diagnostic =
    await page.evaluate(
      (
        expectedUsername: string,
      ) => {
        const normalize =
          (value: string | null | undefined) =>
            (value ?? '')
              .trim()
              .replace(/^@/, '')
              .toLowerCase();

        const currentUrl =
          window.location.href;

        const urlMatch =
          currentUrl.match(
            /tiktok\.com\/@([^/?#]+)/i,
          );

        const urlHandle =
          urlMatch
            ? decodeURIComponent(
                urlMatch[1],
              )
            : null;

        const profileTitle =
          document.querySelector(
            '[data-e2e="user-title"]',
          )?.textContent?.trim() ??
          null;

        const profileSubtitle =
          document.querySelector(
            '[data-e2e="user-subtitle"]',
          )?.textContent?.trim() ??
          null;

        const bodyText =
          document.body?.innerText ??
          '';

        const loginDetected =
          /log in to tiktok|sign up for an account|entrar no tiktok|iniciar sessão/i
            .test(
              bodyText,
            ) ||
          /\/login(?:[/?#]|$)/i
            .test(
              currentUrl,
            );

        const relationshipText =
          /follow|following|friends|message|seguir|seguindo|amigos|mensagem/i;

        const elements =
          Array.from(
            document.querySelectorAll(
              'button, [role="button"], a, [data-e2e]',
            ),
          )
            .map(
              (
                element,
              ) => {
                const htmlElement =
                  element as HTMLElement;

                const text =
                  (
                    htmlElement.innerText ||
                    htmlElement.textContent ||
                    ''
                  )
                    .replace(
                      /\s+/g,
                      ' ',
                    )
                    .trim();

                const dataE2e =
                  element.getAttribute(
                    'data-e2e',
                  );

                const ariaLabel =
                  element.getAttribute(
                    'aria-label',
                  );

                const role =
                  element.getAttribute(
                    'role',
                  );

                const href =
                  element instanceof
                    HTMLAnchorElement
                    ? element.href
                    : null;

                const relevant =
                  relationshipText.test(
                    [
                      text,
                      dataE2e,
                      ariaLabel,
                      role,
                    ]
                      .filter(
                        Boolean,
                      )
                      .join(
                        ' ',
                      ),
                  ) ||
                  (
                    dataE2e !== null &&
                    /user|profile/i.test(
                      dataE2e,
                    )
                  );

                if (!relevant) {
                  return null;
                }

                return {
                  tag:
                    element.tagName.toLowerCase(),
                  dataE2e:
                    dataE2e ?? null,
                  role:
                    role ?? null,
                  ariaLabel:
                    ariaLabel ?? null,
                  text:
                    text.slice(
                      0,
                      160,
                    ),
                  href:
                    href
                      ? href
                          .split(
                            '?',
                          )[0]
                          .slice(
                            0,
                            220,
                          )
                      : null,
                };
              },
            )
            .filter(
              (
                value,
              ): value is {
                tag: string;
                dataE2e: string | null;
                role: string | null;
                ariaLabel: string | null;
                text: string;
                href: string | null;
              } =>
                value !== null,
            )
            .slice(
              0,
              80,
            );

        const exactProfile =
          normalize(
            urlHandle,
          ) ===
          normalize(
            expectedUsername,
          );

        return {
          url:
            currentUrl
              .split(
                '?',
              )[0],
          title:
            document.title,
          expectedUsername,
          urlHandle,
          exactProfile,
          profileTitle,
          profileSubtitle,
          loginDetected,
          candidateCount:
            elements.length,
          candidates:
            elements,
        };
      },
      targetUsername,
    );

  if (
    diagnostic.loginDetected
  ) {
    throw new Error(
      `TikTok session is not authenticated for account ${account.id}. Current URL: ${diagnostic.url}`,
    );
  }

  if (
    !diagnostic.exactProfile
  ) {
    throw new Error(
      `Exact TikTok profile was not confirmed. Expected @${targetUsername}; URL handle: ${diagnostic.urlHandle ?? 'none'}; URL: ${diagnostic.url}`,
    );
  }

  if (
    diagnostic.candidateCount ===
      0
  ) {
    throw new Error(
      'Exact profile opened, but no relationship-related DOM candidates were captured.',
    );
  }

  const outputDir =
    resolve(
      process.cwd(),
      'tmp',
    );

  mkdirSync(
    outputDir,
    {
      recursive:
        true,
    },
  );

  const outputPath =
    resolve(
      outputDir,
      'tiktok-web-readonly-diagnostic.json',
    );

  const sanitizedOutput = {
    capturedAt:
      new Date()
        .toISOString(),
    account:
      safeAccountSummary(
        account,
      ),
    target:
      `@${targetUsername}`,
    diagnostic,
  };

  writeFileSync(
    outputPath,
    JSON.stringify(
      sanitizedOutput,
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    '[5/5] Read-only diagnostic captured.',
  );

  console.log('');
  console.log(
    'TIKTOK_WEB_READONLY_DIAGNOSTIC=PASS',
  );
  console.log(
    `EXACT_PROFILE=@${targetUsername}`,
  );
  console.log(
    `CURRENT_URL=${diagnostic.url}`,
  );
  console.log(
    `PROFILE_TITLE=${diagnostic.profileTitle ?? ''}`,
  );
  console.log(
    `PROFILE_SUBTITLE=${diagnostic.profileSubtitle ?? ''}`,
  );
  console.log(
    `RELATIONSHIP_CANDIDATES=${diagnostic.candidateCount}`,
  );
  console.log(
    'MUTATIONS_PERFORMED=false',
  );
  console.log(
    `DIAGNOSTIC_FILE=${outputPath}`,
  );
  console.log(
    'CANDIDATES_JSON_BEGIN',
  );
  console.log(
    JSON.stringify(
      diagnostic.candidates,
      null,
      2,
    ),
  );
  console.log(
    'CANDIDATES_JSON_END',
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

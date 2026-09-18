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

const headedDiagnostic =
  /^(1|true|yes)$/i.test(
    process.env.TIKTOK_WEB_DIAGNOSTIC_HEADED?.trim() ??
    '',
  );

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

async function hasVisibleTikTokChallenge(
  page: any,
): Promise<boolean> {
  const selectors = [
    '.secsdk-captcha-drag-icon',
    '[class*="secsdk-captcha"]',
    '[class*="captcha" i]',
    '[id*="captcha" i]',
    'iframe[src*="captcha" i]',
  ];

  for (const selector of selectors) {
    const locator =
      page.locator(selector);

    const count =
      await locator.count();

    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      if (
        await locator
          .nth(index)
          .isVisible()
          .catch(
            () => false,
          )
      ) {
        return true;
      }
    }
  }

  return false;
}

async function waitForManualTikTokChallenge(
  page: any,
): Promise<void> {
  const challengeDetected =
    await hasVisibleTikTokChallenge(
      page,
    );

  if (!challengeDetected) {
    console.log(
      'TIKTOK_CHALLENGE=NOT_DETECTED',
    );

    return;
  }

  console.log(
    'TIKTOK_CHALLENGE=DETECTED',
  );

  if (!headedDiagnostic) {
    throw new Error(
      'TikTok challenge detected in headless mode. No bypass was attempted. Re-run with TIKTOK_WEB_DIAGNOSTIC_HEADED=1 and solve the challenge manually in the visible browser.',
    );
  }

  console.log(
    'Resolve the TikTok challenge manually in the visible browser window.',
  );

  console.log(
    'The diagnostic will continue automatically after the challenge disappears.',
  );

  const deadline =
    Date.now() +
    5 * 60_000;

  while (
    Date.now() <
      deadline
  ) {
    if (
      page.isClosed()
    ) {
      throw new Error(
        'Visible TikTok browser was closed before the challenge was resolved.',
      );
    }

    const stillVisible =
      await hasVisibleTikTokChallenge(
        page,
      );

    if (!stillVisible) {
      await page.waitForTimeout(
        2_000,
      );

      console.log(
        'TIKTOK_CHALLENGE=MANUALLY_RESOLVED',
      );

      return;
    }

    await page.waitForTimeout(
      1_000,
    );
  }

  throw new Error(
    'TikTok challenge was not resolved within 5 minutes. No bypass was attempted.',
  );
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
  '[1/6] TikTok Web account selected.',
);

console.log(
  `ACCOUNT=${JSON.stringify(safeAccountSummary(account))}`,
);

console.log(
  `TARGET=@${targetUsername}`,
);

let verifiedHandle =
  account.handle ?? null;

if (!headedDiagnostic) {
  console.log(
    '[2/6] Verifying imported TikTok authentication...',
  );

  const verification =
    await accountManager.verifyAccount(
      account.id,
    );

  if (!verification.success) {
    throw new Error(
      `Imported TikTok Web session is not authenticated: ${verification.error ?? 'unknown verification failure'}`,
    );
  }

  verifiedHandle =
    verification.handle ??
    verifiedHandle;

  console.log(
    'AUTHENTICATED_SESSION=PASS',
  );

  console.log(
    `AUTHENTICATED_HANDLE=${verifiedHandle ?? ''}`,
  );
} else {
  console.log(
    '[2/6] Authentication will be confirmed in the visible browser session.',
  );
}

let sessionId:
  string | null =
    null;

try {
  console.log(
    '[3/6] Launching authenticated headless TikTok session...',
  );

  const session =
    await accountManager.launchSession(
      account.id,
      headedDiagnostic,
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

  await waitForManualTikTokChallenge(
    page,
  );

  if (headedDiagnostic) {
    console.log(
      '[3.5/6] Confirming authentication in visible session...',
    );

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

    await waitForManualTikTokChallenge(
      page,
    );

    const profileUrl =
      page.url();

    const profileMatch =
      profileUrl.match(
        /tiktok\.com\/@([^/?#]+)/i,
      );

    if (!profileMatch) {
      throw new Error(
        `Visible TikTok session did not resolve to an authenticated profile. Current URL: ${profileUrl}`,
      );
    }

    verifiedHandle =
      decodeURIComponent(
        profileMatch[1],
      );

    console.log(
      'AUTHENTICATED_SESSION=PASS',
    );

    console.log(
      `AUTHENTICATED_HANDLE=${verifiedHandle}`,
    );
  }

  console.log(
    '[4/6] Opening exact profile in read-only mode...',
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

  await waitForManualTikTokChallenge(
    page,
  );

  await dismissTikTokBanners(
    page,
  );

  await page.waitForTimeout(
    1_000,
  );

  console.log(
    '[5/6] Inspecting profile action DOM without clicking...',
  );

  const diagnostic =
    await page.evaluate(
      (
        expectedUsername: string,
      ) => {
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

        const profileRoot =
          document.querySelector(
            '[data-e2e="user-page"]',
          ) ??
          document.body;

        const elements =
          Array.from(
            profileRoot.querySelectorAll(
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

                const relevantText =
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
                  );

                return {
                  relationshipTextMatch:
                    relevantText,
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
            .slice(
              0,
              80,
            );

        const normalizedUrlHandle =
          (urlHandle ?? '')
            .trim()
            .replace(/^@/, '')
            .toLowerCase();

        const normalizedExpectedUsername =
          expectedUsername
            .trim()
            .replace(/^@/, '')
            .toLowerCase();

        const exactProfile =
          normalizedUrlHandle ===
          normalizedExpectedUsername;

        const directSelectors = {
          followButton:
            document.querySelectorAll(
              '[data-e2e="follow-button"]',
            ).length,
          followLikeDataE2e:
            document.querySelectorAll(
              '[data-e2e*="follow" i]',
            ).length,
          messageLikeDataE2e:
            document.querySelectorAll(
              '[data-e2e*="message" i]',
            ).length,
          friendLikeDataE2e:
            document.querySelectorAll(
              '[data-e2e*="friend" i]',
            ).length,
        };

        const globalButtons =
          Array.from(
            document.querySelectorAll(
              'button, [role="button"]',
            ),
          )
            .map(
              element => {
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

                const rect =
                  htmlElement.getBoundingClientRect();

                const style =
                  window.getComputedStyle(
                    htmlElement,
                  );

                const visible =
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.display !==
                    'none' &&
                  style.visibility !==
                    'hidden';

                return {
                  tag:
                    element.tagName.toLowerCase(),
                  dataE2e:
                    element.getAttribute(
                      'data-e2e',
                    ),
                  role:
                    element.getAttribute(
                      'role',
                    ),
                  ariaLabel:
                    element.getAttribute(
                      'aria-label',
                    ),
                  title:
                    element.getAttribute(
                      'title',
                    ),
                  className:
                    typeof htmlElement.className ===
                    'string'
                      ? htmlElement.className.slice(
                          0,
                          220,
                        )
                      : null,
                  text:
                    text.slice(
                      0,
                      160,
                    ),
                  visible,
                  parentDataE2e:
                    element.parentElement
                      ?.getAttribute(
                        'data-e2e',
                      ) ??
                    null,
                  parentText:
                    (
                      element.parentElement
                        ?.innerText ??
                      ''
                    )
                      .replace(
                        /\s+/g,
                        ' ',
                      )
                      .trim()
                      .slice(
                        0,
                        220,
                      ),
                };
              },
            )
            .filter(
              element =>
                element.visible,
            )
            .slice(
              0,
              120,
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
          challengeDetected:
            document.querySelector(
              '.secsdk-captcha-drag-icon, [class*="secsdk-captcha"], [class*="captcha" i], [id*="captcha" i], iframe[src*="captcha" i]',
            ) !== null,
          candidateCount:
            elements.length,
          relationshipTextMatches:
            elements.filter(
              element =>
                element.relationshipTextMatch,
            ).length,
          directSelectors,
          globalButtonCount:
            globalButtons.length,
          candidates:
            elements,
          globalButtons,
        };
      },
      targetUsername,
    );

  if (
    diagnostic.challengeDetected
  ) {
    throw new Error(
      'TikTok challenge is still present after the manual-wait step. No relationship classification is safe.',
    );
  }

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
    '[6/6] Read-only diagnostic captured.',
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
    `PROFILE_ACTION_CANDIDATES=${diagnostic.candidateCount}`,
  );
  console.log(
    `RELATIONSHIP_TEXT_MATCHES=${diagnostic.relationshipTextMatches}`,
  );
  console.log(
    `DIAGNOSTIC_MODE=${headedDiagnostic ? 'headed' : 'headless'}`,
  );
  console.log(
    `DIRECT_SELECTORS=${JSON.stringify(diagnostic.directSelectors)}`,
  );
  console.log(
    `GLOBAL_VISIBLE_BUTTONS=${diagnostic.globalButtonCount}`,
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
  console.log(
    'GLOBAL_BUTTONS_JSON_BEGIN',
  );
  console.log(
    JSON.stringify(
      diagnostic.globalButtons,
      null,
      2,
    ),
  );
  console.log(
    'GLOBAL_BUTTONS_JSON_END',
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

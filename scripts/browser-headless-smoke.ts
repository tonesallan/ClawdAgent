import 'dotenv/config';

import {
  BrowserSessionManager,
} from '../src/actions/browser/session-manager.js';

const manager =
  BrowserSessionManager.getInstance();

const html = [
  '<!doctype html>',
  '<html>',
  '<head>',
  '<meta charset="utf-8">',
  '<title>ClawdAgent Headless Smoke</title>',
  '</head>',
  '<body>',
  '<main id="smoke-root" data-status="ready">',
  'ClawdAgent BrowserSessionManager',
  '</main>',
  '</body>',
  '</html>',
].join('');

const url =
  `data:text/html;base64,${Buffer
    .from(
      html,
      'utf8',
    )
    .toString(
      'base64',
    )}`;

let sessionId:
  string | null =
    null;

try {
  console.log(
    '[1/4] Checking cross-platform browser resources...',
  );

  BrowserSessionManager.cleanupOrphans();

  const before =
    manager.getResources();

  if (
    before.ramAvailableMB <
      500
  ) {
    throw new Error(
      `Browser resource check reports only ${before.ramAvailableMB}MB available RAM.`,
    );
  }

  console.log(
    `RAM_AVAILABLE_MB=${before.ramAvailableMB}`,
  );

  console.log(
    '[2/4] Creating headless Playwright session...',
  );

  const session =
    await manager.createSession(
      url,
      false,
    );

  sessionId =
    session.id;

  if (
    session.status !==
      'running'
  ) {
    throw new Error(
      `Unexpected browser session status: ${session.status}`,
    );
  }

  if (
    session.vncEnabled
  ) {
    throw new Error(
      'Headless smoke unexpectedly enabled VNC.',
    );
  }

  const page =
    manager.getPage(
      session.id,
    );

  if (!page) {
    throw new Error(
      'Headless session has no Playwright page.',
    );
  }

  console.log(
    '[3/4] Validating rendered page...',
  );

  const observed =
    await page.evaluate(
      () => ({
        title: document.title,
        text:
          document
            .querySelector('#smoke-root')
            ?.textContent
            ?.trim() ?? null,
        status:
          document
            .querySelector('#smoke-root')
            ?.getAttribute('data-status') ??
          null,
      }),
    );

  if (
    observed.title !==
      'ClawdAgent Headless Smoke' ||
    observed.text !==
      'ClawdAgent BrowserSessionManager' ||
    observed.status !==
      'ready'
  ) {
    throw new Error(
      `Unexpected rendered content: ${JSON.stringify(observed)}`,
    );
  }

  const during =
    manager.getResources();

  if (
    during.headlessSessions !==
      1
  ) {
    throw new Error(
      `Expected 1 headless session, got ${during.headlessSessions}.`,
    );
  }

  console.log(
    '[4/4] Closing headless session...',
  );

  await manager.closeSession(
    session.id,
  );

  sessionId =
    null;

  const after =
    manager.getResources();

  if (
    after.sessions !==
      0
  ) {
    throw new Error(
      `Browser session cleanup failed. Remaining sessions: ${after.sessions}`,
    );
  }

  console.log('');
  console.log(
    'BROWSER_HEADLESS_SMOKE=PASS',
  );
  console.log(
    `PLATFORM=${process.platform}`,
  );
  console.log(
    'PLAYWRIGHT_SESSION=PASS',
  );
  console.log(
    'DOM_RENDER=PASS',
  );
  console.log(
    'VNC_ENABLED=false',
  );
  console.log(
    'SESSION_CLEANUP=PASS',
  );
}
finally {
  if (sessionId) {
    await manager
      .closeSession(
        sessionId,
      )
      .catch(
        () => {},
      );
  }

  await manager.closeAll();
}

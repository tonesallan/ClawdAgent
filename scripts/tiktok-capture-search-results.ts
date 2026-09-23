import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AppiumClient } from '../src/actions/mobile/appium-client.js';
import {
  findTikTokProfileSearchCandidate,
  normalizeTikTokUsername,
} from '../src/tiktok/android-profile-navigation.js';

const TIKTOK_PACKAGE = 'com.zhiliaoapp.musically';
const TIKTOK_ACTIVITY = 'com.ss.android.ugc.aweme.splash.SplashActivity';
const DEFAULT_APPIUM_URL = 'http://127.0.0.1:4723';
const DEFAULT_OUTPUT_DIR = 'tmp/tiktok-search-diagnostic';

function sleep(ms: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

async function findOptional(
  appium: AppiumClient,
  strategy: string,
  selector: string,
): Promise<{ elementId: string } | null> {
  try {
    return await appium.findElement(strategy, selector);
  } catch {
    return null;
  }
}

async function findSearchInput(
  appium: AppiumClient,
): Promise<{ elementId: string } | null> {
  return (
    await findOptional(
      appium,
      'id',
      'com.zhiliaoapp.musically:id/htb',
    )
  ) ?? (
    await findOptional(
      appium,
      'uiautomator',
      'new UiSelector().className("android.widget.EditText")',
    )
  );
}

async function findSearchButton(
  appium: AppiumClient,
): Promise<{ elementId: string } | null> {
  const candidates: Array<[string, string]> = [
    ['id', 'com.zhiliaoapp.musically:id/k9z'],
    ['uiautomator', 'new UiSelector().description("Procurar")'],
    ['uiautomator', 'new UiSelector().description("Pesquisar")'],
    ['uiautomator', 'new UiSelector().description("Search")'],
  ];

  for (const [strategy, selector] of candidates) {
    const element = await findOptional(appium, strategy, selector);
    if (element) {
      return element;
    }
  }

  return null;
}

async function reachSearchInput(
  appium: AppiumClient,
): Promise<{ elementId: string }> {
  let searchInput = await findSearchInput(appium);

  for (let attempt = 0; attempt < 4 && !searchInput; attempt++) {
    const searchButton = await findSearchButton(appium);

    if (searchButton) {
      await appium.clickElement(searchButton.elementId);
      await sleep(700);
      searchInput = await findSearchInput(appium);

      if (searchInput) {
        break;
      }
    }

    if (attempt < 3) {
      await appium.pressKey(4);
      await sleep(500);
      searchInput = await findSearchInput(appium);
    }
  }

  if (!searchInput) {
    const homeButton = await findOptional(
      appium,
      'id',
      'com.zhiliaoapp.musically:id/olw',
    );

    if (homeButton) {
      await appium.clickElement(homeButton.elementId);
      await sleep(800);

      const searchButton = await findSearchButton(appium);
      if (searchButton) {
        await appium.clickElement(searchButton.elementId);
        await sleep(700);
        searchInput = await findSearchInput(appium);
      }
    }
  }

  if (!searchInput) {
    throw new Error('TikTok search UI could not be reached safely');
  }

  return searchInput;
}

async function selectUsersTabIfPresent(
  appium: AppiumClient,
): Promise<string | null> {
  const selectors = [
    'new UiSelector().textContains("Usu")',
    'new UiSelector().textContains("User")',
    'new UiSelector().textContains("Pessoas")',
    'new UiSelector().textContains("People")',
    'new UiSelector().textContains("Conta")',
    'new UiSelector().textContains("Account")',
  ];

  for (const selector of selectors) {
    const tab = await findOptional(appium, 'uiautomator', selector);
    if (!tab) {
      continue;
    }

    await appium.clickElement(tab.elementId);
    await sleep(1200);
    return selector;
  }

  return null;
}

function summarizeSource(
  source: string,
  username: string,
): Record<string, unknown> {
  const result = findTikTokProfileSearchCandidate(source, username);

  return {
    candidateFound: Boolean(result.candidate),
    candidate: result.candidate
      ? {
          text: result.candidate.text,
          contentDescription: result.candidate.contentDescription,
          resourceId: result.candidate.resourceId,
          clickable: result.candidate.clickable,
          bounds: result.candidate.bounds,
          score: result.candidate.score,
          line: result.candidate.line.trim(),
        }
      : null,
    mentions: result.mentions,
  };
}

async function run(): Promise<void> {
  const deviceId = process.argv[2]?.trim();
  const username = normalizeTikTokUsername(
    process.argv[3] ?? 'tiktok',
  );
  const appiumUrl = (
    process.argv[4] ?? process.env.APPIUM_URL ?? DEFAULT_APPIUM_URL
  ).replace(/\/$/, '');
  const outputDir = resolve(
    process.env.TIKTOK_DIAGNOSTIC_DIR ?? DEFAULT_OUTPUT_DIR,
  );

  if (!deviceId) {
    throw new Error(
      'Device id is required. Usage: pnpm exec tsx scripts/tiktok-capture-search-results.ts <device-id> [username] [appium-url]',
    );
  }

  if (!/^[A-Za-z0-9._]{2,24}$/.test(username)) {
    throw new Error(`Invalid TikTok username: ${username}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const appium = new AppiumClient();
  let sessionCreated = false;

  try {
    console.log(`[DIAGNOSTIC] device=${deviceId}`);
    console.log(`[DIAGNOSTIC] username=@${username}`);
    console.log(`[DIAGNOSTIC] appium=${appiumUrl}`);
    console.log('[DIAGNOSTIC] read-only navigation: no profile result will be clicked');

    await appium.createSession(appiumUrl, {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': deviceId,
      'appium:udid': deviceId,
      'appium:appPackage': TIKTOK_PACKAGE,
      'appium:appActivity': TIKTOK_ACTIVITY,
      'appium:noReset': true,
      'appium:fullReset': false,
      'appium:autoGrantPermissions': true,
      'appium:newCommandTimeout': 180,
      'appium:ignoreHiddenApiPolicyError': true,
      'appium:settings[waitForIdleTimeout]': 1000,
      'appium:settings[waitForSelectorTimeout]': 1000,
      'appium:settings[trackScrollEvents]': false,
    });
    sessionCreated = true;

    await sleep(1800);

    const searchInput = await reachSearchInput(appium);

    await appium.clickElement(searchInput.elementId);
    await appium.clearElement(searchInput.elementId);
    await appium.setClipboard(`@${username}`);
    await appium.pressKey(279);
    await sleep(500);

    const submit = await findOptional(
      appium,
      'id',
      'com.zhiliaoapp.musically:id/tv_search_textview',
    );

    if (submit) {
      await appium.clickElement(submit.elementId);
    } else {
      await appium.pressKey(66);
    }

    await sleep(2500);

    const allSource = await appium.getPageSource();
    const allPath = resolve(outputDir, 'search-results-all.xml');
    writeFileSync(allPath, allSource, 'utf8');

    const selectedUsersTab = await selectUsersTabIfPresent(appium);
    const usersSource = selectedUsersTab
      ? await appium.getPageSource()
      : allSource;
    const usersPath = resolve(outputDir, 'search-results-users.xml');
    writeFileSync(usersPath, usersSource, 'utf8');

    const summary = {
      capturedAt: new Date().toISOString(),
      deviceId,
      username,
      appiumUrl,
      selectedUsersTab,
      allResults: summarizeSource(allSource, username),
      usersResults: summarizeSource(usersSource, username),
      files: {
        allResultsXml: allPath,
        usersResultsXml: usersPath,
      },
      safety: {
        clickedProfileResult: false,
        relationshipMutationPerformed: false,
      },
    };

    const summaryPath = resolve(outputDir, 'summary.json');
    writeFileSync(
      summaryPath,
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    );

    console.log('');
    console.log('[DIAGNOSTIC] capture complete');
    console.log(`[DIAGNOSTIC] all XML:   ${allPath}`);
    console.log(`[DIAGNOSTIC] users XML: ${usersPath}`);
    console.log(`[DIAGNOSTIC] summary:   ${summaryPath}`);
    console.log('');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (sessionCreated) {
      try {
        await appium.deleteSession();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[DIAGNOSTIC] session cleanup warning: ${message}`);
      }
    }
  }
}

run().catch(error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[DIAGNOSTIC] failed: ${message}`);
  process.exitCode = 1;
});

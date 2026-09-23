import { AppiumClient } from './src/actions/mobile/appium-client.js';
import fs from 'node:fs';

const DEVICE = 'sgdi59volz9xgatg';
const APPIUM = 'http' + '://' + '127.0.0.1:4723';
const PKG = 'com.zhiliaoapp.musically';

async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    );
}

function attr(line: string, name: string) {
  const m = line.match(
    new RegExp(`${name}="([^"]*)"`)
  );

  return m ? decodeXml(m[1]) : '';
}

function normalize(value: string) {
  return value
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

function validUsername(value: string) {
  const v = normalize(value);

  return (
    v.length >= 2 &&
    v.length <= 30 &&
    /^[a-z0-9._]+$/i.test(v)
  );
}

async function findId(
  client: AppiumClient,
  id: string
) {
  try {
    return await client.findElement(
      'id',
      `${PKG}:id/${id}`
    );
  } catch {
    return null;
  }
}

async function findAny(
  client: AppiumClient,
  selectors: string[]
) {
  for (const selector of selectors) {
    try {
      return await client.findElement(
        'uiautomator',
        selector
      );
    } catch {}
  }

  return null;
}

async function goHome(client: AppiumClient) {
  for (let i = 0; i < 8; i++) {
    const home = await findId(client, 'olw');

    if (home) {
      await client.clickElement(home.elementId);
      await sleep(900);
      return;
    }

    await client.pressKey(4);
    await sleep(600);
  }

  throw new Error(
    'Nao foi possivel voltar ao Inicio.'
  );
}

async function goProfile(client: AppiumClient) {
  await goHome(client);

  const profile = await findId(client, 'oly');

  if (!profile) {
    throw new Error('Perfil nao encontrado.');
  }

  await client.clickElement(profile.elementId);
  await sleep(1400);
}

async function openList(
  client: AppiumClient,
  type: 'followers' | 'following'
) {
  const selectors =
    type === 'followers'
      ? [
          'new UiSelector().textContains("Seguidores")',
          'new UiSelector().descriptionContains("Seguidores")',
          'new UiSelector().textContains("Followers")'
        ]
      : [
          'new UiSelector().textContains("Seguindo")',
          'new UiSelector().descriptionContains("Seguindo")',
          'new UiSelector().textContains("Following")'
        ];

  const button = await findAny(
    client,
    selectors
  );

  if (!button) {
    throw new Error(
      `${type}: controle nao encontrado`
    );
  }

  await client.clickElement(button.elementId);
  await sleep(1400);
}

async function swipeUp(sessionId: string) {
  const response = await fetch(
    `${APPIUM}/session/${sessionId}/actions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        actions: [{
          type: 'pointer',
          id: 'finger-map',
          parameters: {
            pointerType: 'touch'
          },
          actions: [
            {
              type: 'pointerMove',
              duration: 0,
              x: 540,
              y: 1900
            },
            {
              type: 'pointerDown',
              button: 0
            },
            {
              type: 'pointerMove',
              duration: 650,
              x: 540,
              y: 650
            },
            {
              type: 'pointerUp',
              button: 0
            }
          ]
        }]
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Swipe HTTP ${response.status}`
    );
  }

  await fetch(
    `${APPIUM}/session/${sessionId}/actions`,
    { method: 'DELETE' }
  ).catch(() => {});

  await sleep(800);
}

function inspectPage(source: string) {
  const lines = source.split(/\r?\n/);

  const rows: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (
      attr(lines[i], 'resource-id') !==
      `${PKG}:id/u68`
    ) {
      continue;
    }

    const relation = (
      attr(lines[i], 'text') ||
      attr(lines[i], 'content-desc')
    ).trim();

    const start = Math.max(0, i - 18);
    const chunk = lines.slice(start, i + 5);

    let displayName = '';
    let descUsername = '';

    const elements: any[] = [];

    for (const line of chunk) {
      const id = attr(line, 'resource-id');
      const text = attr(line, 'text');
      const desc = attr(line, 'content-desc');
      const cls = attr(line, 'class');

      if (
        id === `${PKG}:id/txt_user_name`
      ) {
        displayName = text;
      }

      if (
        id === `${PKG}:id/txt_desc`
      ) {
        descUsername = text;
      }

      if (text || desc || id) {
        elements.push({
          id,
          class: cls,
          text,
          description: desc
        });
      }
    }

    let recognized = false;
    let username = '';

    if (validUsername(descUsername)) {
      username = normalize(descUsername);
      recognized = true;
    } else if (validUsername(displayName)) {
      username = normalize(displayName);
      recognized = true;
    }

    rows.push({
      relation,
      displayName,
      descUsername,
      username,
      recognized,
      elements
    });
  }

  return rows;
}

function signature(row: any) {
  return row.elements
    .map((x: any) =>
      `${x.id}|${x.class}`
    )
    .join('>');
}

async function inspectWholeList(
  client: AppiumClient,
  sessionId: string,
  label: string
) {
  const recognized = new Set<string>();
  const unmatched = new Map<string, any>();

  let stale = 0;

  for (
    let round = 1;
    round <= 120 && stale < 4;
    round++
  ) {
    const source =
      await client.getPageSource();

    const rows =
      inspectPage(source);

    let newRecognized = 0;
    let newUnknown = 0;

    for (const row of rows) {
      if (
        row.recognized &&
        row.username
      ) {
        if (
          !recognized.has(row.username)
        ) {
          recognized.add(row.username);
          newRecognized++;
        }
      } else {
        const key = signature(row);

        if (!unmatched.has(key)) {
          unmatched.set(
            key,
            {
              ...row,
              firstSeenRound: round
            }
          );

          newUnknown++;
        }
      }
    }

    console.log(
      `${label} ${round}: ` +
      `linhas=${rows.length}, ` +
      `reconhecidos=${recognized.size}, ` +
      `novos=${newRecognized}, ` +
      `formatos-desconhecidos=${unmatched.size}`
    );

    if (
      newRecognized === 0 &&
      newUnknown === 0
    ) {
      stale++;
    } else {
      stale = 0;
    }

    if (stale >= 4) {
      break;
    }

    await swipeUp(sessionId);
  }

  return {
    recognizedCount:
      recognized.size,

    recognized:
      [...recognized].sort(),

    unmatched:
      [...unmatched.values()]
  };
}

async function main() {
  const client = new AppiumClient();

  try {
    const sessionId =
      await client.createSession(
        APPIUM,
        {
          platformName: 'Android',
          'appium:automationName':
            'UiAutomator2',
          'appium:deviceName':
            DEVICE,
          'appium:udid':
            DEVICE,
          'appium:appPackage':
            PKG,
          'appium:appActivity':
            'com.ss.android.ugc.aweme.splash.SplashActivity',
          'appium:noReset': true,
          'appium:fullReset': false,
          'appium:autoGrantPermissions': true,
          'appium:newCommandTimeout': 600,
          'appium:settings[waitForIdleTimeout]':
            1000,
          'appium:settings[waitForSelectorTimeout]':
            1000,
          'appium:settings[trackScrollEvents]':
            false
        }
      );

    await sleep(3000);

    console.log('');
    console.log(
      '========== SEGUIDORES =========='
    );

    await goProfile(client);
    await openList(
      client,
      'followers'
    );

    const followers =
      await inspectWholeList(
        client,
        sessionId,
        'Seguidores'
      );

    console.log('');
    console.log(
      '========== SEGUINDO =========='
    );

    await goProfile(client);
    await openList(
      client,
      'following'
    );

    const following =
      await inspectWholeList(
        client,
        sessionId,
        'Seguindo'
      );

    const report = {
      generatedAt:
        new Date().toISOString(),

      followers,

      following
    };

    fs.writeFileSync(
      'tiktok-follow-unmatched-structures.json',
      JSON.stringify(
        report,
        null,
        2
      ),
      'utf8'
    );

    console.log('');
    console.log(
      '======================================'
    );
    console.log(
      'DIAGNOSTICO CONCLUIDO'
    );
    console.log(
      '======================================'
    );

    console.log(
      `Seguidores reconhecidos: ${followers.recognizedCount}`
    );

    console.log(
      `Formatos desconhecidos seguidores: ${followers.unmatched.length}`
    );

    console.log(
      `Seguindo reconhecidos: ${following.recognizedCount}`
    );

    console.log(
      `Formatos desconhecidos seguindo: ${following.unmatched.length}`
    );

    console.log('');
    console.log(
      'Nenhum follow/unfollow foi executado.'
    );

  } finally {
    await client
      .deleteSession()
      .catch(() => {});
  }
}

main().catch(err => {
  console.error('');
  console.error('ERRO:', err);
  process.exitCode = 1;
});

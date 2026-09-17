import { AppiumClient } from './src/actions/mobile/appium-client.js';
import fs from 'node:fs';

const DEVICE = 'sgdi59volz9xgatg';
const APPIUM = 'http' + '://' + '127.0.0.1:4723';
const PKG = 'com.zhiliaoapp.musically';

type UserRow = {
  displayName: string;
  username: string;
  relation: string;
  source: 'txt_desc' | 'txt_user_name';
};

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

  if (!v) return false;
  if (v.length < 2 || v.length > 30) return false;

  return /^[a-z0-9._]+$/i.test(v);
}

function parseRows(source: string): UserRow[] {
  const lines = source.split(/\r?\n/);

  const rows: UserRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const id = attr(
      lines[i],
      'resource-id'
    );

    if (id !== `${PKG}:id/u68`) {
      continue;
    }

    const relation = (
      attr(lines[i], 'text') ||
      attr(lines[i], 'content-desc')
    ).trim();

    const chunk = lines.slice(
      Math.max(0, i - 14),
      i + 1
    );

    let displayName = '';
    let descUsername = '';

    for (const line of chunk) {
      const rid = attr(
        line,
        'resource-id'
      );

      const text = attr(
        line,
        'text'
      );

      if (
        rid === `${PKG}:id/txt_user_name`
      ) {
        displayName = text;
      }

      if (
        rid === `${PKG}:id/txt_desc`
      ) {
        descUsername = text;
      }
    }

    let username = '';
    let sourceType:
      'txt_desc' |
      'txt_user_name' =
      'txt_desc';

    if (validUsername(descUsername)) {
      username = normalize(descUsername);
      sourceType = 'txt_desc';
    }

    else if (validUsername(displayName)) {
      username = normalize(displayName);
      sourceType = 'txt_user_name';
    }

    if (!username) continue;

    if (username === 'tonesallan') {
      continue;
    }

    rows.push({
      displayName,
      username,
      relation,
      source: sourceType
    });
  }

  return [
    ...new Map(
      rows.map(x => [
        x.username,
        x
      ])
    ).values()
  ];
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
    const home = await findId(
      client,
      'olw'
    );

    if (home) {
      await client.clickElement(
        home.elementId
      );

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

async function goProfile(
  client: AppiumClient
) {
  await goHome(client);

  const profile = await findId(
    client,
    'oly'
  );

  if (!profile) {
    throw new Error(
      'Botao Perfil nao encontrado.'
    );
  }

  await client.clickElement(
    profile.elementId
  );

  await sleep(1400);
}

async function openFollowers(
  client: AppiumClient
) {
  const button = await findAny(
    client,
    [
      'new UiSelector().textContains("Seguidores")',
      'new UiSelector().descriptionContains("Seguidores")',
      'new UiSelector().textContains("Followers")'
    ]
  );

  if (!button) {
    throw new Error(
      'Seguidores nao encontrado.'
    );
  }

  await client.clickElement(
    button.elementId
  );

  await sleep(1400);
}

async function openFollowing(
  client: AppiumClient
) {
  const button = await findAny(
    client,
    [
      'new UiSelector().textContains("Seguindo")',
      'new UiSelector().descriptionContains("Seguindo")',
      'new UiSelector().textContains("Following")'
    ]
  );

  if (!button) {
    throw new Error(
      'Seguindo nao encontrado.'
    );
  }

  await client.clickElement(
    button.elementId
  );

  await sleep(1400);
}

async function swipeUp(
  sessionId: string
) {
  const response = await fetch(
    `${APPIUM}/session/${sessionId}/actions`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify({
        actions: [
          {
            type: 'pointer',
            id: 'finger-scroll',
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
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Swipe falhou: HTTP ${response.status}`
    );
  }

  await fetch(
    `${APPIUM}/session/${sessionId}/actions`,
    {
      method: 'DELETE'
    }
  ).catch(() => {});

  await sleep(900);
}

async function collectAll(
  client: AppiumClient,
  sessionId: string,
  label: string
) {
  const users = new Map<
    string,
    UserRow
  >();

  let staleRounds = 0;
  let round = 0;

  while (
    staleRounds < 4 &&
    round < 120
  ) {
    round++;

    const source =
      await client.getPageSource();

    const visible =
      parseRows(source);

    let added = 0;

    for (const user of visible) {
      if (
        !users.has(user.username)
      ) {
        users.set(
          user.username,
          user
        );

        added++;
      }
    }

    console.log(
      `${label} | rolagem ${round} | ` +
      `visiveis=${visible.length} | ` +
      `novos=${added} | ` +
      `total=${users.size}`
    );

    if (added === 0) {
      staleRounds++;
    } else {
      staleRounds = 0;
    }

    if (staleRounds >= 4) {
      break;
    }

    await swipeUp(sessionId);
  }

  return [...users.values()];
}

async function main() {
  const client =
    new AppiumClient();

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
          'appium:noReset':
            true,
          'appium:fullReset':
            false,
          'appium:autoGrantPermissions':
            true,
          'appium:newCommandTimeout':
            600,
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
      '========== COLETANDO SEGUIDORES =========='
    );

    await goProfile(client);
    await openFollowers(client);

    const followers =
      await collectAll(
        client,
        sessionId,
        'Seguidores'
      );

    fs.writeFileSync(
      'tiktok-followers-full.json',
      JSON.stringify(
        followers,
        null,
        2
      ),
      'utf8'
    );

    console.log('');
    console.log(
      `TOTAL SEGUIDORES COLETADOS: ${followers.length}`
    );

    console.log('');
    console.log(
      '========== COLETANDO SEGUINDO =========='
    );

    await goProfile(client);
    await openFollowing(client);

    const following =
      await collectAll(
        client,
        sessionId,
        'Seguindo'
      );

    fs.writeFileSync(
      'tiktok-following-full.json',
      JSON.stringify(
        following,
        null,
        2
      ),
      'utf8'
    );

    console.log('');
    console.log(
      `TOTAL SEGUINDO COLETADOS: ${following.length}`
    );

    const followersSet =
      new Set(
        followers.map(
          x => x.username
        )
      );

    const followingSet =
      new Set(
        following.map(
          x => x.username
        )
      );

    /*
     * Na tela Seguidores:
     * "Amigos" = já existe relação mútua.
     */
    const mutualFromRelation =
      followers.filter(
        x =>
          x.relation
            .toLowerCase()
            .includes('amigos')
      );

    /*
     * "Seguir de volta" é o indicador
     * direto do TikTok para quem segue você
     * e você ainda não segue.
     */
    const followBack =
      followers.filter(
        x =>
          x.relation
            .toLowerCase()
            .includes(
              'seguir de volta'
            )
      );

    /*
     * Comparação completa:
     * você segue, mas a conta não aparece
     * na lista completa de seguidores.
     */
    const notFollowingBack =
      following.filter(
        x =>
          !followersSet.has(
            x.username
          )
      );

    /*
     * Mútuos por cruzamento completo.
     */
    const mutualByLists =
      following.filter(
        x =>
          followersSet.has(
            x.username
          )
      );

    const report = {
      generatedAt:
        new Date().toISOString(),

      totals: {
        followers:
          followers.length,
        following:
          following.length,
        mutual:
          mutualByLists.length,
        followBack:
          followBack.length,
        notFollowingBack:
          notFollowingBack.length
      },

      mutual:
        mutualByLists,

      mutualFromFollowerRelation:
        mutualFromRelation,

      followBackCandidates:
        followBack,

      notFollowingBackCandidates:
        notFollowingBack,

      followers,

      following
    };

    fs.writeFileSync(
      'tiktok-follow-full-report.json',
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
      'RELATORIO COMPLETO'
    );

    console.log(
      '======================================'
    );

    console.log(
      `Seguidores coletados: ${followers.length}`
    );

    console.log(
      `Seguindo coletados: ${following.length}`
    );

    console.log(
      `Mutuos: ${mutualByLists.length}`
    );

    console.log(
      `Seguir de volta: ${followBack.length}`
    );

    console.log(
      `Nao seguem de volta: ${notFollowingBack.length}`
    );

    console.log('');
    console.log(
      'Nenhuma conta foi seguida.'
    );

    console.log(
      'Nenhuma conta deixou de ser seguida.'
    );

  } finally {
    await client
      .deleteSession()
      .catch(() => {});
  }
}

main().catch(err => {
  console.error('');
  console.error(
    'ERRO:',
    err
  );

  process.exitCode = 1;
});

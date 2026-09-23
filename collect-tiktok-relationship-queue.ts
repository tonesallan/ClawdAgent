import { AppiumClient } from './src/actions/mobile/appium-client.js';
import fs from 'node:fs';

const DEVICE = 'sgdi59volz9xgatg';
const APPIUM = 'http' + '://' + '127.0.0.1:4723';
const PKG = 'com.zhiliaoapp.musically';

type RelationRow = {
  displayName: string;
  username: string | null;
  relation: string;
  accountType: 'normal' | 'shop' | 'live';
};

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
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

  throw new Error('Nao foi possivel voltar ao Inicio.');
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

  const button = await findAny(client, selectors);

  if (!button) {
    throw new Error(`${type}: lista nao encontrada.`);
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
          id: 'relationship-scroll',
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
    throw new Error(`Swipe falhou: HTTP ${response.status}`);
  }

  await fetch(
    `${APPIUM}/session/${sessionId}/actions`,
    { method: 'DELETE' }
  ).catch(() => {});

  await sleep(850);
}

function parseRows(source: string): RelationRow[] {
  const lines = source.split(/\r?\n/);

  const rows: RelationRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const resourceId = attr(
      lines[i],
      'resource-id'
    );

    if (resourceId !== `${PKG}:id/u68`) {
      continue;
    }

    const relation = (
      attr(lines[i], 'text') ||
      attr(lines[i], 'content-desc')
    ).trim();

    if (
      !relation ||
      ![
        'seguindo',
        'amigos',
        'seguir de volta',
        'following',
        'friends',
        'follow back'
      ].some(x =>
        relation.toLowerCase().includes(x)
      )
    ) {
      continue;
    }

    const chunk = lines.slice(
      Math.max(0, i - 22),
      i + 3
    );

    let displayName = '';
    let descUsername = '';

    let hasShop = false;
    let hasLive = false;

    for (const line of chunk) {
      const id = attr(
        line,
        'resource-id'
      );

      const text = attr(
        line,
        'text'
      );

      if (
        id === `${PKG}:id/txt_user_name`
      ) {
        displayName = text.trim();
      }

      if (
        id === `${PKG}:id/txt_desc`
      ) {
        descUsername = text.trim();
      }

      if (
        id === `${PKG}:id/ngg`
      ) {
        hasShop = true;
      }

      if (
        id === `${PKG}:id/tv_icon_tag` &&
        text.toLowerCase().includes('live')
      ) {
        hasLive = true;
      }
    }

    /*
     * Linha parcialmente cortada na tela.
     * Não cadastramos ainda; ela aparecerá inteira
     * depois da próxima rolagem.
     */
    if (!displayName) {
      continue;
    }

    let username: string | null = null;

    if (validUsername(descUsername)) {
      username = normalize(descUsername);
    }

    else if (validUsername(displayName)) {
      username = normalize(displayName);
    }

    let accountType:
      'normal' |
      'shop' |
      'live' =
      'normal';

    if (hasShop) {
      accountType = 'shop';
    }

    else if (hasLive) {
      accountType = 'live';
    }

    rows.push({
      displayName,
      username,
      relation,
      accountType
    });
  }

  return rows;
}

function rowKey(row: RelationRow) {
  if (row.username) {
    return `username:${row.username}`;
  }

  return [
    'display',
    normalize(row.displayName),
    row.accountType
  ].join(':');
}

async function collectRelations(
  client: AppiumClient,
  sessionId: string,
  label: string
) {
  const records =
    new Map<string, RelationRow>();

  let stale = 0;

  for (
    let round = 1;
    round <= 140 && stale < 5;
    round++
  ) {
    const source =
      await client.getPageSource();

    const visible =
      parseRows(source);

    let added = 0;

    for (const row of visible) {
      const key = rowKey(row);

      if (!records.has(key)) {
        records.set(key, row);
        added++;
      } else {
        /*
         * Atualiza informação se numa segunda passagem
         * o username passou a ficar disponível.
         */
        const old = records.get(key)!;

        if (
          !old.username &&
          row.username
        ) {
          records.set(key, row);
        }
      }
    }

    console.log(
      `${label} ${round}: ` +
      `visiveis=${visible.length}, ` +
      `novos=${added}, ` +
      `total=${records.size}`
    );

    if (added === 0) {
      stale++;
    } else {
      stale = 0;
    }

    if (stale >= 5) {
      break;
    }

    await swipeUp(sessionId);
  }

  return [...records.values()];
}

function relationIs(
  row: RelationRow,
  value: string
) {
  return row.relation
    .toLowerCase()
    .includes(value);
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
      '========== RELACOES - SEGUIDORES =========='
    );

    await goProfile(client);
    await openList(
      client,
      'followers'
    );

    const followers =
      await collectRelations(
        client,
        sessionId,
        'Seguidores'
      );

    console.log('');
    console.log(
      '========== RELACOES - SEGUINDO =========='
    );

    await goProfile(client);
    await openList(
      client,
      'following'
    );

    const following =
      await collectRelations(
        client,
        sessionId,
        'Seguindo'
      );

    /*
     * FILA 1
     * A própria lista de seguidores informa
     * quem precisa de follow-back.
     */
    const followBack =
      followers.filter(
        row =>
          relationIs(
            row,
            'seguir de volta'
          ) ||
          relationIs(
            row,
            'follow back'
          )
      );

    /*
     * FILA 2
     * Amigos = relação mútua.
     */
    const mutualFollowers =
      followers.filter(
        row =>
          relationIs(row, 'amigos') ||
          relationIs(row, 'friends')
      );

    /*
     * Na lista Seguindo:
     *
     * Amigos = segue de volta.
     * Seguindo = relação unilateral observada
     * na própria interface.
     */
    const mutualFollowing =
      following.filter(
        row =>
          relationIs(row, 'amigos') ||
          relationIs(row, 'friends')
      );

    const notFollowingBack =
      following.filter(
        row => {
          const r =
            row.relation.toLowerCase();

          return (
            r === 'seguindo' ||
            r === 'following'
          );
        }
      );

    const report = {
      generatedAt:
        new Date().toISOString(),

      mode:
        'relationship-state-from-tiktok-ui',

      totals: {
        followersRows:
          followers.length,

        followingRows:
          following.length,

        followBack:
          followBack.length,

        mutualFollowers:
          mutualFollowers.length,

        mutualFollowing:
          mutualFollowing.length,

        notFollowingBack:
          notFollowingBack.length
      },

      followBackCandidates:
        followBack,

      notFollowingBackCandidates:
        notFollowingBack,

      mutual: {
        followers:
          mutualFollowers,

        following:
          mutualFollowing
      },

      raw: {
        followers,
        following
      }
    };

    fs.writeFileSync(
      'tiktok-relationship-queue.json',
      JSON.stringify(
        report,
        null,
        2
      ),
      'utf8'
    );

    console.log('');
    console.log(
      '========================================='
    );

    console.log(
      'FILA DE RELACIONAMENTOS'
    );

    console.log(
      '========================================='
    );

    console.log(
      `Linhas Seguidores: ${followers.length}`
    );

    console.log(
      `Linhas Seguindo: ${following.length}`
    );

    console.log(
      `Seguir de volta: ${followBack.length}`
    );

    console.log(
      `Amigos na lista Seguidores: ${mutualFollowers.length}`
    );

    console.log(
      `Amigos na lista Seguindo: ${mutualFollowing.length}`
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
  console.error('ERRO:', err);
  process.exitCode = 1;
});

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
  await sleep(1500);
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

  const button =
    await findAny(client, selectors);

  if (!button) {
    throw new Error(`${type}: lista nao encontrada.`);
  }

  await client.clickElement(button.elementId);
  await sleep(1500);
}

function parseRows(source: string): RelationRow[] {
  const lines =
    source.split(/\r?\n/);

  const rows: RelationRow[] = [];

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

    const r =
      relation.toLowerCase();

    if (
      ![
        'seguindo',
        'amigos',
        'seguir de volta',
        'following',
        'friends',
        'follow back'
      ].some(x => r.includes(x))
    ) {
      continue;
    }

    const chunk =
      lines.slice(
        Math.max(0, i - 24),
        i + 3
      );

    let displayName = '';
    let descUsername = '';

    let hasShop = false;
    let hasLive = false;

    for (const line of chunk) {
      const id =
        attr(line, 'resource-id');

      const text =
        attr(line, 'text');

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
     * Linha parcialmente cortada.
     * Será lida novamente na próxima posição.
     */
    if (!displayName) {
      continue;
    }

    let username: string | null = null;

    if (validUsername(descUsername)) {
      username =
        normalize(descUsername);
    } else if (
      validUsername(displayName)
    ) {
      username =
        normalize(displayName);
    }

    let accountType:
      'normal' |
      'shop' |
      'live' =
      'normal';

    if (hasShop) {
      accountType = 'shop';
    } else if (hasLive) {
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

function keyOf(row: RelationRow) {
  if (row.username) {
    return `u:${row.username}`;
  }

  return (
    `d:${normalize(row.displayName)}` +
    `:${row.accountType}`
  );
}

async function nativeScroll(
  sessionId: string
): Promise<boolean> {

  const response = await fetch(
    `${APPIUM}/session/${sessionId}/execute/sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json'
      },
      body: JSON.stringify({
        script:
          'mobile: scrollGesture',

        args: [{
          left: 20,
          top: 500,
          width: 1040,
          height: 1650,

          direction:
            'down',

          /*
           * Rolagem pequena:
           * bastante sobreposição entre telas.
           */
          percent:
            0.38
        }]
      })
    }
  );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `scrollGesture HTTP ${response.status}: ${body}`
    );
  }

  const json: any =
    await response.json();

  await sleep(750);

  /*
   * UiAutomator2 retorna true
   * enquanto ainda existe conteúdo abaixo.
   */
  return Boolean(json.value);
}

async function collect(
  client: AppiumClient,
  sessionId: string,
  label: string
) {
  const records =
    new Map<string, RelationRow>();

  let round = 0;
  let endConfirmations = 0;

  while (round < 160) {
    round++;

    const xml =
      await client.getPageSource();

    const rows =
      parseRows(xml);

    let added = 0;

    for (const row of rows) {
      const key =
        keyOf(row);

      if (!records.has(key)) {
        records.set(key, row);
        added++;
      }
    }

    console.log(
      `${label} ${round}: ` +
      `visiveis=${rows.length}, ` +
      `novos=${added}, ` +
      `total=${records.size}`
    );

    const canScrollMore =
      await nativeScroll(
        sessionId
      );

    console.log(
      `  pode continuar: ${canScrollMore}`
    );

    if (!canScrollMore) {
      endConfirmations++;

      /*
       * Captura algumas vezes no fim para
       * garantir que a última linha carregou.
       */
      if (endConfirmations >= 3) {
        const finalXml =
          await client.getPageSource();

        for (
          const row of parseRows(finalXml)
        ) {
          const key =
            keyOf(row);

          if (!records.has(key)) {
            records.set(
              key,
              row
            );
          }
        }

        break;
      }

      await sleep(1000);
    } else {
      endConfirmations = 0;
    }
  }

  return [...records.values()];
}

function relationIs(
  row: RelationRow,
  ...values: string[]
) {
  const r =
    row.relation.toLowerCase();

  return values.some(
    x => r.includes(x)
  );
}

async function main() {
  const client =
    new AppiumClient();

  try {
    const sessionId =
      await client.createSession(
        APPIUM,
        {
          platformName:
            'Android',

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
      '========== SEGUIDORES V2 =========='
    );

    await goProfile(client);
    await openList(
      client,
      'followers'
    );

    const followers =
      await collect(
        client,
        sessionId,
        'Seguidores'
      );

    console.log('');
    console.log(
      '========== SEGUINDO V2 =========='
    );

    await goProfile(client);
    await openList(
      client,
      'following'
    );

    const following =
      await collect(
        client,
        sessionId,
        'Seguindo'
      );

    const followBack =
      followers.filter(
        x =>
          relationIs(
            x,
            'seguir de volta',
            'follow back'
          )
      );

    const mutualFollowers =
      followers.filter(
        x =>
          relationIs(
            x,
            'amigos',
            'friends'
          )
      );

    const mutualFollowing =
      following.filter(
        x =>
          relationIs(
            x,
            'amigos',
            'friends'
          )
      );

    const notFollowingBack =
      following.filter(
        x => {
          const r =
            x.relation
              .trim()
              .toLowerCase();

          return (
            r === 'seguindo' ||
            r === 'following'
          );
        }
      );

    const report = {
      generatedAt:
        new Date().toISOString(),

      totals: {
        followers:
          followers.length,

        following:
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
      'tiktok-relationship-queue-v2.json',
      JSON.stringify(
        report,
        null,
        2
      ),
      'utf8'
    );

    console.log('');
    console.log(
      '========================================'
    );

    console.log(
      'RESULTADO FINAL DA COLETA V2'
    );

    console.log(
      '========================================'
    );

    console.log(
      `Seguidores: ${followers.length}`
    );

    console.log(
      `Seguindo: ${following.length}`
    );

    console.log(
      `Seguir de volta: ${followBack.length}`
    );

    console.log(
      `Amigos Seguidores: ${mutualFollowers.length}`
    );

    console.log(
      `Amigos Seguindo: ${mutualFollowing.length}`
    );

    console.log(
      `Nao seguem de volta: ${notFollowingBack.length}`
    );

    console.log('');
    console.log(
      'Nenhum follow foi executado.'
    );

    console.log(
      'Nenhum unfollow foi executado.'
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

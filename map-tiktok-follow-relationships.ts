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
    .replace(/&gt;/g, '>');
}

function getAttr(line: string, name: string) {
  const m = line.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : '';
}

function normalize(value: string) {
  return value
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
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

async function goHome(client: AppiumClient) {
  for (let i = 0; i < 6; i++) {
    const home = await findId(client, 'olw');

    if (home) {
      await client.clickElement(home.elementId);
      await sleep(800);
      return;
    }

    await client.pressKey(4);
    await sleep(600);
  }

  throw new Error('Nao foi possivel voltar para Inicio.');
}

async function goProfile(client: AppiumClient) {
  await goHome(client);

  const profile = await findId(client, 'oly');

  if (!profile) {
    throw new Error('Botao Perfil nao encontrado.');
  }

  await client.clickElement(profile.elementId);
  await sleep(1500);
}

function extractPossibleUsers(source: string) {
  const ignored = new Set([
    'seguidores',
    'seguindo',
    'seguir',
    'follow',
    'followers',
    'following',
    'amigos',
    'friends',
    'perfil',
    'profile',
    'mensagem',
    'mensagens',
    'message',
    'messages',
    'pesquisar',
    'procurar',
    'search',
    'fechar',
    'close',
    'inicio',
    'home',
    'compartilhar',
    'share',
    'editar perfil',
    'edit profile'
  ]);

  const values = new Set<string>();

  for (const line of source.split(/\r?\n/)) {
    const cls = getAttr(line, 'class');
    const text = getAttr(line, 'text');
    const desc = getAttr(line, 'content-desc');

    for (const raw of [text, desc]) {
      const value = raw.trim();

      if (!value) continue;
      if (value.length > 80) continue;

      const normalized = normalize(value);

      if (!normalized) continue;
      if (ignored.has(normalized)) continue;
      if (/^\d+([.,]\d+)?[km]?$/.test(normalized)) continue;

      if (
        cls.includes('TextView') ||
        cls.includes('Button') ||
        cls.includes('ViewGroup')
      ) {
        values.add(value);
      }
    }
  }

  return [...values];
}

async function saveScreen(
  client: AppiumClient,
  name: string
) {
  const source = await client.getPageSource();

  fs.writeFileSync(
    `tiktok-map-${name}.xml`,
    source,
    'utf8'
  );

  const candidates = extractPossibleUsers(source);

  fs.writeFileSync(
    `tiktok-${name}-candidates.json`,
    JSON.stringify(candidates, null, 2),
    'utf8'
  );

  console.log(
    `${name}: ${candidates.length} candidatos de texto encontrados`
  );

  return {
    source,
    candidates
  };
}

async function openFollowers(client: AppiumClient) {
  const control = await findAny(client, [
    'new UiSelector().textContains("Seguidores")',
    'new UiSelector().descriptionContains("Seguidores")',
    'new UiSelector().textContains("Followers")',
    'new UiSelector().descriptionContains("Followers")'
  ]);

  if (!control) {
    return false;
  }

  await client.clickElement(control.elementId);
  await sleep(1500);

  return true;
}

async function openFollowing(client: AppiumClient) {
  const control = await findAny(client, [
    'new UiSelector().textContains("Seguindo")',
    'new UiSelector().descriptionContains("Seguindo")',
    'new UiSelector().textContains("Following")',
    'new UiSelector().descriptionContains("Following")'
  ]);

  if (!control) {
    return false;
  }

  await client.clickElement(control.elementId);
  await sleep(1500);

  return true;
}

async function main() {
  const client = new AppiumClient();

  try {
    await client.createSession(APPIUM, {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': DEVICE,
      'appium:udid': DEVICE,
      'appium:appPackage': PKG,
      'appium:appActivity':
        'com.ss.android.ugc.aweme.splash.SplashActivity',
      'appium:noReset': true,
      'appium:fullReset': false,
      'appium:autoGrantPermissions': true,
      'appium:newCommandTimeout': 600,
      'appium:settings[waitForIdleTimeout]': 1000,
      'appium:settings[waitForSelectorTimeout]': 1000,
      'appium:settings[trackScrollEvents]': false,
    });

    console.log('');
    console.log('========== PERFIL ==========');

    await sleep(3000);
    await goProfile(client);

    const profileSource = await client.getPageSource();

    fs.writeFileSync(
      'tiktok-map-profile-follow-round.xml',
      profileSource,
      'utf8'
    );

    console.log('');
    console.log('========== SEGUIDORES ==========');

    let followers: string[] = [];

    if (await openFollowers(client)) {
      const result = await saveScreen(
        client,
        'followers'
      );

      followers = result.candidates;

      await client.pressKey(4);
      await sleep(900);
    } else {
      console.log(
        'Controle Seguidores nao encontrado.'
      );
    }

    console.log('');
    console.log('========== SEGUINDO ==========');

    await goProfile(client);

    let following: string[] = [];

    if (await openFollowing(client)) {
      const result = await saveScreen(
        client,
        'following'
      );

      following = result.candidates;

      await client.pressKey(4);
      await sleep(900);
    } else {
      console.log(
        'Controle Seguindo nao encontrado.'
      );
    }

    const followerSet = new Set(
      followers.map(normalize)
    );

    const followingSet = new Set(
      following.map(normalize)
    );

    const followBack = followers.filter(
      user =>
        !followingSet.has(
          normalize(user)
        )
    );

    const notFollowingBack = following.filter(
      user =>
        !followerSet.has(
          normalize(user)
        )
    );

    const mutual = following.filter(
      user =>
        followerSet.has(
          normalize(user)
        )
    );

    const report = {
      generatedAt: new Date().toISOString(),
      followers,
      following,
      comparison: {
        mutual,
        followBackCandidates: followBack,
        notFollowingBackCandidates:
          notFollowingBack
      }
    };

    fs.writeFileSync(
      'tiktok-follow-relationship-map.json',
      JSON.stringify(report, null, 2),
      'utf8'
    );

    console.log('');
    console.log('======================================');
    console.log('MAPEAMENTO CONCLUIDO');
    console.log('======================================');

    console.log(
      `Seguidores visiveis capturados: ${followers.length}`
    );

    console.log(
      `Seguindo visiveis capturados: ${following.length}`
    );

    console.log(
      `Mutuos estimados: ${mutual.length}`
    );

    console.log(
      `Candidatos a seguir de volta: ${followBack.length}`
    );

    console.log(
      `Candidatos que nao seguem de volta: ${notFollowingBack.length}`
    );

    console.log('');
    console.log(
      'Nenhuma conta foi seguida.'
    );

    console.log(
      'Nenhuma conta deixou de ser seguida.'
    );

  } finally {
    await client.deleteSession().catch(() => {});
  }
}

main().catch(err => {
  console.error('');
  console.error('ERRO:', err);
  process.exitCode = 1;
});

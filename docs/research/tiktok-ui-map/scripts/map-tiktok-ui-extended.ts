import { AppiumClient } from './src/actions/mobile/appium-client.js';
import fs from 'node:fs';

const DEVICE = 'sgdi59volz9xgatg';
const APPIUM = 'http' + '://' + '127.0.0.1:4723';

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
  const match = line.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
}

function extractInteractive(source: string) {
  return source
    .split(/\r?\n/)
    .filter(line =>
      line.includes('clickable="true"') ||
      line.includes('focusable="true"') ||
      line.includes('scrollable="true"')
    )
    .map(line => ({
      class: getAttr(line, 'class'),
      text: getAttr(line, 'text'),
      description: getAttr(line, 'content-desc'),
      resourceId: getAttr(line, 'resource-id'),
      clickable: getAttr(line, 'clickable'),
      enabled: getAttr(line, 'enabled'),
      scrollable: getAttr(line, 'scrollable'),
      selected: getAttr(line, 'selected'),
      bounds: getAttr(line, 'bounds'),
    }))
    .filter(item =>
      item.text ||
      item.description ||
      item.resourceId
    );
}

async function snapshot(
  client: AppiumClient,
  name: string,
  report: any
) {
  const source = await client.getPageSource();

  report[name] = {
    capturedAt: new Date().toISOString(),
    elements: extractInteractive(source),
  };

  fs.writeFileSync(
    `tiktok-map-${name}.xml`,
    source,
    'utf8'
  );

  console.log(
    `${name}: ${report[name].elements.length} elementos interativos`
  );
}

async function tryFind(
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

async function safeBack(client: AppiumClient) {
  try {
    await client.pressKey(4);
    await sleep(800);
  } catch {}
}

async function mapByClick(
  client: AppiumClient,
  report: any,
  name: string,
  selectors: string[]
) {
  console.log('');
  console.log(`========== ${name.toUpperCase()} ==========`);

  const element = await tryFind(client, selectors);

  if (!element) {
    console.log(`${name}: controle nao encontrado.`);
    return;
  }

  await client.clickElement(element.elementId);
  await sleep(1400);

  await snapshot(client, name, report);

  await safeBack(client);
}

async function main() {
  const client = new AppiumClient();

  const report: any = {
    device: DEVICE,
    generatedAt: new Date().toISOString(),
    screens: {},
  };

  try {
    await client.createSession(APPIUM, {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': DEVICE,
      'appium:udid': DEVICE,
      'appium:appPackage': 'com.zhiliaoapp.musically',
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
    console.log('========== CARREGANDO TIKTOK ==========');

    await sleep(4000);

    await snapshot(
      client,
      'feed-base',
      report.screens
    );

    /*
     * BUSCA
     */
    await mapByClick(
      client,
      report.screens,
      'search',
      [
        'new UiSelector().description("Procurar")',
        'new UiSelector().description("Pesquisar")',
        'new UiSelector().description("Search")',
      ]
    );

    /*
     * PERFIL
     */
    await mapByClick(
      client,
      report.screens,
      'profile',
      [
        'new UiSelector().description("Perfil")',
        'new UiSelector().description("Profile")',
      ]
    );

    /*
     * MENSAGENS
     */
    await mapByClick(
      client,
      report.screens,
      'messages',
      [
        'new UiSelector().description("Mensagens")',
        'new UiSelector().description("Inbox")',
        'new UiSelector().description("Messages")',
      ]
    );

    /*
     * AMIGOS
     */
    await mapByClick(
      client,
      report.screens,
      'friends',
      [
        'new UiSelector().description("Amigos")',
        'new UiSelector().description("Friends")',
      ]
    );

    /*
     * AUDIO / MUSICA
     */
    console.log('');
    console.log('========== AUDIO ==========');

    const audioButton = await tryFind(client, [
      'new UiSelector().descriptionStartsWith("Som:")',
      'new UiSelector().descriptionStartsWith("Sound:")',
    ]);

    if (audioButton) {
      await client.clickElement(audioButton.elementId);
      await sleep(1400);

      await snapshot(
        client,
        'audio',
        report.screens
      );

      await safeBack(client);
    } else {
      console.log('audio: controle nao encontrado.');
    }

    /*
     * MENU DE PRESSAO LONGA
     * Usa W3C pointer action diretamente sobre o centro do video.
     * Nao seleciona nenhuma opcao do menu.
     */
    console.log('');
    console.log('========== LONG PRESS ==========');

    const video = await tryFind(client, [
      'new UiSelector().description("Vídeo")',
      'new UiSelector().description("Video")',
    ]);

    if (video) {
      const sourceBefore = await client.getPageSource();

      const line = sourceBefore
        .split(/\r?\n/)
        .find(l =>
          l.includes('content-desc="Vídeo"') ||
          l.includes('content-desc="Video"')
        );

      let x = 540;
      let y = 1000;

      if (line) {
        const bounds = getAttr(line, 'bounds');
        const match = bounds.match(
          /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/
        );

        if (match) {
          const x1 = Number(match[1]);
          const y1 = Number(match[2]);
          const x2 = Number(match[3]);
          const y2 = Number(match[4]);

          x = Math.round((x1 + x2) / 2);
          y = Math.round((y1 + y2) / 2);
        }
      }

      const anyClient = client as any;

      if (typeof anyClient.performActions === 'function') {
        await anyClient.performActions([
          {
            type: 'pointer',
            id: 'finger-long-press',
            parameters: {
              pointerType: 'touch',
            },
            actions: [
              {
                type: 'pointerMove',
                duration: 0,
                x,
                y,
              },
              {
                type: 'pointerDown',
                button: 0,
              },
              {
                type: 'pause',
                duration: 900,
              },
              {
                type: 'pointerUp',
                button: 0,
              },
            ],
          },
        ]);

        await sleep(1400);

        await snapshot(
          client,
          'long-press',
          report.screens
        );

        await safeBack(client);
      } else {
        console.log(
          'long-press: performActions nao esta exposto publicamente.'
        );
      }
    } else {
      console.log('long-press: area do video nao encontrada.');
    }

    /*
     * SNAPSHOT FINAL
     */
    await snapshot(
      client,
      'feed-final-2',
      report.screens
    );

    fs.writeFileSync(
      'tiktok-ui-map-extended.json',
      JSON.stringify(report, null, 2),
      'utf8'
    );

    console.log('');
    console.log('====================================');
    console.log('MAPEAMENTO ESTENDIDO CONCLUIDO');
    console.log('====================================');

    console.log('');
    console.log('Nenhum like foi executado.');
    console.log('Nenhum follow foi executado.');
    console.log('Nenhum comentario foi enviado.');
    console.log('Nenhum compartilhamento foi enviado.');
    console.log('Nenhuma mensagem foi enviada.');
    console.log('Nenhuma publicacao foi criada.');

  } finally {
    await client.deleteSession().catch(() => {});
  }
}

main().catch(err => {
  console.error('');
  console.error('ERRO:', err);
  process.exitCode = 1;
});

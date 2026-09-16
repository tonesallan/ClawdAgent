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
    .filter(x => x.text || x.description || x.resourceId);
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

async function onFeed(client: AppiumClient) {
  /*
   * olw = botão Início da barra inferior.
   * Se ele existe, estamos numa tela que possui a navegação principal.
   */
  const home = await findId(client, 'olw');
  return !!home;
}

async function ensureFeed(client: AppiumClient) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    if (await onFeed(client)) {
      /*
       * Clica em Início para garantir o feed.
       */
      const home = await findId(client, 'olw');

      if (home) {
        await client.clickElement(home.elementId);
        await sleep(900);
      }

      return;
    }

    console.log(
      `Voltando ao feed (${attempt}/6)...`
    );

    await client.pressKey(4);
    await sleep(800);
  }

  throw new Error(
    'Nao foi possivel retornar ao feed principal.'
  );
}

async function mapBottomTab(
  client: AppiumClient,
  report: any,
  name: string,
  resourceId: string
) {
  console.log('');
  console.log(
    `========== ${name.toUpperCase()} ==========`
  );

  await ensureFeed(client);

  const button = await findId(
    client,
    resourceId
  );

  if (!button) {
    console.log(
      `${name}: botao nao encontrado.`
    );
    return;
  }

  await client.clickElement(button.elementId);
  await sleep(1500);

  await snapshot(
    client,
    name,
    report
  );

  /*
   * Não depende de BACK.
   * Voltamos pelo fluxo de recuperação do feed.
   */
  await ensureFeed(client);
}

async function longPress(
  sessionId: string,
  x: number,
  y: number
) {
  const response = await fetch(
    `${APPIUM}/session/${sessionId}/actions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        actions: [
          {
            type: 'pointer',
            id: 'finger',
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
                duration: 1000,
              },
              {
                type: 'pointerUp',
                button: 0,
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Long press falhou: HTTP ${response.status}`
    );
  }

  await fetch(
    `${APPIUM}/session/${sessionId}/actions`,
    {
      method: 'DELETE',
    }
  ).catch(() => {});
}

async function getElementRect(
  sessionId: string,
  elementId: string
) {
  const response = await fetch(
    `${APPIUM}/session/${sessionId}/element/${elementId}/rect`
  );

  if (!response.ok) {
    throw new Error(
      `Falha ao obter rect: HTTP ${response.status}`
    );
  }

  const body: any = await response.json();
  return body.value;
}

async function main() {
  const client = new AppiumClient();

  const report: any = {
    device: DEVICE,
    generatedAt: new Date().toISOString(),
    screens: {},
  };

  try {
    const sessionId = await client.createSession(
      APPIUM,
      {
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
      }
    );

    console.log('');
    console.log(
      '========== RECUPERANDO FEED =========='
    );

    await sleep(3000);
    await ensureFeed(client);

    await snapshot(
      client,
      'feed-recovered',
      report.screens
    );

    /*
     * PERFIL
     * oly = Perfil
     */
    await mapBottomTab(
      client,
      report.screens,
      'profile',
      'oly'
    );

    /*
     * MENSAGENS
     * olx = Mensagens
     */
    await mapBottomTab(
      client,
      report.screens,
      'messages',
      'olx'
    );

    /*
     * AMIGOS
     * olv = Amigos
     */
    await mapBottomTab(
      client,
      report.screens,
      'friends',
      'olv'
    );

    /*
     * AUDIO
     * pmi = botão acessível "Som: ..."
     */
    console.log('');
    console.log(
      '========== AUDIO =========='
    );

    await ensureFeed(client);

    const audio = await findId(
      client,
      'pmi'
    );

    if (audio) {
      await client.clickElement(audio.elementId);
      await sleep(1500);

      await snapshot(
        client,
        'audio',
        report.screens
      );

      await ensureFeed(client);
    } else {
      console.log(
        'audio: botao pmi nao encontrado neste video.'
      );
    }

    /*
     * LONG PRESS
     * long_press_layout = área completa do vídeo.
     */
    console.log('');
    console.log(
      '========== LONG PRESS =========='
    );

    await ensureFeed(client);

    const video = await findId(
      client,
      'long_press_layout'
    );

    if (video) {
      const rect = await getElementRect(
        sessionId,
        video.elementId
      );

      const x = Math.round(
        rect.x + rect.width / 2
      );

      /*
       * Usa ~45% da altura do vídeo.
       * Evita botões laterais e legenda inferior.
       */
      const y = Math.round(
        rect.y + rect.height * 0.45
      );

      console.log(
        `Pressao longa em x=${x}, y=${y}`
      );

      await longPress(
        sessionId,
        x,
        y
      );

      await sleep(1400);

      await snapshot(
        client,
        'long-press',
        report.screens
      );

      await client.pressKey(4);
      await sleep(800);
    } else {
      console.log(
        'long-press: long_press_layout nao encontrado.'
      );
    }

    await ensureFeed(client);

    await snapshot(
      client,
      'feed-final-corrected',
      report.screens
    );

    fs.writeFileSync(
      'tiktok-ui-map-remaining.json',
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
      'MAPEAMENTO RESTANTE CONCLUIDO'
    );
    console.log(
      '======================================'
    );

    console.log('');
    console.log(
      'Nenhum like executado.'
    );
    console.log(
      'Nenhum follow executado.'
    );
    console.log(
      'Nenhum comentario enviado.'
    );
    console.log(
      'Nenhuma mensagem enviada.'
    );
    console.log(
      'Nenhum compartilhamento enviado.'
    );
    console.log(
      'Nenhuma publicacao criada.'
    );

  } finally {
    await client.deleteSession().catch(
      () => {}
    );
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

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

    /*
     * 1. FEED PRINCIPAL
     */
    console.log('');
    console.log('========== FEED ==========');

    await snapshot(
      client,
      'feed',
      report.screens
    );

    /*
     * 2. COMENTARIOS
     * Apenas abre e mapeia.
     * Nao escreve nem envia nada.
     */
    console.log('');
    console.log('========== COMENTARIOS ==========');

    const commentButton = await tryFind(client, [
      'new UiSelector().descriptionStartsWith("Leia ou adicione comentários")',
      'new UiSelector().descriptionContains("comentário")',
      'new UiSelector().descriptionContains("comment")',
    ]);

    if (commentButton) {
      await client.clickElement(commentButton.elementId);
      await sleep(1200);

      await snapshot(
        client,
        'comments',
        report.screens
      );

      await client.pressKey(4);
      await sleep(700);
    } else {
      console.log('Botao de comentarios nao encontrado.');
    }

    /*
     * 3. COMPARTILHAR
     * Apenas abre e mapeia.
     * Nao seleciona destinatario.
     */
    console.log('');
    console.log('========== COMPARTILHAR ==========');

    const shareButton = await tryFind(client, [
      'new UiSelector().descriptionStartsWith("Compartilhar vídeo")',
      'new UiSelector().descriptionStartsWith("Share video")',
    ]);

    if (shareButton) {
      await client.clickElement(shareButton.elementId);
      await sleep(1200);

      await snapshot(
        client,
        'share',
        report.screens
      );

      await client.pressKey(4);
      await sleep(700);
    } else {
      console.log('Botao compartilhar nao encontrado.');
    }

    /*
     * 4. NOVO SNAPSHOT DO FEED
     */
    console.log('');
    console.log('========== FEED FINAL ==========');

    await snapshot(
      client,
      'feed-final',
      report.screens
    );

    /*
     * SALVA JSON
     */
    fs.writeFileSync(
      'tiktok-ui-map.json',
      JSON.stringify(report, null, 2),
      'utf8'
    );

    console.log('');
    console.log('====================================');
    console.log('MAPEAMENTO CONCLUIDO');
    console.log('====================================');
    console.log('');
    console.log('Arquivos gerados:');
    console.log('  tiktok-ui-map.json');
    console.log('  tiktok-map-feed.xml');
    console.log('  tiktok-map-comments.xml');
    console.log('  tiktok-map-share.xml');
    console.log('  tiktok-map-feed-final.xml');
    console.log('');
    console.log('Nenhum like foi executado.');
    console.log('Nenhum follow foi executado.');
    console.log('Nenhum comentario foi enviado.');
    console.log('Nenhum compartilhamento foi enviado.');

  } finally {
    await client.deleteSession().catch(() => {});
  }
}

main().catch(err => {
  console.error('');
  console.error('ERRO:', err);
  process.exitCode = 1;
});

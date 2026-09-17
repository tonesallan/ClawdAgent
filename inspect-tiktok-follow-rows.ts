import fs from 'node:fs';

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

function getAttr(line: string, name: string) {
  const m = line.match(
    new RegExp(`${name}="([^"]*)"`)
  );

  return m ? decodeXml(m[1]) : '';
}

function inspect(
  file: string,
  label: string
) {
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo ausente: ${file}`);
  }

  const lines = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/);

  const output: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const text = getAttr(line, 'text');
    const desc = getAttr(line, 'content-desc');

    if (!text && !desc) continue;

    const cls = getAttr(line, 'class');
    const id = getAttr(line, 'resource-id');
    const bounds = getAttr(line, 'bounds');

    output.push({
      line: i + 1,
      text,
      description: desc,
      class: cls,
      resourceId: id,
      bounds,
      context: lines
        .slice(
          Math.max(0, i - 2),
          Math.min(lines.length, i + 3)
        )
        .join('\n')
    });
  }

  fs.writeFileSync(
    `tiktok-${label}-structure.json`,
    JSON.stringify(output, null, 2),
    'utf8'
  );

  console.log('');
  console.log(
    `========== ${label.toUpperCase()} ==========`
  );

  for (const item of output) {
    const value =
      item.text || item.description;

    if (
      value.length <= 60 &&
      !/^\d+([.,]\d+)?[kKmM]?$/.test(value)
    ) {
      console.log('');
      console.log(`VALOR: ${value}`);
      console.log(`CLASS: ${item.class}`);
      console.log(`ID: ${item.resourceId}`);
      console.log(`BOUNDS: ${item.bounds}`);
      console.log(`LINHA: ${item.line}`);
    }
  }

  return output;
}

const followers = inspect(
  'tiktok-map-followers.xml',
  'followers'
);

const following = inspect(
  'tiktok-map-following.xml',
  'following'
);

function summarizeIds(items: any[]) {
  const map = new Map<string, any>();

  for (const item of items) {
    if (!item.resourceId) continue;

    const key =
      `${item.resourceId}|${item.class}`;

    if (!map.has(key)) {
      map.set(key, {
        resourceId: item.resourceId,
        class: item.class,
        examples: new Set<string>()
      });
    }

    const value =
      item.text || item.description;

    if (value) {
      map.get(key).examples.add(value);
    }
  }

  return [...map.values()].map(x => ({
    resourceId: x.resourceId,
    class: x.class,
    examples: [...x.examples].slice(0, 20)
  }));
}

const report = {
  followers: summarizeIds(followers),
  following: summarizeIds(following)
};

fs.writeFileSync(
  'tiktok-follow-row-structure.json',
  JSON.stringify(report, null, 2),
  'utf8'
);

console.log('');
console.log(
  '======================================'
);
console.log(
  'ESTRUTURA ANALISADA'
);
console.log(
  '======================================'
);

console.log('');
console.log(
  'Arquivo principal: tiktok-follow-row-structure.json'
);

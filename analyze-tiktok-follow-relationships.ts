import fs from 'node:fs';

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
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

/*
 * Username TikTok:
 * letras, números, ponto e underscore.
 *
 * Excluímos textos de interface e nomes com espaços.
 */
function looksLikeUsername(value: string) {
  const v = value.trim();

  if (!v) return false;
  if (v.length < 2 || v.length > 30) return false;

  if (!/^[A-Za-z0-9._]+$/.test(v)) {
    return false;
  }

  const ignored = new Set([
    'seguir',
    'segue',
    'seguindo',
    'seguidores',
    'amigos',
    'sugerido',
    'gerenciar',
    'live',
    'perfil',
    'inicio',
    'procurar',
    'pesquisar'
  ]);

  if (ignored.has(v.toLowerCase())) {
    return false;
  }

  return true;
}

function extractUsernames(xmlPath: string) {
  if (!fs.existsSync(xmlPath)) {
    throw new Error(`Arquivo nao encontrado: ${xmlPath}`);
  }

  const source = fs.readFileSync(xmlPath, 'utf8');

  const usernames = new Set<string>();

  for (const line of source.split(/\r?\n/)) {
    const text = getAttr(line, 'text');
    const desc = getAttr(line, 'content-desc');

    for (const candidate of [text, desc]) {
      if (looksLikeUsername(candidate)) {
        usernames.add(normalize(candidate));
      }
    }
  }

  return [...usernames].sort();
}

const followers = extractUsernames(
  'tiktok-map-followers.xml'
);

const following = extractUsernames(
  'tiktok-map-following.xml'
);

const followersSet = new Set(followers);
const followingSet = new Set(following);

const mutual = following.filter(
  user => followersSet.has(user)
);

const followBack = followers.filter(
  user => !followingSet.has(user)
);

const notFollowingBack = following.filter(
  user => !followersSet.has(user)
);

const report = {
  generatedAt: new Date().toISOString(),

  note:
    'Comparacao somente dos usernames atualmente visiveis/carregados nas capturas.',

  followers,
  following,

  comparison: {
    mutual,
    followBackCandidates: followBack,
    notFollowingBackCandidates: notFollowingBack
  }
};

fs.writeFileSync(
  'tiktok-follow-relationship-clean.json',
  JSON.stringify(report, null, 2),
  'utf8'
);

console.log('');
console.log('========== RESULTADO LIMPO ==========');

console.log(
  `Seguidores identificados: ${followers.length}`
);

console.log(
  `Seguindo identificados: ${following.length}`
);

console.log(
  `Mutuos: ${mutual.length}`
);

console.log(
  `Seguir de volta: ${followBack.length}`
);

console.log(
  `Nao seguem de volta: ${notFollowingBack.length}`
);

console.log('');
console.log('SEGUIDORES:');
console.log(followers);

console.log('');
console.log('SEGUINDO:');
console.log(following);

console.log('');
console.log('SEGUIR DE VOLTA:');
console.log(followBack);

console.log('');
console.log('NAO SEGUEM DE VOLTA:');
console.log(notFollowingBack);

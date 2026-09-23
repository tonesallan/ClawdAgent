import fs from 'node:fs';

const PKG = 'com.zhiliaoapp.musically';

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

type UserRow = {
  displayName: string;
  username: string;
  relation: string;
  source: 'txt_desc' | 'txt_user_name';
};

function parseRows(xmlFile: string): UserRow[] {
  const source = fs.readFileSync(
    xmlFile,
    'utf8'
  );

  const lines = source.split(/\r?\n/);

  const rows: UserRow[] = [];

  /*
   * Cada botão u68 pertence a uma linha de usuário.
   * Olhamos para trás para achar nome e username
   * da mesma linha.
   */
  for (let i = 0; i < lines.length; i++) {
    const id = attr(
      lines[i],
      'resource-id'
    );

    if (
      id !== `${PKG}:id/u68`
    ) {
      continue;
    }

    const relation =
      attr(lines[i], 'text') ||
      attr(lines[i], 'content-desc');

    /*
     * Janela curta para impedir mistura entre usuários.
     */
    const start = Math.max(
      0,
      i - 12
    );

    const chunk = lines.slice(
      start,
      i + 1
    );

    let displayName = '';
    let descriptionUsername = '';

    for (const line of chunk) {
      const resourceId = attr(
        line,
        'resource-id'
      );

      const text = attr(
        line,
        'text'
      );

      if (
        resourceId ===
        `${PKG}:id/txt_user_name`
      ) {
        displayName = text;
      }

      if (
        resourceId ===
        `${PKG}:id/txt_desc`
      ) {
        descriptionUsername = text;
      }
    }

    let username = '';
    let usernameSource:
      'txt_desc' |
      'txt_user_name' =
      'txt_desc';

    /*
     * Regra principal:
     * txt_desc é o @username real.
     */
    if (
      validUsername(
        descriptionUsername
      )
    ) {
      username = normalize(
        descriptionUsername
      );

      usernameSource =
        'txt_desc';
    }

    /*
     * Alguns tipos de conta não mostram txt_desc.
     * Nesses casos usamos txt_user_name SOMENTE
     * se ele tiver formato válido de username.
     */
    else if (
      validUsername(displayName)
    ) {
      username = normalize(
        displayName
      );

      usernameSource =
        'txt_user_name';
    }

    if (!username) {
      continue;
    }

    /*
     * Nunca incluir o próprio cabeçalho/perfil.
     */
    if (
      username === 'tonesallan'
    ) {
      continue;
    }

    rows.push({
      displayName,
      username,
      relation:
        relation.trim(),
      source:
        usernameSource
    });
  }

  /*
   * Deduplicação por username.
   */
  return [
    ...new Map(
      rows.map(row => [
        row.username,
        row
      ])
    ).values()
  ];
}

const followers = parseRows(
  'tiktok-map-followers.xml'
);

const following = parseRows(
  'tiktok-map-following.xml'
);

const followerNames = new Set(
  followers.map(
    x => x.username
  )
);

const followingNames = new Set(
  following.map(
    x => x.username
  )
);

const mutual = following.filter(
  x =>
    followerNames.has(
      x.username
    )
);

const followBack =
  followers.filter(
    x =>
      !followingNames.has(
        x.username
      )
  );

const notFollowingBack =
  following.filter(
    x =>
      !followerNames.has(
        x.username
      )
  );

const report = {
  generatedAt:
    new Date().toISOString(),

  scope:
    'Somente contas visíveis nas capturas XML atuais.',

  followers,
  following,

  comparison: {
    mutual,
    followBackCandidates:
      followBack,
    notFollowingBackCandidates:
      notFollowingBack
  }
};

fs.writeFileSync(
  'tiktok-follow-relationship-rows.json',
  JSON.stringify(
    report,
    null,
    2
  ),
  'utf8'
);

console.log('');
console.log(
  '========== COMPARACAO POR LINHAS =========='
);

console.log(
  `Seguidores: ${followers.length}`
);

console.log(
  `Seguindo: ${following.length}`
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
console.log(
  '========== SEGUIDORES =========='
);

console.table(followers);

console.log('');
console.log(
  '========== SEGUINDO =========='
);

console.table(following);

console.log('');
console.log(
  '========== SEGUIR DE VOLTA =========='
);

console.table(followBack);

console.log('');
console.log(
  '========== NAO SEGUEM DE VOLTA =========='
);

console.table(notFollowingBack);

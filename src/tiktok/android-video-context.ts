export interface TikTokVideoContext {
  caption: string | null;
  hashtags: string[];
  creatorUsername: string | null;
  snippets: string[];
  fingerprint: string;
}

interface TikTokXmlValue {
  value: string;
  attribute: 'text' | 'content-desc';
  line: string;
}

const CONTROL_PREFIXES = [
  'curtir vídeo',
  'like video',
  'leia ou adicione comentários',
  'read or add comments',
  'compartilhar vídeo',
  'share video',
  'início',
  'home',
  'amigos',
  'friends',
  'seguindo',
  'following',
  'para você',
  'for you',
  'pesquisar',
  'search',
  'perfil',
  'profile',
  'caixa de entrada',
  'inbox',
];

function decodeXmlEntities(
  value: string,
): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#10;/g, ' ')
    .replace(/&#13;/g, ' ');
}

function normalizeWhitespace(
  value: string,
): string {
  return decodeXmlEntities(
    value,
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function collectTikTokXmlValues(
  source: string,
): TikTokXmlValue[] {
  const values:
    TikTokXmlValue[] =
      [];

  for (
    const line of
      source.split(/\r?\n/)
  ) {
    for (
      const match of
        line.matchAll(
          /\b(text|content-desc)="([^"]*)"/g,
        )
    ) {
      const value =
        normalizeWhitespace(
          match[2] ?? '',
        );

      if (!value) {
        continue;
      }

      values.push({
        value,
        attribute:
          match[1] as
            | 'text'
            | 'content-desc',
        line,
      });
    }
  }

  return values;
}

function isControlValue(
  value: string,
): boolean {
  const normalized =
    value
      .toLocaleLowerCase(
        'pt-BR',
      )
      .trim();

  if (
    CONTROL_PREFIXES.some(
      prefix =>
        normalized ===
          prefix ||
        normalized.startsWith(
          `${prefix} `,
        ) ||
        normalized.startsWith(
          `${prefix},`,
        ) ||
        normalized.startsWith(
          `${prefix}.`,
        ),
    )
  ) {
    return true;
  }

  if (
    /^[\d.,]+[kmb]?$/i.test(
      normalized,
    )
  ) {
    return true;
  }

  return false;
}

function normalizeUsername(
  value:
    string | null,
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    value
      .trim()
      .replace(/^@/, '');

  return /^[A-Za-z0-9._]{2,24}$/.test(
    normalized,
  )
    ? normalized
    : null;
}

function scoreCaptionCandidate(
  candidate:
    TikTokXmlValue,
): number {
  const value =
    candidate.value;

  if (
    isControlValue(
      value,
    )
  ) {
    return -100;
  }

  if (
    /^@[A-Za-z0-9._]{2,24}$/.test(
      value,
    )
  ) {
    return -100;
  }

  let score = 0;

  if (
    candidate.attribute ===
      'text'
  ) {
    score += 2;
  }

  if (
    /#[\p{L}\p{N}_.]+/u.test(
      value,
    )
  ) {
    score += 5;
  }

  if (
    value.length >= 20
  ) {
    score += 2;
  }

  if (
    value.length >= 40
  ) {
    score += 2;
  }

  if (
    /android\.widget\.TextView/.test(
      candidate.line,
    )
  ) {
    score += 1;
  }

  if (
    /user_avatar|bottom|navigation/i.test(
      candidate.line,
    )
  ) {
    score -= 4;
  }

  return score;
}

export function extractTikTokVideoContextFromXml(
  source: string,
): TikTokVideoContext {
  const values =
    collectTikTokXmlValues(
      source,
    );

  const uniqueValues =
    [...new Set(
      values
        .map(
          item =>
            item.value,
        ),
    )];

  const hashtags =
    [...new Set(
      uniqueValues
        .flatMap(
          value =>
            [...value.matchAll(
              /#([\p{L}\p{N}_.]+)/gu,
            )]
              .map(
                match =>
                  (
                    match[1] ??
                    ''
                  )
                    .toLocaleLowerCase(
                      'pt-BR',
                    ),
              ),
        )
        .filter(Boolean),
    )];

  let creatorUsername:
    string | null =
      null;

  for (
    const value of
      uniqueValues
  ) {
    const match =
      value.match(
        /(?:^|\s)@([A-Za-z0-9._]{2,24})(?:\b|$)/,
      );

    const normalized =
      normalizeUsername(
        match?.[1] ??
        null,
      );

    if (normalized) {
      creatorUsername =
        normalized;

      break;
    }
  }

  const caption =
    values
      .map(
        value => ({
          value:
            value.value,
          score:
            scoreCaptionCandidate(
              value,
            ),
        }),
      )
      .filter(
        candidate =>
          candidate.score >
            0,
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.score -
          left.score ||
          right.value.length -
          left.value.length,
      )
      [0]
      ?.value ??
    null;

  const snippets =
    uniqueValues
      .filter(
        value =>
          !isControlValue(
            value,
          ) &&
          !/^@[A-Za-z0-9._]{2,24}$/.test(
            value,
          ) &&
          value.length >=
            4,
      )
      .slice(
        0,
        12,
      );

  const fingerprintParts =
    [
      creatorUsername ??
        '',
      caption ??
        '',
      hashtags.join(','),
    ]
      .map(
        value =>
          value
            .toLocaleLowerCase(
              'pt-BR',
            )
            .replace(
              /\s+/g,
              ' ',
            )
            .trim(),
      );

  return {
    caption,
    hashtags,
    creatorUsername,
    snippets,
    fingerprint:
      fingerprintParts.join(
        '|',
      ),
  };
}

export function hasMeaningfulTikTokVideoContext(
  context:
    TikTokVideoContext,
): boolean {
  return Boolean(
    (
      context.caption &&
      context.caption.length >=
        6
    ) ||
    context.hashtags.length >
      0,
  );
}

export function tikTokVideoContextsMatch(
  before:
    TikTokVideoContext,
  after:
    TikTokVideoContext,
): boolean {
  let comparable = 0;
  let matched = 0;

  if (
    before.creatorUsername &&
    after.creatorUsername
  ) {
    comparable += 1;

    if (
      before.creatorUsername
        .toLocaleLowerCase(
          'pt-BR',
        ) !==
      after.creatorUsername
        .toLocaleLowerCase(
          'pt-BR',
        )
    ) {
      return false;
    }

    matched += 1;
  }

  if (
    before.caption &&
    after.caption
  ) {
    comparable += 1;

    const left =
      before.caption
        .toLocaleLowerCase(
          'pt-BR',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim();

    const right =
      after.caption
        .toLocaleLowerCase(
          'pt-BR',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim();

    if (left !== right) {
      return false;
    }

    matched += 1;
  }

  return (
    comparable >
      0 &&
    matched ===
      comparable
  );
}

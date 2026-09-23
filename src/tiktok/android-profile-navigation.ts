const DIRECTIONAL_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const TIKTOK_SEARCH_INPUT_ID = 'com.zhiliaoapp.musically:id/htb';

export interface TikTokXmlBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TikTokProfileSearchCandidate {
  line: string;
  text: string;
  contentDescription: string;
  resourceId: string;
  clickable: boolean;
  bounds: TikTokXmlBounds | null;
  score: number;
}

export interface TikTokProfileSearchResult {
  candidate: TikTokProfileSearchCandidate | null;
  mentions: string[];
}

export interface TikTokProfileTapPoint {
  x: number;
  y: number;
}

export function getTikTokProfileTapPoint(
  bounds: TikTokXmlBounds,
  screenWidth: number,
  horizontalMargin = 120,
): TikTokProfileTapPoint {
  const candidateX = Math.round(
    (bounds.x1 + bounds.x2) / 2,
  );
  const candidateY = Math.round(
    (bounds.y1 + bounds.y2) / 2,
  );

  return {
    x: Math.max(
      horizontalMargin,
      Math.min(
        screenWidth - horizontalMargin,
        candidateX,
      ),
    ),
    y: candidateY,
  };
}

export function getTikTokXmlAttribute(
  line: string,
  attribute: string,
): string {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = line.match(
    new RegExp(`${escapedAttribute}="([^"]*)"`, 'i'),
  );

  return match?.[1] ?? '';
}

export function normalizeTikTokXmlText(value: string): string {
  return value
    .replace(DIRECTIONAL_MARKS, '')
    .trim()
    .replace(/^@/, '')
    .toLocaleLowerCase('pt-BR');
}

export function normalizeTikTokUsername(username: string): string {
  return username
    .trim()
    .replace(/^@/, '')
    .toLocaleLowerCase('pt-BR');
}

export function containsExactTikTokUsername(
  value: string,
  username: string,
): boolean {
  const wanted = normalizeTikTokUsername(username);

  if (!wanted) {
    return false;
  }

  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalizedValue = value
    .replace(DIRECTIONAL_MARKS, '')
    .toLocaleLowerCase('pt-BR');

  return new RegExp(
    `(^|[^a-z0-9._])@?${escaped}([^a-z0-9._]|$)`,
    'i',
  ).test(normalizedValue);
}

export function parseTikTokXmlBounds(
  value: string,
): TikTokXmlBounds | null {
  const match = value.match(
    /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  );

  if (!match) {
    return null;
  }

  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

function scoreTikTokProfileCandidate(
  line: string,
  normalizedUsername: string,
): number {
  const lower = line.toLocaleLowerCase('pt-BR');
  let score = 0;

  if (lower.includes('txt_desc')) {
    score += 10;
  }

  if (lower.includes(`@${normalizedUsername}`)) {
    score += 5;
  }

  if (lower.includes('clickable="true"')) {
    score += 3;
  }

  return score;
}

export function findTikTokProfileSearchCandidate(
  xmlSource: string,
  username: string,
): TikTokProfileSearchResult {
  const wanted = normalizeTikTokUsername(username);
  const lines = xmlSource.split(/\r?\n/);

  const candidates = lines
    .filter(line => {
      const lower = line.toLocaleLowerCase('pt-BR');

      if (
        lower.includes(TIKTOK_SEARCH_INPUT_ID) ||
        lower.includes('android.widget.edittext')
      ) {
        return false;
      }

      const text = normalizeTikTokXmlText(
        getTikTokXmlAttribute(line, 'text'),
      );
      const description = normalizeTikTokXmlText(
        getTikTokXmlAttribute(line, 'content-desc'),
      );

      return (
        text === wanted ||
        description === wanted ||
        containsExactTikTokUsername(
          getTikTokXmlAttribute(line, 'content-desc'),
          wanted,
        )
      );
    })
    .map<TikTokProfileSearchCandidate>(line => ({
      line,
      text: getTikTokXmlAttribute(line, 'text'),
      contentDescription: getTikTokXmlAttribute(line, 'content-desc'),
      resourceId: getTikTokXmlAttribute(line, 'resource-id'),
      clickable: getTikTokXmlAttribute(line, 'clickable') === 'true',
      bounds: parseTikTokXmlBounds(line),
      score: scoreTikTokProfileCandidate(line, wanted),
    }))
    .sort((a, b) => b.score - a.score);

  const mentions = lines
    .filter(line =>
      line
        .toLocaleLowerCase('pt-BR')
        .includes(wanted),
    )
    .filter(line =>
      !line.includes(TIKTOK_SEARCH_INPUT_ID),
    )
    .slice(0, 5)
    .map(line => line.trim());

  return {
    candidate: candidates[0] ?? null,
    mentions,
  };
}

export function extractTikTokProfileUsername(
  profileSource: string,
): string | null {
  const lines =
    profileSource.split(
      /\r?\n/,
    );

  for (
    const line of
      lines
  ) {
    if (
      !line.includes(
        'com.zhiliaoapp.musically:id/t1b',
      )
    ) {
      continue;
    }

    const text =
      getTikTokXmlAttribute(
        line,
        'text',
      )
        .trim();

    if (
      !text.startsWith(
        '@',
      )
    ) {
      continue;
    }

    const username =
      text
        .slice(
          1,
        )
        .trim();

    if (
      /^[A-Za-z0-9._]{2,24}$/.test(
        username,
      )
    ) {
      return username;
    }
  }

  return null;
}

export function tikTokProfileSourceMatchesUsername(
  profileSource: string,
  username: string,
): boolean {
  return containsExactTikTokUsername(
    profileSource,
    username,
  );
}

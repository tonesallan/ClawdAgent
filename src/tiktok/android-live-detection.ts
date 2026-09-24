export interface TikTokLiveDetection {
  isLive: boolean;
  reasons: string[];
  matchedValues: string[];
}

interface TikTokXmlNode {
  text: string;
  contentDescription: string;
  resourceId: string;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null;
}

function decodeXml(
  value: string,
): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#10;/g, ' ')
    .replace(/&#13;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(
  value: string,
): string {
  return decodeXml(
    value,
  )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLocaleLowerCase(
      'pt-BR',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

function attr(
  tag: string,
  name: string,
): string {
  const escaped =
    name.replace(
      /[-/\\^$*+?.()|[\]{}]/g,
      '\\$&',
    );

  const match =
    tag.match(
      new RegExp(
        `\\b${escaped}="([^"]*)"`,
      ),
    );

  return decodeXml(
    match?.[1] ??
      '',
  );
}

function parseBounds(
  value: string,
): TikTokXmlNode['bounds'] {
  const match =
    value.match(
      /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/,
    );

  if (
    !match
  ) {
    return null;
  }

  return {
    left:
      Number(
        match[1],
      ),
    top:
      Number(
        match[2],
      ),
    right:
      Number(
        match[3],
      ),
    bottom:
      Number(
        match[4],
      ),
  };
}

function parseNodes(
  source: string,
): TikTokXmlNode[] {
  return (
    source.match(
      /<[^>]+>/g,
    ) ??
    []
  )
    .filter(
      tag =>
        !tag.startsWith(
          '</',
        ),
    )
    .map(
      tag => ({
        text:
          attr(
            tag,
            'text',
          ),
        contentDescription:
          attr(
            tag,
            'content-desc',
          ),
        resourceId:
          attr(
            tag,
            'resource-id',
          ),
        bounds:
          parseBounds(
            attr(
              tag,
              'bounds',
            ),
          ),
      }),
    );
}

const STRONG_LIVE_PHRASES = [
  'assistindo a live',
  'assistindo à live',
  'assistir live',
  'assistir a live',
  'entrar na live',
  'ao vivo agora',
  'live agora',
  'live now',
  'watch live',
  'join live',
  'watching live',
  'enviar presente',
  'send gift',
  'presentes',
  'gifts',
  'live encerrada',
  'live ended',
  'classificacao da live',
  'live ranking',
];

function isStrongLiveValue(
  value: string,
): boolean {
  const normalized =
    normalize(
      value,
    );

  return STRONG_LIVE_PHRASES
    .some(
      phrase =>
        normalized.includes(
          normalize(
            phrase,
          ),
        ),
    );
}

function isExactLiveBadge(
  value: string,
): boolean {
  const normalized =
    normalize(
      value,
    );

  return (
    normalized ===
      'live' ||
    normalized ===
      'ao vivo'
  );
}

export function detectTikTokLiveFromXml(
  source: string,
): TikTokLiveDetection {
  const nodes =
    parseNodes(
      source,
    );

  const maxBottom =
    nodes.reduce(
      (
        current,
        node,
      ) =>
        Math.max(
          current,
          node.bounds
            ?.bottom ??
            0,
        ),
      0,
    );

  const topNavigationCutoff =
    Math.max(
      300,
      Math.round(
        maxBottom *
          0.16,
      ),
    );

  const matchedValues:
    string[] =
      [];

  const reasons:
    string[] =
      [];

  for (
    const node of
      nodes
  ) {
    const values =
      [
        node.text,
        node.contentDescription,
      ]
        .map(
          value =>
            value.trim(),
        )
        .filter(Boolean);

    for (
      const value of
        values
    ) {
      if (
        isStrongLiveValue(
          value,
        )
      ) {
        matchedValues.push(
          value,
        );

        reasons.push(
          `strong live signal: ${value}`,
        );
      }

      if (
        isExactLiveBadge(
          value,
        )
      ) {
        const top =
          node.bounds
            ?.top ??
          0;

        const isLikelyTopTab =
          top <
          topNavigationCutoff;

        if (
          !isLikelyTopTab
        ) {
          matchedValues.push(
            value,
          );

          reasons.push(
            `live badge outside top navigation: ${value}`,
          );
        }
      }
    }

    if (
      /live/i.test(
        node.resourceId,
      ) &&
      node.bounds &&
      node.bounds.top >=
        topNavigationCutoff
    ) {
      reasons.push(
        `live resource id: ${node.resourceId}`,
      );
    }
  }

  const uniqueReasons =
    [
      ...new Set(
        reasons,
      ),
    ];

  const uniqueValues =
    [
      ...new Set(
        matchedValues,
      ),
    ];

  return {
    isLive:
      uniqueReasons.length >
      0,
    reasons:
      uniqueReasons,
    matchedValues:
      uniqueValues,
  };
}

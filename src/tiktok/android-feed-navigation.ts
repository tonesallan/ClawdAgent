export type TikTokFeedTabTarget =
  | 'current'
  | 'for_you'
  | 'following'
  | 'shop'
  | 'friends'
  | 'explore'
  | 'stem'
  | 'live'
  | 'custom';

export interface TikTokFeedNavigationConfig {
  target: TikTokFeedTabTarget;
  customLabel: string;
  strict: boolean;
  ensureBeforeEachAction: boolean;
}

export interface TikTokFeedTabCandidate {
  label: string;
  normalizedLabel: string;
  selected: boolean;
  checked: boolean;
  clickable: boolean;
  resourceId: string;
}

export interface TikTokFeedNavigationStatus {
  target: TikTokFeedTabTarget;
  requestedLabel: string;
  state:
    | 'current'
    | 'confirmed'
    | 'clicked'
    | 'unavailable'
    | 'error';
  lastCheckedAt: string | null;
  lastError: string | null;
}

const TAB_ALIASES: Record<
  Exclude<TikTokFeedTabTarget, 'current' | 'custom'>,
  string[]
> = {
  for_you: [
    'Para você',
    'Para voce',
    'For You',
  ],
  following: [
    'Seguindo',
    'Following',
  ],
  shop: [
    'Loja',
    'Shop',
    'TikTok Shop',
  ],
  friends: [
    'Amigos',
    'Friends',
  ],
  explore: [
    'Explorar',
    'Explore',
    'Descobrir',
    'Discover',
  ],
  stem: [
    'STEM',
  ],
  live: [
    'LIVE',
    'Ao vivo',
    'Ao Vivo',
  ],
};

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

function boolAttr(
  tag: string,
  name: string,
): boolean {
  return (
    attr(
      tag,
      name,
    )
      .toLocaleLowerCase(
        'en-US',
      ) ===
    'true'
  );
}

export function getTikTokFeedTabLabels(
  config:
    TikTokFeedNavigationConfig,
): string[] {
  if (
    config.target ===
      'current'
  ) {
    return [];
  }

  if (
    config.target ===
      'custom'
  ) {
    const custom =
      config.customLabel
        .trim();

    return custom
      ? [
          custom,
        ]
      : [];
  }

  return [
    ...TAB_ALIASES[
      config.target
    ],
  ];
}

export function getTikTokFeedTabDisplayName(
  config:
    TikTokFeedNavigationConfig,
): string {
  if (
    config.target ===
      'custom'
  ) {
    return (
      config.customLabel
        .trim() ||
      'Personalizada'
    );
  }

  const labels =
    getTikTokFeedTabLabels(
      config,
    );

  if (
    labels.length >
      0
  ) {
    return labels[0];
  }

  return 'Aba atual';
}

export function inspectTikTokFeedTabsFromXml(
  source: string,
): TikTokFeedTabCandidate[] {
  const tags =
    source.match(
      /<node\b[^>]*>/g,
    ) ??
    [];

  const candidates:
    TikTokFeedTabCandidate[] =
      [];

  for (
    const tag of
      tags
  ) {
    const text =
      attr(
        tag,
        'text',
      );

    const contentDescription =
      attr(
        tag,
        'content-desc',
      );

    const values =
      [
        text,
        contentDescription,
      ]
        .map(
          value =>
            value.trim(),
        )
        .filter(Boolean);

    if (
      values.length ===
        0
    ) {
      continue;
    }

    const label =
      values[0];

    candidates.push({
      label,
      normalizedLabel:
        normalize(
          label,
        ),
      selected:
        boolAttr(
          tag,
          'selected',
        ),
      checked:
        boolAttr(
          tag,
          'checked',
        ),
      clickable:
        boolAttr(
          tag,
          'clickable',
        ),
      resourceId:
        attr(
          tag,
          'resource-id',
        ),
    });

    if (
      values.length >
        1 &&
      normalize(
        values[1],
      ) !==
        normalize(
          label,
        )
    ) {
      candidates.push({
        label:
          values[1],
        normalizedLabel:
          normalize(
            values[1],
          ),
        selected:
          boolAttr(
            tag,
            'selected',
          ),
        checked:
          boolAttr(
            tag,
            'checked',
          ),
        clickable:
          boolAttr(
            tag,
            'clickable',
          ),
        resourceId:
          attr(
            tag,
            'resource-id',
          ),
      });
    }
  }

  return candidates;
}

export function findTikTokFeedTabCandidate(
  source: string,
  labels: string[],
): TikTokFeedTabCandidate | null {
  const wanted =
    new Set(
      labels
        .map(
          normalize,
        )
        .filter(Boolean),
    );

  if (
    wanted.size ===
      0
  ) {
    return null;
  }

  const candidates =
    inspectTikTokFeedTabsFromXml(
      source,
    );

  const exact =
    candidates
      .filter(
        candidate =>
          wanted.has(
            candidate
              .normalizedLabel,
          ),
      )
      .sort(
        (
          left,
          right,
        ) => {
          const leftScore =
            (
              left.selected ||
              left.checked
                ? 10
                : 0
            ) +
            (
              left.clickable
                ? 1
                : 0
            );

          const rightScore =
            (
              right.selected ||
              right.checked
                ? 10
                : 0
            ) +
            (
              right.clickable
                ? 1
                : 0
            );

          return (
            rightScore -
            leftScore
          );
        },
      );

  return (
    exact[0] ??
    null
  );
}

export function isTikTokFeedTabSelected(
  source: string,
  labels: string[],
): boolean {
  const candidate =
    findTikTokFeedTabCandidate(
      source,
      labels,
    );

  return Boolean(
    candidate &&
      (
        candidate.selected ||
        candidate.checked
      ),
  );
}

export function escapeTikTokUiSelectorText(
  value: string,
): string {
  return value
    .replace(
      /\\/g,
      '\\\\',
    )
    .replace(
      /"/g,
      '\\"',
    );
}

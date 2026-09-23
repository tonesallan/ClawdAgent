import {
  filterTikTokHashtagCandidates,
  normalizeTikTokHashtagList,
  type TikTokHashtagCandidate,
  type TikTokHashtagConfiguration,
} from './hashtag-policy.js';

export interface TikTokHashtagDiscoveryCandidate
  extends TikTokHashtagCandidate {

  source: 'android_xml';

  text: string | null;
  contentDescription: string | null;
  resourceId: string | null;
  className: string | null;
  bounds: string | null;

  fingerprint: string;
}

export interface TikTokHashtagDiscoveryResult {
  rawNodeCount: number;
  candidateCount: number;
  candidates: TikTokHashtagDiscoveryCandidate[];
}

function decodeXmlValue(
  value: string,
): string {

  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function getAttribute(
  node: string,
  attribute: string,
): string {

  const escaped =
    attribute.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );

  const match =
    node.match(
      new RegExp(
        `${escaped}="([^"]*)"`,
        'i',
      ),
    );

  return decodeXmlValue(
    match?.[1] ?? '',
  );
}

function nullable(
  value: string,
): string | null {

  const normalized =
    value.trim();

  return normalized
    ? normalized
    : null;
}

export function extractTikTokHashtagsFromText(
  value: string,
): string[] {

  const matches =
    value.match(
      /#[\p{L}\p{N}_]+/gu,
    ) ?? [];

  return normalizeTikTokHashtagList(
    matches,
  );
}

export function parseTikTokHashtagCandidatesFromXml(
  xml: string,
  maxRawCandidates = 100,
): TikTokHashtagDiscoveryResult {

  if (
    typeof xml !== 'string' ||
    xml.trim().length === 0
  ) {

    return {
      rawNodeCount: 0,
      candidateCount: 0,
      candidates: [],
    };
  }

  const nodes =
    xml.match(
      /<[^>]+>/g,
    ) ?? [];

  const candidates:
    TikTokHashtagDiscoveryCandidate[] = [];

  const fingerprints =
    new Set<string>();

  for (const node of nodes) {

    const text =
      getAttribute(
        node,
        'text',
      );

    const contentDescription =
      getAttribute(
        node,
        'content-desc',
      );

    const resourceId =
      getAttribute(
        node,
        'resource-id',
      );

    const className =
      getAttribute(
        node,
        'class',
      );

    const bounds =
      getAttribute(
        node,
        'bounds',
      );

    /*
     * Nunca considerar o proprio campo de busca.
     */
    if (
      resourceId.includes(
        'com.zhiliaoapp.musically:id/htb',
      ) ||
      className ===
        'android.widget.EditText'
    ) {
      continue;
    }

    const hashtags =
      normalizeTikTokHashtagList([
        ...extractTikTokHashtagsFromText(
          text,
        ),

        ...extractTikTokHashtagsFromText(
          contentDescription,
        ),
      ]);

    if (
      hashtags.length === 0
    ) {
      continue;
    }

    const fingerprint =
      [
        resourceId,
        bounds,
        text,
        contentDescription,
        hashtags.join(','),
      ].join('|');

    if (
      fingerprints.has(
        fingerprint,
      )
    ) {
      continue;
    }

    fingerprints.add(
      fingerprint,
    );

    candidates.push({
      source:
        'android_xml',

      text:
        nullable(text),

      contentDescription:
        nullable(
          contentDescription,
        ),

      resourceId:
        nullable(resourceId),

      className:
        nullable(className),

      bounds:
        nullable(bounds),

      hashtags,

      fingerprint,
    });

    if (
      candidates.length >=
      Math.max(
        1,
        maxRawCandidates,
      )
    ) {
      break;
    }
  }

  return {
    rawNodeCount:
      nodes.length,

    candidateCount:
      candidates.length,

    candidates,
  };
}

export function filterTikTokDiscoveredHashtagCandidates(
  candidates:
    TikTokHashtagDiscoveryCandidate[],

  configuration:
    TikTokHashtagConfiguration,
): TikTokHashtagDiscoveryCandidate[] {

  return filterTikTokHashtagCandidates(
    candidates,
    configuration,
  );
}
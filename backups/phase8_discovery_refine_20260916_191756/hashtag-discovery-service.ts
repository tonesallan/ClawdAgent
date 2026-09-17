import {
  filterTikTokHashtagCandidates,
  normalizeTikTokHashtagList,
  type TikTokHashtagCandidate,
  type TikTokHashtagConfiguration,
} from './hashtag-policy.js';

export interface TikTokHashtagDiscoveryCandidate
  extends TikTokHashtagCandidate {

  source:
    'android_xml';

  text:
    string | null;

  contentDescription:
    string | null;

  resourceId:
    string | null;

  className:
    string | null;

  bounds:
    string | null;

  fingerprint:
    string;
}

export interface TikTokHashtagDiscoveryResult {
  rawNodeCount:
    number;

  candidateCount:
    number;

  candidates:
    TikTokHashtagDiscoveryCandidate[];
}

interface ParsedBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function decodeCodePoint(
  match: string,
  value: string,
  radix: number,
): string {

  const codePoint =
    Number.parseInt(
      value,
      radix,
    );

  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff
  ) {
    return match;
  }

  try {

    return String.fromCodePoint(
      codePoint,
    );
  }
  catch {

    return match;
  }
}

function decodeXmlValue(
  value: string,
): string {

  /*
   * Decode numeric character references FIRST.
   *
   * Without this, XML such as:
   *
   *   &#128514;
   *
   * contains the substring "#128514", which can be
   * incorrectly interpreted as a hashtag.
   */
  return value
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        match,
        code: string,
      ) =>
        decodeCodePoint(
          match,
          code,
          16,
        ),
    )
    .replace(
      /&#(\d+);/g,
      (
        match,
        code: string,
      ) =>
        decodeCodePoint(
          match,
          code,
          10,
        ),
    )
    .replace(
      /&quot;/g,
      '"',
    )
    .replace(
      /&apos;/g,
      "'",
    )
    .replace(
      /&lt;/g,
      '<',
    )
    .replace(
      /&gt;/g,
      '>',
    )
    .replace(
      /&amp;/g,
      '&',
    );
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

function parseBounds(
  value: string,
): ParsedBounds | null {

  const match =
    value.match(
      /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/,
    );

  if (!match) {
    return null;
  }

  return {
    x1:
      Number(match[1]),

    y1:
      Number(match[2]),

    x2:
      Number(match[3]),

    y2:
      Number(match[4]),
  };
}

function getArea(
  bounds: ParsedBounds,
): number {

  return Math.max(
    0,
    bounds.x2 -
      bounds.x1,
  ) *
  Math.max(
    0,
    bounds.y2 -
      bounds.y1,
  );
}

function getIntersectionArea(
  first: ParsedBounds,
  second: ParsedBounds,
): number {

  const width =
    Math.max(
      0,

      Math.min(
        first.x2,
        second.x2,
      ) -
      Math.max(
        first.x1,
        second.x1,
      ),
    );

  const height =
    Math.max(
      0,

      Math.min(
        first.y2,
        second.y2,
      ) -
      Math.max(
        first.y1,
        second.y1,
      ),
    );

  return width * height;
}

function getHashtagSignature(
  hashtags: string[],
): string {

  return [
    ...hashtags,
  ]
    .sort()
    .join('|');
}

function visuallyRepresentsSameCandidate(
  first:
    TikTokHashtagDiscoveryCandidate,

  second:
    TikTokHashtagDiscoveryCandidate,
): boolean {

  if (
    getHashtagSignature(
      first.hashtags,
    ) !==
    getHashtagSignature(
      second.hashtags,
    )
  ) {
    return false;
  }

  if (
    !first.bounds ||
    !second.bounds
  ) {
    return false;
  }

  const firstBounds =
    parseBounds(
      first.bounds,
    );

  const secondBounds =
    parseBounds(
      second.bounds,
    );

  if (
    !firstBounds ||
    !secondBounds
  ) {
    return false;
  }

  const firstArea =
    getArea(
      firstBounds,
    );

  const secondArea =
    getArea(
      secondBounds,
    );

  const smallerArea =
    Math.min(
      firstArea,
      secondArea,
    );

  if (
    smallerArea <= 0
  ) {
    return false;
  }

  const intersection =
    getIntersectionArea(
      firstBounds,
      secondBounds,
    );

  /*
   * One TikTok card often exposes both:
   *
   * - a large user_video_view/vh0 container;
   * - a small desc node inside that same card.
   *
   * When both expose exactly the same hashtag set and the
   * smaller node is mostly contained by the larger one,
   * treat them as one logical candidate.
   */
  return (
    intersection /
    smallerArea
  ) >= 0.75;
}

function getCandidateQuality(
  candidate:
    TikTokHashtagDiscoveryCandidate,
): number {

  let score =
    0;

  if (
    candidate.resourceId?.endsWith(
      '/desc',
    )
  ) {
    score += 100;
  }

  if (candidate.text) {
    score += 30;
  }

  if (
    candidate.contentDescription
  ) {
    score += 10;
  }

  if (candidate.bounds) {
    score += 1;
  }

  return score;
}

export function extractTikTokHashtagsFromText(
  value: string,
): string[] {

  /*
   * At this stage XML character references have already been
   * decoded, so emoji entities can no longer masquerade as
   * numeric hashtags.
   */
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
      rawNodeCount:
        0,

      candidateCount:
        0,

      candidates:
        [],
    };
  }

  const nodes =
    xml.match(
      /<[^>]+>/g,
    ) ?? [];

  const candidates:
    TikTokHashtagDiscoveryCandidate[] = [];

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
     * Search field is UI chrome, not a discovery result.
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

    const candidate:
      TikTokHashtagDiscoveryCandidate = {

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

        fingerprint:
          [
            resourceId,
            bounds,
            text,
            contentDescription,
            hashtags.join(','),
          ].join('|'),
      };

    const duplicateIndex =
      candidates.findIndex(
        existing =>
          visuallyRepresentsSameCandidate(
            existing,
            candidate,
          ),
      );

    if (
      duplicateIndex >= 0
    ) {

      /*
       * Prefer the semantically specific description node over
       * a generic surrounding video container.
       */
      if (
        getCandidateQuality(
          candidate,
        ) >
        getCandidateQuality(
          candidates[
            duplicateIndex
          ]!,
        )
      ) {

        candidates[
          duplicateIndex
        ] =
          candidate;
      }

      continue;
    }

    candidates.push(
      candidate,
    );

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
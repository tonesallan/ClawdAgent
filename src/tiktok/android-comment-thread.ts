export interface TikTokBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TikTokVisibleComment {
  key: string;
  text: string;
  username: string | null;
  bounds: TikTokBounds;
  likeBounds: TikTokBounds | null;
}

interface XmlNode {
  className: string;
  text: string;
  contentDescription: string;
  resourceId: string;
  bounds: TikTokBounds | null;
}

function decodeXml(value: string): string {
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

function normalize(value: string): string {
  return decodeXml(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBounds(value: string | undefined): TikTokBounds | null {
  if (!value) return null;
  const match = value.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) return null;
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  };
}

function attr(tag: string, name: string): string {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escaped}="([^"]*)"`));
  return decodeXml(match?.[1] ?? '');
}

function parseNodes(source: string): XmlNode[] {
  return (source.match(/<[^>]+>/g) ?? [])
    .filter(tag => !tag.startsWith('</'))
    .map(tag => ({
      className: attr(tag, 'class'),
      text: attr(tag, 'text'),
      contentDescription: attr(tag, 'content-desc'),
      resourceId: attr(tag, 'resource-id'),
      bounds: parseBounds(attr(tag, 'bounds')),
    }));
}

function verticalCenter(bounds: TikTokBounds): number {
  return (bounds.top + bounds.bottom) / 2;
}

function horizontalCenter(bounds: TikTokBounds): number {
  return (bounds.left + bounds.right) / 2;
}

function looksLikeUiLabel(value: string): boolean {
  const normalized = normalize(value);
  if (!normalized || /^[\d.,]+[kmb]?$/i.test(normalized)) return true;

  const exact = new Set([
    'responder',
    'reply',
    'ver respostas',
    'view replies',
    'mais',
    'more',
    'comentarios',
    'comments',
    'adicionar comentario...',
    'add comment...',
    'enviar',
    'send',
    'curtir',
    'like',
    'curtido pelo criador',
    'liked by creator',
    'traduzir',
    'translate',
  ]);

  return exact.has(normalized) ||
    normalized.startsWith('ver mais ') ||
    normalized.startsWith('view more ');
}

function looksLikeCommentText(node: XmlNode): boolean {
  if (!node.bounds || !node.text) return false;
  const text = node.text.trim();
  if (text.length < 2 || text.length > 280) return false;
  if (/^@[A-Za-z0-9._]{2,24}$/.test(text)) return false;
  if (looksLikeUiLabel(text)) return false;

  const resource = node.resourceId.toLocaleLowerCase('pt-BR');
  if (
    resource.includes('input') ||
    resource.endsWith('/ejc') ||
    resource.endsWith('/d1u')
  ) return false;

  return true;
}

function looksLikeCommentLike(node: XmlNode): boolean {
  if (!node.bounds) return false;
  const value = normalize([node.text, node.contentDescription].join(' '));
  return value.includes('curtir comentario') ||
    value.includes('like comment') ||
    value.includes('curtidas no comentario') ||
    value.includes('likes on comment');
}

function simpleKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function extractVisibleTikTokCommentsFromXml(
  source: string,
): TikTokVisibleComment[] {
  const nodes = parseNodes(source);
  const commentNodes = nodes.filter(looksLikeCommentText);
  const likeNodes = nodes.filter(looksLikeCommentLike);
  const usernameNodes = nodes.filter(node =>
    Boolean(node.bounds && /^@[A-Za-z0-9._]{2,24}$/.test(node.text)));

  const maxRight = nodes.reduce(
    (current, node) => Math.max(current, node.bounds?.right ?? 0),
    0,
  );

  const comments: TikTokVisibleComment[] = [];
  const seen = new Set<string>();

  for (const node of commentNodes) {
    const bounds = node.bounds!;
    const centerY = verticalCenter(bounds);

    const usernameNode = usernameNodes
      .map(candidate => ({
        candidate,
        distance: Math.abs(verticalCenter(candidate.bounds!) - centerY),
      }))
      .filter(item => item.distance <= 110)
      .sort((left, right) => left.distance - right.distance)[0]
      ?.candidate;

    const likeNode = likeNodes
      .map(candidate => ({
        candidate,
        distance: Math.abs(verticalCenter(candidate.bounds!) - centerY),
      }))
      .filter(item =>
        item.distance <= 130 &&
        (maxRight <= 0 || horizontalCenter(item.candidate.bounds!) >= maxRight * 0.55))
      .sort((left, right) => left.distance - right.distance)[0]
      ?.candidate;

    const username = usernameNode?.text.replace(/^@/, '') ?? null;
    const key = simpleKey([username ?? '', normalize(node.text)].join('|'));
    if (seen.has(key)) continue;
    seen.add(key);

    comments.push({
      key,
      text: node.text,
      username,
      bounds,
      likeBounds: likeNode?.bounds ?? null,
    });
  }

  return comments.sort((left, right) => left.bounds.top - right.bounds.top);
}

export function centerOfTikTokBounds(
  bounds: TikTokBounds,
): { x: number; y: number } {
  return {
    x: Math.round((bounds.left + bounds.right) / 2),
    y: Math.round((bounds.top + bounds.bottom) / 2),
  };
}

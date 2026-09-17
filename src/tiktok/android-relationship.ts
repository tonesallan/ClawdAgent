export type TikTokRelationshipState =
  | 'friends'
  | 'following'
  | 'follows_us'
  | 'not_following'
  | 'unknown';

const RELATIONSHIP_RESOURCE_IDS = [
  'com.zhiliaoapp.musically:id/u68',
  'com.zhiliaoapp.musically:id/fm9',
];

export function classifyTikTokRelationshipFromXml(
  source: string,
): TikTokRelationshipState {
  const normalized =
    source.toLocaleLowerCase('pt-BR');

  const relationshipLines =
    source
      .split(/\r?\n/)
      .filter(line =>
        RELATIONSHIP_RESOURCE_IDS.some(
          resourceId =>
            line.includes(resourceId),
        ),
      );

  for (const line of relationshipLines) {
    const value =
      line.toLocaleLowerCase('pt-BR');

    if (
      value.includes('amigos') ||
      value.includes('friends')
    ) {
      return 'friends';
    }

    if (
      value.includes('seguindo') ||
      value.includes('following')
    ) {
      return 'following';
    }

    if (
      value.includes('seguir de volta') ||
      value.includes('follow back')
    ) {
      return 'follows_us';
    }

    if (
      /text="seguir"/i.test(line) ||
      /text="follow"/i.test(line)
    ) {
      return 'not_following';
    }
  }

  if (
    normalized.includes(
      'content-desc="seguir ',
    ) ||
    normalized.includes(
      'content-desc="follow ',
    )
  ) {
    return 'not_following';
  }

  return 'unknown';
}

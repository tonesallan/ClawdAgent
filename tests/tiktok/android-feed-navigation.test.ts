import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  findTikTokFeedTabCandidate,
  getTikTokFeedTabLabels,
  inspectTikTokFeedTabsFromXml,
  isTikTokFeedTabSelected,
  type TikTokFeedNavigationConfig,
} from '../../src/tiktok/android-feed-navigation.js';

const xml = `
<hierarchy>
  <node
    text="Seguindo"
    content-desc=""
    resource-id="feed_following"
    clickable="true"
    checked="false"
    selected="false"
  />
  <node
    text="Para você"
    content-desc=""
    resource-id="feed_for_you"
    clickable="true"
    checked="false"
    selected="true"
  />
  <node
    text=""
    content-desc="Loja"
    resource-id="feed_shop"
    clickable="true"
    checked="false"
    selected="false"
  />
</hierarchy>
`;

describe(
  'TikTok Android feed navigation',
  () => {
    it(
      'provides localized aliases for built-in feed tabs',
      () => {
        const config:
          TikTokFeedNavigationConfig =
            {
              target:
                'for_you',
              customLabel:
                '',
              strict:
                true,
              ensureBeforeEachAction:
                true,
            };

        expect(
          getTikTokFeedTabLabels(
            config,
          ),
        ).toContain(
          'Para você',
        );
      },
    );

    it(
      'detects the selected feed tab from Android XML',
      () => {
        expect(
          isTikTokFeedTabSelected(
            xml,
            [
              'Para você',
              'For You',
            ],
          ),
        ).toBe(true);

        expect(
          isTikTokFeedTabSelected(
            xml,
            [
              'Seguindo',
              'Following',
            ],
          ),
        ).toBe(false);
      },
    );

    it(
      'finds labels from text or content-desc',
      () => {
        const shop =
          findTikTokFeedTabCandidate(
            xml,
            [
              'Loja',
              'Shop',
            ],
          );

        expect(
          shop?.label,
        ).toBe(
          'Loja',
        );

        expect(
          inspectTikTokFeedTabsFromXml(
            xml,
          ).some(
            item =>
              item.label ===
              'Seguindo',
          ),
        ).toBe(true);
      },
    );

    it(
      'supports a custom exact label for regional/new tabs',
      () => {
        const config:
          TikTokFeedNavigationConfig =
            {
              target:
                'custom',
              customLabel:
                'Ofertas',
              strict:
                true,
              ensureBeforeEachAction:
                true,
            };

        expect(
          getTikTokFeedTabLabels(
            config,
          ),
        ).toEqual([
          'Ofertas',
        ]);
      },
    );
  },
);

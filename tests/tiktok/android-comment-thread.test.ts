import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  centerOfTikTokBounds,
  extractVisibleTikTokCommentsFromXml,
} from '../../src/tiktok/android-comment-thread.js';

describe(
  'TikTok Android comment thread parser',
  () => {
    const source = `
<hierarchy>
  <android.widget.TextView class="android.widget.TextView" text="@maria" content-desc="" resource-id="u1" bounds="[20,500][180,550]" />
  <android.widget.TextView class="android.widget.TextView" text="Maria Silva" content-desc="" resource-id="display1" bounds="[20,530][260,565]" />
  <android.widget.TextView class="android.widget.TextView" text="Sigo de volta todo mundo 💕" content-desc="" resource-id="c1" bounds="[20,555][760,620]" />
  <android.view.View class="android.view.View" text="" content-desc="Curtir comentário" resource-id="l1" bounds="[900,550][1040,630]" />
  <android.widget.TextView class="android.widget.TextView" text="@joao" content-desc="" resource-id="u2" bounds="[20,700][180,750]" />
  <android.widget.TextView class="android.widget.TextView" text="Apoiando por aqui" content-desc="" resource-id="c2" bounds="[20,755][760,820]" />
  <android.view.View class="android.view.View" text="" content-desc="Like comment" resource-id="l2" bounds="[900,750][1040,830]" />
  <android.widget.TextView class="android.widget.TextView" text="Responder" content-desc="" resource-id="reply" bounds="[20,830][140,870]" />
</hierarchy>
`;

    it(
      'extracts visible comments, usernames and nearby like controls',
      () => {
        const comments = extractVisibleTikTokCommentsFromXml(source);

        expect(
          comments.map(comment => comment.text),
        ).toEqual([
          'Sigo de volta todo mundo 💕',
          'Apoiando por aqui',
        ]);

        expect(comments[0]?.username).toBe('maria');
        expect(comments[0]?.likeBounds).toEqual({
          left: 900,
          top: 550,
          right: 1040,
          bottom: 630,
        });
      },
    );

    it(
      'returns the center of a like target',
      () => {
        expect(
          centerOfTikTokBounds({
            left: 900,
            top: 550,
            right: 1040,
            bottom: 630,
          }),
        ).toEqual({
          x: 970,
          y: 590,
        });
      },
    );
  },
);

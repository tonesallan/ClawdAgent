import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  extractTikTokVideoContextFromXml,
  hasMeaningfulTikTokVideoContext,
  tikTokVideoContextsMatch,
} from '../../src/tiktok/android-video-context.js';

describe(
  'TikTok Android video context',
  () => {
    const source = `
<hierarchy>
  <android.widget.TextView
    package="com.zhiliaoapp.musically"
    text="@ana.teste"
    content-desc=""
  />
  <android.widget.TextView
    package="com.zhiliaoapp.musically"
    text="Organizando minha cozinha com esse suporte #cozinha #organizacao"
    content-desc=""
  />
  <android.view.View
    package="com.zhiliaoapp.musically"
    text=""
    content-desc="Curtir vídeo 123"
  />
  <android.view.View
    package="com.zhiliaoapp.musically"
    text=""
    content-desc="Leia ou adicione comentários 10"
  />
</hierarchy>
`;

    it(
      'extracts creator caption and hashtags without treating controls as context',
      () => {
        const context =
          extractTikTokVideoContextFromXml(
            source,
          );

        expect(
          context.creatorUsername,
        ).toBe(
          'ana.teste',
        );

        expect(
          context.caption,
        ).toBe(
          'Organizando minha cozinha com esse suporte #cozinha #organizacao',
        );

        expect(
          context.hashtags,
        ).toEqual([
          'cozinha',
          'organizacao',
        ]);

        expect(
          hasMeaningfulTikTokVideoContext(
            context,
          ),
        ).toBe(true);
      },
    );

    it(
      'returns no meaningful context for control-only UI',
      () => {
        const context =
          extractTikTokVideoContextFromXml(
            `
<hierarchy>
  <android.view.View text="" content-desc="Curtir vídeo 123" />
  <android.view.View text="" content-desc="Compartilhar vídeo" />
  <android.widget.TextView text="123" content-desc="" />
</hierarchy>
`,
          );

        expect(
          hasMeaningfulTikTokVideoContext(
            context,
          ),
        ).toBe(false);
      },
    );

    it(
      'requires observable creator/caption agreement when returning from profile',
      () => {
        const before =
          extractTikTokVideoContextFromXml(
            source,
          );

        const same =
          extractTikTokVideoContextFromXml(
            source,
          );

        const other =
          extractTikTokVideoContextFromXml(
            source.replace(
              '@ana.teste',
              '@outra.conta',
            ),
          );

        expect(
          tikTokVideoContextsMatch(
            before,
            same,
          ),
        ).toBe(true);

        expect(
          tikTokVideoContextsMatch(
            before,
            other,
          ),
        ).toBe(false);
      },
    );
  },
);

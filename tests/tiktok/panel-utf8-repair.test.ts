import {
  spawnSync,
} from 'node:child_process';

import {
  describe,
  expect,
  it,
} from 'vitest';

describe(
  'standalone TikTok panel UTF-8 repair',
  () => {
    it(
      'repairs common mojibake without changing valid pt-BR text',
      () => {
        const script = [
          'import painel_tiktok as p',
          'c=p.TikTokBotPanel',
          'assert c._repair_mojibake_text("Natural, amigÃ¡vel e relevante") == "Natural, amigável e relevante"',
          'assert c._repair_mojibake_text("Sigo todos de volta ðŸ’•") == "Sigo todos de volta 💕"',
          'assert c._repair_mojibake_text("Comentários normais") == "Comentários normais"',
          'assert c._clean_special_comment_template("Comentários especiais: Sigo todos de volta 💕") == "Sigo todos de volta 💕"',
        ].join(';');

        const result =
          spawnSync(
            'python3',
            [
              '-c',
              script,
            ],
            {
              encoding:
                'utf8',
            },
          );

        expect(
          result.status,
          [
            result.stdout,
            result.stderr,
          ]
            .filter(Boolean)
            .join('\n'),
        ).toBe(0);
      },
    );
  },
);

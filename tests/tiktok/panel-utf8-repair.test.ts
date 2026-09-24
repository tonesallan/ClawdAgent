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
          'import tiktok_panel_text as p',
          'assert p.repair_mojibake_text("Natural, amigÃ¡vel e relevante") == "Natural, amigável e relevante"',
          'assert p.repair_mojibake_text("Sigo todos de volta ðŸ’•") == "Sigo todos de volta 💕"',
          'assert p.repair_mojibake_text("Apoiando por aqui âœ¨") == "Apoiando por aqui ✨"',
          'assert p.repair_mojibake_text("Comentários normais") == "Comentários normais"',
          'assert p.clean_special_comment_template("Comentários especiais: Sigo todos de volta 💕") == "Sigo todos de volta 💕"',
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

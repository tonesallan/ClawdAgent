import {
  spawnSync,
} from 'node:child_process';

import {
  describe,
  expect,
  it,
} from 'vitest';

describe(
  'standalone TikTok Python panel',
  () => {
    it(
      'compiles with Python syntax',
      () => {
        const result =
          spawnSync(
            'python3',
            [
              '-m',
              'py_compile',
              'painel_tiktok.py',
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

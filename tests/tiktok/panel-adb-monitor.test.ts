import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  expect,
  it,
} from 'vitest';

describe(
  'standalone TikTok panel ADB monitor',
  () => {
    it(
      'probes the local ADB server before invoking adb devices',
      () => {
        const panel =
          readFileSync(
            'painel_tiktok.py',
            'utf8',
          );

        expect(
          panel,
        ).toContain(
          'self._is_local_port_open("127.0.0.1", 5037)',
        );

        expect(
          panel,
        ).toContain(
          'self._adb_recovery_interval_seconds = 30.0',
        );

        expect(
          panel,
        ).toContain(
          'self.refresh_connections(force_adb_start=False)',
        );
      },
    );

    it(
      'suppresses adb daemon stdout and stderr during recovery',
      () => {
        const panel =
          readFileSync(
            'painel_tiktok.py',
            'utf8',
          );

        expect(
          panel,
        ).toContain(
          'stdout=subprocess.DEVNULL',
        );

        expect(
          panel,
        ).toContain(
          'stderr=subprocess.DEVNULL',
        );
      },
    );

    it(
      'allows manual refresh to force one recovery attempt',
      () => {
        const panel =
          readFileSync(
            'painel_tiktok.py',
            'utf8',
          );

        expect(
          panel,
        ).toContain(
          'command=lambda: self.refresh_connections(force_adb_start=True)',
        );

        expect(
          panel,
        ).toContain(
          'ADB offline • nova tentativa em',
        );
      },
    );
  },
);

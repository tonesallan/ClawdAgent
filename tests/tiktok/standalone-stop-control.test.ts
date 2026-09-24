import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  expect,
  it,
} from 'vitest';

describe(
  'standalone TikTok stop control',
  () => {
    it(
      'keeps STOP durable from launcher preflight through runner startup',
      () => {
        const launcher =
          readFileSync(
            'INICIAR_TIKTOK_BOT.ps1',
            'utf8',
          );

        const runner =
          readFileSync(
            'src/tiktok/standalone-bot-runner.ts',
            'utf8',
          );

        expect(
          launcher,
        ).toContain(
          'Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue',
        );

        expect(
          runner,
        ).toContain(
          "writeStatus(\n      'starting',",
        );

        expect(
          runner,
        ).toContain(
          'startupControlTimer =',
        );

        expect(
          runner,
        ).toContain(
          'stop requested during startup',
        );

        expect(
          runner,
        ).toContain(
          'stop requested before Android startup',
        );

        const preAgentSection =
          runner.slice(
            runner.indexOf(
              'const agent =',
            ),
            runner.indexOf(
              'let shuttingDown',
            ),
          );

        expect(
          preAgentSection,
        ).not.toContain(
          'rmSync(\n      stopPath',
        );
      },
    );

    it(
      'latches STOP in the panel and blocks commands that could overwrite it',
      () => {
        const panel =
          readFileSync(
            'painel_tiktok.py',
            'utf8',
          );

        expect(
          panel,
        ).toContain(
          'STOP_PATH = RUNTIME_DIR / "tiktok-bot.stop"',
        );

        expect(
          panel,
        ).toContain(
          'stop_temp.replace(STOP_PATH)',
        );

        expect(
          panel,
        ).toContain(
          'Comando ignorado durante a parada',
        );

        expect(
          panel,
        ).not.toContain(
          'iniciará automaticamente assim que o processo encerrar',
        );
      },
    );

    it(
      'records STOP before trusting a possibly stale stopped status',
      () => {
        const stopScript =
          readFileSync(
            'PARAR_TIKTOK_BOT.ps1',
            'utf8',
          );

        const setStopIndex =
          stopScript.indexOf(
            'Set-Content -LiteralPath $stopPath',
          );

        const stoppedStateIndex =
          stopScript.indexOf(
            'if ($status -and $status.state -eq "stopped")',
          );

        expect(
          setStopIndex,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          stoppedStateIndex,
        ).toBeGreaterThan(
          setStopIndex,
        );
      },
    );
  },
);

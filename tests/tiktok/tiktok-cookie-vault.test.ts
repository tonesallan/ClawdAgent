import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'fs';

import {
  tmpdir,
} from 'os';

import {
  join,
  resolve,
} from 'path';

import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  TikTokCookieVault,
} from '../../src/actions/browser/tiktok-cookie-vault.js';

import type {
  TikTokCookie,
} from '../../src/actions/browser/tiktok-cookies.js';

const tempDirs:
  string[] = [];

function createTempDir(): string {

  const dir =
    mkdtempSync(
      join(
        tmpdir(),
        'clawdagent-tiktok-vault-',
      ),
    );

  tempDirs.push(
    dir,
  );

  return dir;
}

function sampleCookies(): TikTokCookie[] {

  return [
    {
      name:
        'sessionid',
      value:
        'unit-test-session-secret-value',
      domain:
        '.tiktok.com',
      path:
        '/',
      httpOnly:
        true,
      secure:
        true,
      expires:
        2_000_000_000,
      sameSite:
        'Lax',
    },
    {
      name:
        'msToken',
      value:
        'unit-test-ms-token-secret-value',
      domain:
        '.tiktok.com',
      path:
        '/',
      httpOnly:
        false,
      secure:
        true,
      expires:
        2_000_000_000,
      sameSite:
        'Lax',
    },
  ];
}

afterEach(
  () => {
    for (
      const dir of
        tempDirs.splice(
          0,
        )
    ) {
      rmSync(
        dir,
        {
          recursive:
            true,
          force:
            true,
        },
      );
    }
  },
);

describe(
  'TikTokCookieVault',
  () => {
    it('round-trips cookies without storing plaintext values', () => {
      const dataDir =
        createTempDir();

      const vault =
        new TikTokCookieVault({
          dataDir,
          platform:
            'linux',
          encryptionKey:
            'unit-test-encryption-key',
        });

      const cookies =
        sampleCookies();

      const reference =
        vault.write(
          'web-account-1',
          cookies,
        );

      expect(
        reference,
      ).toBe(
        'vault:web-account-1',
      );

      const vaultPath =
        resolve(
          dataDir,
          'tiktok-cookie-vault',
          'web-account-1.json',
        );

      const raw =
        readFileSync(
          vaultPath,
          'utf-8',
        );

      expect(
        raw,
      ).not.toContain(
        'unit-test-session-secret-value',
      );

      expect(
        raw,
      ).not.toContain(
        'unit-test-ms-token-secret-value',
      );

      expect(
        JSON.parse(
          raw,
        ),
      ).toMatchObject({
        version:
          1,
        scheme:
          'aes-256-gcm',
      });

      expect(
        vault.read(
          'web-account-1',
        ),
      ).toEqual(
        cookies,
      );
    });

    it('fails authentication with the wrong AES key', () => {
      const dataDir =
        createTempDir();

      const writer =
        new TikTokCookieVault({
          dataDir,
          platform:
            'linux',
          encryptionKey:
            'correct-key',
        });

      writer.write(
        'web-account-1',
        sampleCookies(),
      );

      const reader =
        new TikTokCookieVault({
          dataDir,
          platform:
            'linux',
          encryptionKey:
            'wrong-key',
        });

      expect(
        () =>
          reader.read(
            'web-account-1',
          ),
      ).toThrow();
    });

    it('deletes the account secret file', () => {
      const dataDir =
        createTempDir();

      const vault =
        new TikTokCookieVault({
          dataDir,
          platform:
            'linux',
          encryptionKey:
            'unit-test-encryption-key',
        });

      vault.write(
        'web-account-1',
        sampleCookies(),
      );

      expect(
        vault.has(
          'web-account-1',
        ),
      ).toBe(
        true,
      );

      vault.delete(
        'web-account-1',
      );

      expect(
        vault.has(
          'web-account-1',
        ),
      ).toBe(
        false,
      );
    });
  },
);

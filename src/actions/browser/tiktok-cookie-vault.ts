import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';

import {
  resolve,
} from 'path';

import {
  spawnSync,
} from 'child_process';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

import type {
  TikTokCookie,
} from './tiktok-cookies.js';

type VaultScheme =
  | 'windows-dpapi'
  | 'aes-256-gcm';

interface BaseVaultRecord {
  version: 1;
  scheme: VaultScheme;
  payload: string;
}

interface DpapiVaultRecord
extends BaseVaultRecord {
  scheme:
    'windows-dpapi';
}

interface AesVaultRecord
extends BaseVaultRecord {
  scheme:
    'aes-256-gcm';
  iv: string;
  authTag: string;
}

type VaultRecord =
  | DpapiVaultRecord
  | AesVaultRecord;

export interface TikTokCookieVaultOptions {
  dataDir?: string;
  platform?: NodeJS.Platform;
  encryptionKey?: string;
}

const WINDOWS_DPAPI_PROTECT_SCRIPT =
  [
    "$inputText = [Console]::In.ReadToEnd()",
    "$bytes = [Text.Encoding]::UTF8.GetBytes($inputText)",
    "$protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Console]::Out.Write([Convert]::ToBase64String($protected))",
  ].join('; ');

const WINDOWS_DPAPI_UNPROTECT_SCRIPT =
  [
    "$inputText = [Console]::In.ReadToEnd().Trim()",
    "$bytes = [Convert]::FromBase64String($inputText)",
    "$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))",
  ].join('; ');

export class TikTokCookieVault {

  private readonly rootDir:
    string;

  private readonly platform:
    NodeJS.Platform;

  private readonly encryptionKey:
    string | undefined;

  constructor(
    options:
      TikTokCookieVaultOptions = {},
  ) {
    const dataDir =
      options.dataDir ??
      resolve(
        process.cwd(),
        'data',
      );

    this.rootDir =
      resolve(
        dataDir,
        'tiktok-cookie-vault',
      );

    this.platform =
      options.platform ??
      process.platform;

    this.encryptionKey =
      options.encryptionKey ??
      process.env
        .TIKTOK_COOKIE_ENCRYPTION_KEY;

    mkdirSync(
      this.rootDir,
      {
        recursive:
          true,
      },
    );
  }

  write(
    accountId: string,
    cookies: TikTokCookie[],
  ): string {

    const plaintext =
      JSON.stringify(
        cookies,
      );

    const record =
      this.platform ===
        'win32'
        ? this.protectWithDpapi(
            plaintext,
          )
        : this.protectWithAes(
            plaintext,
          );

    const path =
      this.getPath(
        accountId,
      );

    this.atomicWrite(
      path,
      JSON.stringify(
        record,
        null,
        2,
      ),
    );

    return this.getReference(
      accountId,
    );
  }

  read(
    accountId: string,
  ): TikTokCookie[] {

    const path =
      this.getPath(
        accountId,
      );

    if (!existsSync(path)) {
      return [];
    }

    const record =
      JSON.parse(
        readFileSync(
          path,
          'utf-8',
        ),
      ) as VaultRecord;

    if (
      record.version !==
        1
    ) {
      throw new Error(
        `Unsupported TikTok cookie vault version for account ${accountId}.`,
      );
    }

    let plaintext:
      string;

    if (
      record.scheme ===
        'windows-dpapi'
    ) {
      if (
        this.platform !==
          'win32'
      ) {
        throw new Error(
          'TikTok cookie vault uses Windows DPAPI and can only be decrypted by the same Windows user.',
        );
      }

      plaintext =
        this.unprotectWithDpapi(
          record.payload,
        );
    }
    else if (
      record.scheme ===
        'aes-256-gcm'
    ) {
      plaintext =
        this.unprotectWithAes(
          record,
        );
    }
    else {
      throw new Error(
        `Unsupported TikTok cookie vault scheme for account ${accountId}.`,
      );
    }

    const parsed =
      JSON.parse(
        plaintext,
      );

    if (
      !Array.isArray(
        parsed,
      )
    ) {
      throw new Error(
        `Invalid TikTok cookie vault payload for account ${accountId}.`,
      );
    }

    return parsed as
      TikTokCookie[];
  }

  has(
    accountId: string,
  ): boolean {

    return existsSync(
      this.getPath(
        accountId,
      ),
    );
  }

  delete(
    accountId: string,
  ): void {

    rmSync(
      this.getPath(
        accountId,
      ),
      {
        force:
          true,
      },
    );
  }

  getReference(
    accountId: string,
  ): string {

    return `vault:${this.safeAccountId(accountId)}`;
  }

  private getPath(
    accountId: string,
  ): string {

    return resolve(
      this.rootDir,
      `${this.safeAccountId(accountId)}.json`,
    );
  }

  private safeAccountId(
    accountId: string,
  ): string {

    return accountId
      .replace(
        /[^a-zA-Z0-9._-]/g,
        '_',
      );
  }

  private protectWithDpapi(
    plaintext: string,
  ): DpapiVaultRecord {

    const result =
      this.runPowerShell(
        WINDOWS_DPAPI_PROTECT_SCRIPT,
        plaintext,
      );

    return {
      version:
        1,
      scheme:
        'windows-dpapi',
      payload:
        result,
    };
  }

  private unprotectWithDpapi(
    payload: string,
  ): string {

    return this.runPowerShell(
      WINDOWS_DPAPI_UNPROTECT_SCRIPT,
      payload,
    );
  }

  private runPowerShell(
    script: string,
    input: string,
  ): string {

    const systemRoot =
      process.env.SystemRoot ??
      process.env.WINDIR;

    const absoluteWindowsPowerShell =
      systemRoot
        ? resolve(
            systemRoot,
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe',
          )
        : null;

    const candidates =
      [
        absoluteWindowsPowerShell,
        'powershell.exe',
        'pwsh.exe',
      ].filter(
        (
          value,
          index,
          values,
        ): value is string =>
          Boolean(value) &&
          values.indexOf(value) ===
            index,
      );

    const errors:
      string[] = [];

    for (
      const executable of
        candidates
    ) {
      if (
        executable.includes(
          '\\',
        ) &&
        !existsSync(
          executable,
        )
      ) {
        errors.push(
          `${executable}: file not found`,
        );
        continue;
      }

      const result =
        spawnSync(
          executable,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            script,
          ],
          {
            input,
            encoding:
              'utf-8',
            windowsHide:
              true,
            maxBuffer:
              4 * 1024 * 1024,
          },
        );

      if (
        result.error
      ) {
        errors.push(
          `${executable}: ${result.error.message}`,
        );
        continue;
      }

      const stdout =
        result.stdout
          ?.trim() ??
        '';

      if (
        result.status ===
          0 &&
        stdout
      ) {
        return stdout;
      }

      const stderr =
        result.stderr
          ?.trim() ??
        '';

      errors.push(
        `${executable}: ${stderr || `exit status ${result.status}`}`,
      );
    }

    throw new Error(
      `Windows DPAPI operation failed. Attempts: ${errors.join(' | ') || 'no PowerShell candidates available'}`,
    );
  }

  private protectWithAes(
    plaintext: string,
  ): AesVaultRecord {

    const key =
      this.getAesKey();

    const iv =
      randomBytes(
        12,
      );

    const cipher =
      createCipheriv(
        'aes-256-gcm',
        key,
        iv,
      );

    const encrypted =
      Buffer.concat([
        cipher.update(
          plaintext,
          'utf-8',
        ),
        cipher.final(),
      ]);

    const authTag =
      cipher.getAuthTag();

    return {
      version:
        1,
      scheme:
        'aes-256-gcm',
      payload:
        encrypted.toString(
          'base64',
        ),
      iv:
        iv.toString(
          'base64',
        ),
      authTag:
        authTag.toString(
          'base64',
        ),
    };
  }

  private unprotectWithAes(
    record: AesVaultRecord,
  ): string {

    const decipher =
      createDecipheriv(
        'aes-256-gcm',
        this.getAesKey(),
        Buffer.from(
          record.iv,
          'base64',
        ),
      );

    decipher.setAuthTag(
      Buffer.from(
        record.authTag,
        'base64',
      ),
    );

    return Buffer.concat([
      decipher.update(
        Buffer.from(
          record.payload,
          'base64',
        ),
      ),
      decipher.final(),
    ]).toString(
      'utf-8',
    );
  }

  private getAesKey(): Buffer {

    if (
      !this.encryptionKey
    ) {
      throw new Error(
        'TIKTOK_COOKIE_ENCRYPTION_KEY is required to store TikTok cookies securely on non-Windows systems.',
      );
    }

    return createHash(
      'sha256',
    )
      .update(
        this.encryptionKey,
        'utf-8',
      )
      .digest();
  }

  private atomicWrite(
    path: string,
    content: string,
  ): void {

    const temporaryPath =
      `${path}.tmp`;

    writeFileSync(
      temporaryPath,
      content,
      {
        encoding:
          'utf-8',
        mode:
          0o600,
      },
    );

    try {
      chmodSync(
        temporaryPath,
        0o600,
      );
    }
    catch {
      // Windows ACLs are enforced by the user profile/DPAPI boundary.
    }

    renameSync(
      temporaryPath,
      path,
    );

    try {
      chmodSync(
        path,
        0o600,
      );
    }
    catch {
      // Best effort on platforms without POSIX mode semantics.
    }
  }
}

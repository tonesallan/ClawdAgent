import {
  mkdirSync,
} from 'fs';

import {
  resolve,
} from 'path';

import {
  BrowserSessionManager,
} from '../actions/browser/session-manager.js';

import {
  TikTokAccountManager,
} from '../actions/browser/tiktok-manager.js';

export interface TikTokWebSessionPoolOptions {
  accountManager?: TikTokAccountManager;
  browserManager?: BrowserSessionManager;
  idleTimeoutMs?: number;
  profileRoot?: string;
}

export interface AcquireTikTokWebSessionInput {
  accountId: string;
  headed: boolean;
  contextOptions?: Record<string, unknown>;
}

export interface TikTokWebSessionLease {
  accountId: string;
  sessionId: string;
  page: any;
  reused: boolean;
  persistentProfileDir: string;
  cookieBootstrapApplied: boolean;
}

interface TikTokWebSessionEntry {
  accountId: string;
  sessionId: string;
  signature: string;
  persistentProfileDir: string;
  idleTimer:
    ReturnType<typeof setTimeout> | null;
}

const DEFAULT_IDLE_TIMEOUT_MS =
  5 * 60_000;

export class TikTokWebSessionPool {

  private readonly accountManager:
    TikTokAccountManager;

  private readonly browserManager:
    BrowserSessionManager;

  private readonly idleTimeoutMs:
    number;

  private readonly profileRoot:
    string;

  private readonly entries =
    new Map<
      string,
      TikTokWebSessionEntry
    >();

  constructor(
    options:
      TikTokWebSessionPoolOptions = {},
  ) {
    this.accountManager =
      options.accountManager ??
      TikTokAccountManager.getInstance();

    this.browserManager =
      options.browserManager ??
      BrowserSessionManager.getInstance();

    this.idleTimeoutMs =
      options.idleTimeoutMs ??
      DEFAULT_IDLE_TIMEOUT_MS;

    this.profileRoot =
      options.profileRoot ??
      resolve(
        process.cwd(),
        'data',
        'tiktok-web-profiles',
      );

    mkdirSync(
      this.profileRoot,
      {
        recursive:
          true,
      },
    );
  }

  async acquire(
    input: AcquireTikTokWebSessionInput,
  ): Promise<TikTokWebSessionLease> {

    const contextOptions =
      input.contextOptions ??
      {};

    const signature =
      JSON.stringify({
        headed:
          input.headed,
        contextOptions,
      });

    const existing =
      this.entries.get(
        input.accountId,
      );

    if (existing) {
      const page =
        this.browserManager.getPage(
          existing.sessionId,
        );

      if (
        page &&
        existing.signature ===
          signature
      ) {
        this.resetIdleTimer(
          existing,
        );

        return {
          accountId:
            input.accountId,
          sessionId:
            existing.sessionId,
          page,
          reused:
            true,
          persistentProfileDir:
            existing.persistentProfileDir,
          cookieBootstrapApplied:
            false,
        };
      }

      await this.close(
        input.accountId,
      );
    }

    const persistentProfileDir =
      this.getProfileDir(
        input.accountId,
      );

    mkdirSync(
      persistentProfileDir,
      {
        recursive:
          true,
      },
    );

    const session =
      await this.accountManager
        .launchSession(
          input.accountId,
          input.headed,
          contextOptions,
          persistentProfileDir,
        );

    const page =
      this.browserManager.getPage(
        session.sessionId,
      );

    if (!page) {
      await this.browserManager
        .closeSession(
          session.sessionId,
        )
        .catch(
          () => {},
        );

      throw new Error(
        'Persistent TikTok Web session has no Playwright page.',
      );
    }

    const entry:
      TikTokWebSessionEntry = {
        accountId:
          input.accountId,
        sessionId:
          session.sessionId,
        signature,
        persistentProfileDir,
        idleTimer:
          null,
      };

    this.entries.set(
      input.accountId,
      entry,
    );

    this.resetIdleTimer(
      entry,
    );

    return {
      accountId:
        input.accountId,
      sessionId:
        session.sessionId,
      page,
      reused:
        false,
      persistentProfileDir,
      cookieBootstrapApplied:
        session.cookieBootstrapApplied,
    };
  }

  release(
    accountId: string,
  ): void {

    const entry =
      this.entries.get(
        accountId,
      );

    if (!entry) {
      return;
    }

    this.resetIdleTimer(
      entry,
    );
  }

  async close(
    accountId: string,
  ): Promise<void> {

    const entry =
      this.entries.get(
        accountId,
      );

    if (!entry) {
      return;
    }

    this.entries.delete(
      accountId,
    );

    if (entry.idleTimer) {
      clearTimeout(
        entry.idleTimer,
      );

      entry.idleTimer =
        null;
    }

    await this.browserManager
      .closeSession(
        entry.sessionId,
      )
      .catch(
        () => {},
      );
  }

  async closeAll(): Promise<void> {

    for (
      const accountId of
        [
          ...this.entries.keys(),
        ]
    ) {
      await this.close(
        accountId,
      );
    }
  }

  has(
    accountId: string,
  ): boolean {

    const entry =
      this.entries.get(
        accountId,
      );

    if (!entry) {
      return false;
    }

    return Boolean(
      this.browserManager
        .getPage(
          entry.sessionId,
        ),
    );
  }

  getProfileDir(
    accountId: string,
  ): string {

    const safeAccountId =
      accountId.replace(
        /[^a-zA-Z0-9._-]/g,
        '_',
      );

    return resolve(
      this.profileRoot,
      safeAccountId,
    );
  }

  private resetIdleTimer(
    entry: TikTokWebSessionEntry,
  ): void {

    if (entry.idleTimer) {
      clearTimeout(
        entry.idleTimer,
      );
    }

    entry.idleTimer =
      setTimeout(
        () => {
          this.close(
            entry.accountId,
          ).catch(
            () => {},
          );
        },
        this.idleTimeoutMs,
      );

    entry.idleTimer.unref?.();
  }
}

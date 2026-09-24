import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  resolve,
} from 'node:path';

import type {
  TikTokCommentHistoryEntry,
} from './comment-policy.js';

interface TikTokCommentHistoryFile {
  version: 1;
  entries: TikTokCommentHistoryEntry[];
}

export class TikTokCommentHistoryStore {
  private readonly filePath: string;
  private entries: TikTokCommentHistoryEntry[] = [];

  constructor(
    filePath = resolve(
      process.cwd(),
      '.runtime',
      'tiktok-comment-history.json',
    ),
  ) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, 'utf8'),
      ) as Partial<TikTokCommentHistoryFile>;

      this.entries = Array.isArray(parsed.entries)
        ? parsed.entries
            .filter(entry =>
              entry &&
              typeof entry.timestamp === 'string' &&
              typeof entry.videoKey === 'string')
            .slice(-1500)
        : [];
    }
    catch {
      this.entries = [];
    }
  }

  list(limit = 100): TikTokCommentHistoryEntry[] {
    return this.entries
      .slice(-Math.max(1, Math.min(1500, Math.floor(limit))))
      .reverse()
      .map(entry => ({
        ...entry,
        metadata: entry.metadata ? { ...entry.metadata } : undefined,
      }));
  }

  async record(entry: TikTokCommentHistoryEntry): Promise<void> {
    const cutoff = Date.now() - 90 * 24 * 3_600_000;

    this.entries = [...this.entries, entry]
      .filter(item => {
        const timestamp = new Date(item.timestamp).getTime();
        return Number.isFinite(timestamp) && timestamp >= cutoff;
      })
      .slice(-1500);

    await mkdir(dirname(this.filePath), { recursive: true });

    const temp = `${this.filePath}.tmp`;
    const payload: TikTokCommentHistoryFile = {
      version: 1,
      entries: this.entries,
    };

    await writeFile(
      temp,
      JSON.stringify(payload, null, 2) + '\n',
      'utf8',
    );
    await rename(temp, this.filePath);
  }
}

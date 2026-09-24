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

export interface TikTokFollowSafetyConfig {
  enabled: boolean;
  maxPerHour: number;
  maxPer24Hours: number;
  maxPerSession: number;
  minIntervalMinutes: number;
  restrictionCooldownHours: number;
  stopOnRestriction: boolean;
  silentFailureThreshold: number;
}

export interface TikTokFollowSafetyRecord {
  timestamp: string;
  username: string;
}

export interface TikTokFollowSafetySnapshot {
  enabled: boolean;
  followsLastHour: number;
  followsLast24Hours: number;
  followsThisSession: number;
  maxPerHour: number;
  maxPer24Hours: number;
  maxPerSession: number;
  minIntervalMinutes: number;
  restrictedUntil: string | null;
  restrictionReason: string | null;
  consecutiveUnconfirmed: number;
  allowed: boolean;
  blockedReason: string | null;
  nextAllowedAt: string | null;
}

interface TikTokFollowSafetyFile {
  version: 1;
  follows: TikTokFollowSafetyRecord[];
  restrictedUntil: string | null;
  restrictionReason: string | null;
  consecutiveUnconfirmed: number;
}

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLocaleLowerCase('pt-BR')
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

export function detectTikTokFollowRestriction(
  pageSource: string,
): string | null {
  const text =
    normalizeText(
      pageSource,
    );

  const signals = [
    'following too fast',
    'follow too fast',
    'you are following too fast',
    'following too frequently',
    'limit reached',
    'unable to follow more people at this time',
    'try again later',
    'seguindo muito rapido',
    'seguindo rapido demais',
    'voce esta seguindo muito rapido',
    'limite atingido',
    'nao e possivel seguir mais pessoas no momento',
    'tente novamente mais tarde',
  ];

  const signal =
    signals.find(
      item =>
        text.includes(
          item,
        ),
    );

  return signal
    ? `TikTok follow restriction signal detected: ${signal}`
    : null;
}

export class TikTokFollowSafetyStore {
  private readonly filePath:
    string;

  private follows:
    TikTokFollowSafetyRecord[] =
      [];

  private restrictedUntil:
    string | null =
      null;

  private restrictionReason:
    string | null =
      null;

  private consecutiveUnconfirmed =
    0;

  constructor(
    filePath =
      resolve(
        process.cwd(),
        '.runtime',
        'tiktok-follow-safety.json',
      ),
  ) {
    this.filePath =
      filePath;
  }

  async load(): Promise<void> {
    try {
      const parsed =
        JSON.parse(
          await readFile(
            this.filePath,
            'utf8',
          ),
        ) as
          Partial<TikTokFollowSafetyFile>;

      this.follows =
        Array.isArray(
          parsed.follows,
        )
          ? parsed.follows
              .filter(
                item =>
                  item &&
                  typeof item.timestamp ===
                    'string' &&
                  typeof item.username ===
                    'string',
              )
          : [];

      this.restrictedUntil =
        typeof parsed
          .restrictedUntil ===
          'string'
          ? parsed.restrictedUntil
          : null;

      this.restrictionReason =
        typeof parsed
          .restrictionReason ===
          'string'
          ? parsed.restrictionReason
          : null;

      this.consecutiveUnconfirmed =
        Number.isInteger(
          parsed
            .consecutiveUnconfirmed,
        ) &&
        Number(
          parsed
            .consecutiveUnconfirmed,
        ) >=
          0
          ? Number(
              parsed
                .consecutiveUnconfirmed,
            )
          : 0;

      this.prune();
    }
    catch {
      this.follows =
        [];
      this.restrictedUntil =
        null;
      this.restrictionReason =
        null;
      this.consecutiveUnconfirmed =
        0;
    }
  }

  snapshot(
    config:
      TikTokFollowSafetyConfig,
    sessionStartedAt:
      string | null,
    now =
      new Date(),
  ): TikTokFollowSafetySnapshot {
    this.prune(
      now,
    );

    const nowMs =
      now.getTime();

    const hourStart =
      nowMs -
      60 *
        60_000;

    const dayStart =
      nowMs -
      24 *
        60 *
        60_000;

    const sessionStart =
      sessionStartedAt
        ? new Date(
            sessionStartedAt,
          ).getTime()
        : nowMs;

    const followsLastHour =
      this.follows.filter(
        item =>
          new Date(
            item.timestamp,
          ).getTime() >=
          hourStart,
      ).length;

    const followsLast24Hours =
      this.follows.filter(
        item =>
          new Date(
            item.timestamp,
          ).getTime() >=
          dayStart,
      ).length;

    const followsThisSession =
      this.follows.filter(
        item =>
          new Date(
            item.timestamp,
          ).getTime() >=
          sessionStart,
      ).length;

    const lastFollowAt =
      this.follows.length >
        0
        ? new Date(
            this.follows[
              this.follows.length -
                1
            ]
              .timestamp,
          ).getTime()
        : 0;

    const intervalUntil =
      lastFollowAt >
        0
        ? lastFollowAt +
          config
            .minIntervalMinutes *
            60_000
        : 0;

    const restrictedMs =
      this.restrictedUntil
        ? new Date(
            this.restrictedUntil,
          ).getTime()
        : 0;

    let blockedReason:
      string | null =
        null;

    let nextAllowedMs =
      intervalUntil >
        nowMs
        ? intervalUntil
        : 0;

    if (
      !config.enabled
    ) {
      return {
        enabled:
          false,
        followsLastHour,
        followsLast24Hours,
        followsThisSession,
        maxPerHour:
          config.maxPerHour,
        maxPer24Hours:
          config
            .maxPer24Hours,
        maxPerSession:
          config
            .maxPerSession,
        minIntervalMinutes:
          config
            .minIntervalMinutes,
        restrictedUntil:
          this.restrictedUntil,
        restrictionReason:
          this.restrictionReason,
        consecutiveUnconfirmed:
          this
            .consecutiveUnconfirmed,
        allowed:
          true,
        blockedReason:
          null,
        nextAllowedAt:
          nextAllowedMs >
            nowMs
            ? new Date(
                nextAllowedMs,
              ).toISOString()
            : null,
      };
    }

    if (
      restrictedMs >
      nowMs
    ) {
      blockedReason =
        `follow cooldown active until ${this.restrictedUntil}`;

      nextAllowedMs =
        Math.max(
          nextAllowedMs,
          restrictedMs,
        );
    }
    else if (
      followsLastHour >=
      config.maxPerHour
    ) {
      blockedReason =
        `follow hourly limit reached (${followsLastHour}/${config.maxPerHour})`;

      const oldestInHour =
        this.follows
          .filter(
            item =>
              new Date(
                item.timestamp,
              ).getTime() >=
              hourStart,
          )
          .map(
            item =>
              new Date(
                item.timestamp,
              ).getTime(),
          )
          .sort(
            (
              left,
              right,
            ) =>
              left -
              right,
          )[0];

      if (
        oldestInHour
      ) {
        nextAllowedMs =
          Math.max(
            nextAllowedMs,
            oldestInHour +
              60 *
                60_000,
          );
      }
    }
    else if (
      followsLast24Hours >=
      config
        .maxPer24Hours
    ) {
      blockedReason =
        `follow rolling 24h limit reached (${followsLast24Hours}/${config.maxPer24Hours})`;

      const oldestInDay =
        this.follows
          .filter(
            item =>
              new Date(
                item.timestamp,
              ).getTime() >=
              dayStart,
          )
          .map(
            item =>
              new Date(
                item.timestamp,
              ).getTime(),
          )
          .sort(
            (
              left,
              right,
            ) =>
              left -
              right,
          )[0];

      if (
        oldestInDay
      ) {
        nextAllowedMs =
          Math.max(
            nextAllowedMs,
            oldestInDay +
              24 *
                60 *
                60_000,
          );
      }
    }
    else if (
      followsThisSession >=
      config.maxPerSession
    ) {
      blockedReason =
        `follow session limit reached (${followsThisSession}/${config.maxPerSession})`;
    }
    else if (
      intervalUntil >
      nowMs
    ) {
      blockedReason =
        `minimum follow interval active (${config.minIntervalMinutes} min)`;
    }

    return {
      enabled:
        config.enabled,
      followsLastHour,
      followsLast24Hours,
      followsThisSession,
      maxPerHour:
        config.maxPerHour,
      maxPer24Hours:
        config
          .maxPer24Hours,
      maxPerSession:
        config.maxPerSession,
      minIntervalMinutes:
        config
          .minIntervalMinutes,
      restrictedUntil:
        restrictedMs >
          nowMs
          ? this.restrictedUntil
          : null,
      restrictionReason:
        restrictedMs >
          nowMs
          ? this.restrictionReason
          : null,
      consecutiveUnconfirmed:
        this
          .consecutiveUnconfirmed,
      allowed:
        blockedReason ===
          null,
      blockedReason,
      nextAllowedAt:
        nextAllowedMs >
          nowMs
          ? new Date(
              nextAllowedMs,
            ).toISOString()
          : null,
    };
  }

  async recordConfirmedFollow(
    username: string,
  ): Promise<void> {
    this.follows.push({
      timestamp:
        new Date()
          .toISOString(),
      username,
    });

    this.consecutiveUnconfirmed =
      0;

    await this.persist();
  }

  async recordExplicitRestriction(
    reason: string,
    cooldownHours: number,
  ): Promise<void> {
    this.restrictionReason =
      reason;

    this.restrictedUntil =
      new Date(
        Date.now() +
          cooldownHours *
            60 *
            60_000,
      ).toISOString();

    this.consecutiveUnconfirmed =
      0;

    await this.persist();
  }

  async recordUnconfirmedAttempt(
    config:
      TikTokFollowSafetyConfig,
    reason: string,
  ): Promise<boolean> {
    this.consecutiveUnconfirmed +=
      1;

    let activated =
      false;

    if (
      config
        .stopOnRestriction &&
      this.consecutiveUnconfirmed >=
        config
          .silentFailureThreshold
    ) {
      await this
        .recordExplicitRestriction(
          `Repeated unconfirmed follows: ${reason}`,
          config
            .restrictionCooldownHours,
        );

      activated =
        true;
    }
    else {
      await this.persist();
    }

    return activated;
  }

  async clearRestriction():
    Promise<void> {
    this.restrictedUntil =
      null;

    this.restrictionReason =
      null;

    this.consecutiveUnconfirmed =
      0;

    await this.persist();
  }

  private prune(
    now =
      new Date(),
  ): void {
    const cutoff =
      now.getTime() -
      30 *
        24 *
        60 *
        60_000;

    this.follows =
      this.follows.filter(
        item => {
          const time =
            new Date(
              item.timestamp,
            ).getTime();

          return (
            Number.isFinite(
              time,
            ) &&
            time >=
              cutoff
          );
        },
      );

    if (
      this.restrictedUntil
    ) {
      const restrictedMs =
        new Date(
          this.restrictedUntil,
        ).getTime();

      if (
        !Number.isFinite(
          restrictedMs,
        ) ||
        restrictedMs <=
          now.getTime()
      ) {
        this.restrictedUntil =
          null;
        this.restrictionReason =
          null;
      }
    }
  }

  private async persist():
    Promise<void> {
    this.prune();

    await mkdir(
      dirname(
        this.filePath,
      ),
      {
        recursive:
          true,
      },
    );

    const temp =
      `${this.filePath}.tmp`;

    const payload:
      TikTokFollowSafetyFile =
        {
          version:
            1,
          follows:
            this.follows,
          restrictedUntil:
            this.restrictedUntil,
          restrictionReason:
            this.restrictionReason,
          consecutiveUnconfirmed:
            this
              .consecutiveUnconfirmed,
        };

    await writeFile(
      temp,
      JSON.stringify(
        payload,
        null,
        2,
      ) +
        '\n',
      'utf8',
    );

    await rename(
      temp,
      this.filePath,
    );
  }
}

import {
  MobileAgent,
} from '../actions/mobile/mobile-agent.js';

import {
  TikTokProviderRegistry,
  tikTokProviderRegistry,
} from './provider-registry.js';

import type {
  TikTokProviderName,
} from './providers/tiktok-provider.js';

export interface TikTokProviderDescriptor {
  name: TikTokProviderName;
  label: string;
  mode:
    | 'read-only-core'
    | 'simulation';
  capabilities: {
    checkRelationship: boolean;
    follow: boolean;
    unfollow: boolean;
    like: boolean;
    comment: boolean;
    dm: boolean;
  };
}

export function describeTikTokProvider(
  name: TikTokProviderName,
): TikTokProviderDescriptor {

  if (name === 'web') {
    return {
      name,
      label:
        'Web / Playwright',
      mode:
        'read-only-core',
      capabilities: {
        checkRelationship:
          true,
        follow:
          false,
        unfollow:
          false,
        like:
          false,
        comment:
          false,
        dm:
          false,
      },
    };
  }

  if (name === 'android') {
    return {
      name,
      label:
        'Android / Appium',
      mode:
        'read-only-core',
      capabilities: {
        checkRelationship:
          true,
        follow:
          false,
        unfollow:
          false,
        like:
          false,
        comment:
          false,
        dm:
          false,
      },
    };
  }

  return {
    name,
    label:
      'Dry Run',
    mode:
      'simulation',
    capabilities: {
      checkRelationship:
        true,
      follow:
        false,
      unfollow:
        false,
      like:
        false,
      comment:
        false,
      dm:
        false,
    },
  };
}

export function getTikTokProviderControlStatus(
  registry:
    TikTokProviderRegistry =
      tikTokProviderRegistry,
) {
  const providers =
    registry
      .list()
      .map(
        describeTikTokProvider,
      );

  const mobileAgents =
    MobileAgent
      .listAgents()
      .filter(
        agent =>
          agent.app ===
          'tiktok',
      )
      .map(
        agent => ({
          id:
            agent.id,
          deviceId:
            agent.deviceId,
          state:
            agent.state,
          currentAction:
            agent.currentAction,
          lastError:
            agent.lastError,
          startedAt:
            agent.startedAt,
          lastAction:
            agent.lastAction,
          lastActionTime:
            agent.lastActionTime,
          stats:
            agent.stats,
          testMode:
            agent.config
              .testMode,
        }),
      );

  const activeMobileAgents =
    mobileAgents.filter(
      agent =>
        agent.state ===
          'running' ||
        agent.state ===
          'paused',
    );

  return {
    providers,
    registeredProviders:
      providers.map(
        provider =>
          provider.name,
      ),
    mobileProvider: {
      registered:
        providers.some(
          provider =>
            provider.name ===
            'android',
        ),
      active:
        activeMobileAgents.length >
        0,
      agentCount:
        mobileAgents.length,
      activeAgentCount:
        activeMobileAgents.length,
      mode:
        'android-appium' as const,
    },
    mobileAgents,
  };
}

export interface TikTokProviderRelationshipCheckInput {
  provider: string;
  accountKey?: string;
  username: string;
}

export async function checkTikTokProviderRelationship(
  input:
    TikTokProviderRelationshipCheckInput,
  registry:
    TikTokProviderRegistry =
      tikTokProviderRegistry,
) {

  const providerName =
    input.provider
      ?.trim() as
        TikTokProviderName;

  if (!providerName) {
    throw new Error(
      'provider is required',
    );
  }

  if (
    !registry.has(
      providerName,
    )
  ) {
    throw new Error(
      `TikTok provider is not registered: ${providerName}`,
    );
  }

  const cleanUsername =
    input.username
      ?.trim()
      .replace(
        /^@/,
        '',
      );

  if (!cleanUsername) {
    throw new Error(
      'username is required',
    );
  }

  const accountKey =
    input.accountKey
      ?.trim();

  const provider =
    registry.get(
      providerName,
    );

  return provider
    .checkRelationship({
      targetKey:
        `username:${cleanUsername.toLowerCase()}`,
      accountKey,
      username:
        cleanUsername,
    });
}

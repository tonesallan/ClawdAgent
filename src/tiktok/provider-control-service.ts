import {
  TikTokAccountManager,
} from '../actions/browser/tiktok-manager.js';

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
  accountManager:
    TikTokAccountManager =
      TikTokAccountManager.getInstance(),
) {

  const providers =
    registry
      .list()
      .map(
        describeTikTokProvider,
      );

  const accounts =
    accountManager
      .listAccounts()
      .map(
        account => ({
          id:
            account.id,
          name:
            account.name,
          handle:
            account.handle,
          status:
            account.status,
          lastVerified:
            account.lastVerified,
        }),
      );

  return {
    providers,
    registeredProviders:
      providers.map(
        provider =>
          provider.name,
      ),
    browserProvider: {
      registered:
        providers.some(
          provider =>
            provider.name ===
            'web',
        ),
      persistentProfiles:
        true,
      sessionReuse:
        true,
      challengePolicy:
        'unknown-retry' as const,
    },
    accounts,
  };
}

export interface TikTokProviderRelationshipCheckInput {
  provider: string;
  accountId?: string;
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

  const accountId =
    input.accountId
      ?.trim();

  if (
    providerName ===
      'web' &&
    !accountId
  ) {
    throw new Error(
      'accountId is required for the Web provider',
    );
  }

  const provider =
    registry.get(
      providerName,
    );

  return provider
    .checkRelationship({
      targetKey:
        `username:${cleanUsername.toLowerCase()}`,
      accountKey:
        accountId,
      username:
        cleanUsername,
    });
}

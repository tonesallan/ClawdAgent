import type {
  TikTokAutomationProvider,
  TikTokProviderName,
} from './providers/tiktok-provider.js';

export class TikTokProviderRegistry {

  private readonly providers =
    new Map<
      TikTokProviderName,
      TikTokAutomationProvider
    >();

  register(
    provider: TikTokAutomationProvider,
  ): void {

    this.providers.set(
      provider.name,
      provider,
    );
  }

  get(
    name: TikTokProviderName,
  ): TikTokAutomationProvider {

    const provider =
      this.providers.get(name);

    if (!provider) {
      throw new Error(
        `TikTok provider not registered: ${name}`,
      );
    }

    return provider;
  }

  has(
    name: TikTokProviderName,
  ): boolean {

    return this.providers.has(name);
  }

  list(): TikTokProviderName[] {

    return [
      ...this.providers.keys(),
    ];
  }
}

export const tikTokProviderRegistry =
  new TikTokProviderRegistry();
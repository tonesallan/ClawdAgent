import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  detectTikTokLiveFromXml,
} from '../../src/tiktok/android-live-detection.js';

describe(
  'TikTok Android LIVE detection',
  () => {
    it(
      'does not classify the top LIVE navigation tab as a live video',
      () => {
        const source = `
<hierarchy>
  <node text="LIVE" content-desc="" resource-id="top_live_tab" bounds="[20,90][160,180]" />
  <node text="Para você" content-desc="" resource-id="for_you" bounds="[200,90][420,180]" />
  <node text="@creator" content-desc="" resource-id="creator" bounds="[40,1800][300,1870]" />
</hierarchy>
`;

        expect(
          detectTikTokLiveFromXml(
            source,
          ).isLive,
        ).toBe(false);
      },
    );

    it(
      'detects a LIVE badge in the feed body',
      () => {
        const source = `
<hierarchy>
  <node text="Para você" content-desc="" resource-id="for_you" bounds="[200,90][420,180]" />
  <node text="LIVE" content-desc="" resource-id="live_badge" bounds="[70,520][190,590]" />
  <node text="@creator" content-desc="" resource-id="creator" bounds="[40,1800][300,1870]" />
</hierarchy>
`;

        const result =
          detectTikTokLiveFromXml(
            source,
          );

        expect(
          result.isLive,
        ).toBe(true);

        expect(
          result.reasons.join(
            ' ',
          ),
        ).toContain(
          'live badge',
        );
      },
    );

    it(
      'detects strong pt-BR live interaction signals',
      () => {
        const source = `
<hierarchy>
  <node text="" content-desc="Enviar presente" resource-id="gift" bounds="[800,1700][1020,1810]" />
</hierarchy>
`;

        expect(
          detectTikTokLiveFromXml(
            source,
          ).isLive,
        ).toBe(true);
      },
    );
  },
);

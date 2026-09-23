import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  containsExactTikTokUsername,
  extractTikTokProfileUsername,
  findTikTokProfileSearchCandidate,
  getTikTokProfileTapPoint,
  normalizeTikTokXmlText,
  parseTikTokXmlBounds,
  tikTokProfileSourceMatchesUsername,
} from '../../src/tiktok/android-profile-navigation.js';

const profileOpenedFixturePath = fileURLToPath(
  new URL(
    '../../work/phase6c1-evidence/profile-opened.xml',
    import.meta.url,
  ),
);

describe('TikTok Android profile navigation XML helpers', () => {
  it('ignores the search input and selects the exact username result', () => {
    const xml = [
      '<android.widget.EditText text="tiktok" resource-id="com.zhiliaoapp.musically:id/htb" clickable="true" bounds="[100,100][900,200]" />',
      '<android.widget.TextView text="@tiktok" resource-id="com.zhiliaoapp.musically:id/txt_desc" clickable="false" bounds="[180,500][700,560]" />',
    ].join('\n');

    const result = findTikTokProfileSearchCandidate(xml, '@tiktok');

    expect(result.candidate).not.toBeNull();
    expect(result.candidate?.resourceId).toBe(
      'com.zhiliaoapp.musically:id/txt_desc',
    );
    expect(result.candidate?.bounds).toEqual({
      x1: 180,
      y1: 500,
      x2: 700,
      y2: 560,
    });
    expect(result.mentions).toHaveLength(1);
  });

  it('accepts an exact username embedded in content-desc metadata', () => {
    const xml = '<android.widget.LinearLayout text="" content-desc="TikTok, @tiktok, official account" resource-id="result_row" clickable="true" bounds="[0,400][1080,620]" />';

    const result = findTikTokProfileSearchCandidate(xml, 'tiktok');

    expect(result.candidate?.resourceId).toBe('result_row');
    expect(result.candidate?.clickable).toBe(true);
  });

  it('does not confuse a longer username with the requested username', () => {
    expect(
      containsExactTikTokUsername('@tiktok2', 'tiktok'),
    ).toBe(false);

    const xml = '<android.widget.TextView text="@tiktok2" resource-id="txt_desc" clickable="true" bounds="[0,400][800,500]" />';
    const result = findTikTokProfileSearchCandidate(xml, 'tiktok');

    expect(result.candidate).toBeNull();
  });

  it('normalizes directional Unicode marks used by Android UI dumps', () => {
    expect(normalizeTikTokXmlText('\u200e@TikTok\u200f')).toBe('tiktok');
    expect(
      containsExactTikTokUsername('\u2066Conta @TikTok\u2069', 'tiktok'),
    ).toBe(true);
  });

  it('prefers the same high-confidence candidate signals used by the current flow', () => {
    const xml = [
      '<android.widget.LinearLayout text="@tiktok" resource-id="generic_row" clickable="true" bounds="[0,400][1080,620]" />',
      '<android.widget.TextView text="@tiktok" resource-id="com.zhiliaoapp.musically:id/txt_desc" clickable="false" bounds="[180,500][700,560]" />',
    ].join('\n');

    const result = findTikTokProfileSearchCandidate(xml, 'tiktok');

    expect(result.candidate?.resourceId).toBe(
      'com.zhiliaoapp.musically:id/txt_desc',
    );
    expect(result.candidate?.score).toBeGreaterThan(0);
  });

  it('parses TikTok XML bounds safely', () => {
    expect(
      parseTikTokXmlBounds('bounds="[137,116][947,215]"'),
    ).toEqual({
      x1: 137,
      y1: 116,
      x2: 947,
      y2: 215,
    });

    expect(parseTikTokXmlBounds('text="no bounds"')).toBeNull();
  });

  it('uses the exact username bounds instead of the screen center for the tap', () => {
    const tapPoint = getTikTokProfileTapPoint(
      {
        x1: 236,
        y1: 400,
        x2: 351,
        y2: 452,
      },
      1080,
    );

    expect(tapPoint).toEqual({
      x: 294,
      y: 426,
    });
    expect(tapPoint.x).not.toBe(540);
  });

  it('keeps the username tap inside the configured horizontal safety margin', () => {
    expect(
      getTikTokProfileTapPoint(
        {
          x1: 0,
          y1: 400,
          x2: 80,
          y2: 452,
        },
        1080,
      ),
    ).toEqual({
      x: 120,
      y: 426,
    });

    expect(
      getTikTokProfileTapPoint(
        {
          x1: 1030,
          y1: 400,
          x2: 1080,
          y2: 452,
        },
        1080,
      ),
    ).toEqual({
      x: 960,
      y: 426,
    });
  });

  it('extracts exact username from the mapped Android profile username control', () => {
    const profile = [
      '<android.widget.Button text="@tonesallan" resource-id="com.zhiliaoapp.musically:id/t1b" />',
      '<android.widget.TextView text="Tones Allan" resource-id="profile-title" />',
    ].join('\n');

    expect(
      extractTikTokProfileUsername(
        profile,
      ),
    ).toBe(
      'tonesallan',
    );
  });

  it('extracts username from the real opened-profile fixture', () => {
    const profileSource =
      readFileSync(
        profileOpenedFixturePath,
        'utf8',
      );

    expect(
      extractTikTokProfileUsername(
        profileSource,
      ),
    ).toBe(
      'tiktok',
    );
  });

  it('does not treat display names as profile usernames', () => {
    const profile =
      '<android.widget.Button text="TikTok" resource-id="com.zhiliaoapp.musically:id/title" />';

    expect(
      extractTikTokProfileUsername(
        profile,
      ),
    ).toBeNull();
  });

  it('confirms exact profile identity without matching similar usernames', () => {
    const profile = [
      '<android.widget.Button text="TikTok" />',
      '<android.widget.Button text="@tiktok " resource-id="com.zhiliaoapp.musically:id/t1b" />',
    ].join('\n');

    expect(
      tikTokProfileSourceMatchesUsername(profile, 'tiktok'),
    ).toBe(true);
    expect(
      tikTokProfileSourceMatchesUsername(profile, 'tiktok2'),
    ).toBe(false);
  });

  it('confirms the username from the real Phase 6C.1 opened-profile dump', () => {
    const profileSource = readFileSync(
      profileOpenedFixturePath,
      'utf8',
    );

    expect(
      tikTokProfileSourceMatchesUsername(
        profileSource,
        'tiktok',
      ),
    ).toBe(true);

    expect(
      tikTokProfileSourceMatchesUsername(
        profileSource,
        'tiktok2',
      ),
    ).toBe(false);
  });
});

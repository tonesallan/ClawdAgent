import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyTikTokRelationshipFromXml,
  confirmTikTokFollowTransition,
  hasTikTokActionableFollowControl,
} from '../../src/tiktok/android-relationship.js';

const profileOpenedFixturePath =
  fileURLToPath(
    new URL(
      '../../work/phase6c1-evidence/profile-opened.xml',
      import.meta.url,
    ),
  );

describe(
  'TikTok Android relationship XML classifier',
  () => {
    it('classifies friends from mapped relationship controls', () => {
      const xml = [
        '<android.widget.TextView text="Amigos" resource-id="com.zhiliaoapp.musically:id/u68" />',
        '<android.widget.TextView text="Friends" resource-id="com.zhiliaoapp.musically:id/u68" />',
      ];

      for (const source of xml) {
        expect(
          classifyTikTokRelationshipFromXml(
            source,
          ),
        ).toBe('friends');
      }
    });

    it('classifies following from mapped relationship controls', () => {
      const xml = [
        '<android.widget.TextView text="Seguindo" resource-id="com.zhiliaoapp.musically:id/u68" />',
        '<android.widget.TextView text="Following" resource-id="com.zhiliaoapp.musically:id/fm9" />',
      ];

      for (const source of xml) {
        expect(
          classifyTikTokRelationshipFromXml(
            source,
          ),
        ).toBe('following');
      }
    });

    it('ignores the profile statistics label t54 as relationship evidence', () => {
      const xml =
        '<android.widget.TextView text="Seguindo" resource-id="com.zhiliaoapp.musically:id/t54" />';

      expect(
        classifyTikTokRelationshipFromXml(
          xml,
        ),
      ).toBe(
        'unknown',
      );
    });

    it('detects only actionable mapped Follow controls', () => {
      expect(
        hasTikTokActionableFollowControl(
          '<android.widget.TextView text="Seguir" resource-id="com.zhiliaoapp.musically:id/fm9" />',
        ),
      ).toBe(
        true,
      );

      expect(
        hasTikTokActionableFollowControl(
          '<android.widget.TextView text="Mensagem" resource-id="com.zhiliaoapp.musically:id/fm9" />',
        ),
      ).toBe(
        false,
      );

      expect(
        hasTikTokActionableFollowControl(
          '<android.widget.TextView text="Seguindo" resource-id="com.zhiliaoapp.musically:id/t54" />',
        ),
      ).toBe(
        false,
      );
    });

    it('confirms not_following -> following when the exact profile no longer exposes Follow', () => {
      const after = [
        '<android.widget.Button text="@candidate" resource-id="com.zhiliaoapp.musically:id/t1b" />',
        '<android.widget.TextView text="Mensagem" resource-id="com.zhiliaoapp.musically:id/fm9" />',
        '<android.widget.TextView text="Seguindo" resource-id="com.zhiliaoapp.musically:id/t54" />',
      ].join('\n');

      expect(
        confirmTikTokFollowTransition(
          'not_following',
          after,
        ),
      ).toBe(
        'following',
      );
    });

    it('confirms follows_us -> friends when Follow back disappears', () => {
      const after = [
        '<android.widget.Button text="@candidate" resource-id="com.zhiliaoapp.musically:id/t1b" />',
        '<android.widget.TextView text="Mensagem" resource-id="com.zhiliaoapp.musically:id/fm9" />',
      ].join('\n');

      expect(
        confirmTikTokFollowTransition(
          'follows_us',
          after,
        ),
      ).toBe(
        'friends',
      );
    });

    it('does not confirm Follow while the mapped Follow control is still present', () => {
      const after =
        '<android.widget.TextView text="Seguir" resource-id="com.zhiliaoapp.musically:id/fm9" />';

      expect(
        confirmTikTokFollowTransition(
          'not_following',
          after,
        ),
      ).toBe(
        'unknown',
      );
    });

    it('classifies follows_us from follow-back controls', () => {
      const xml = [
        '<android.widget.TextView text="Seguir de volta" resource-id="com.zhiliaoapp.musically:id/u68" />',
        '<android.widget.TextView text="Follow back" resource-id="com.zhiliaoapp.musically:id/fm9" />',
      ];

      for (const source of xml) {
        expect(
          classifyTikTokRelationshipFromXml(
            source,
          ),
        ).toBe('follows_us');
      }
    });

    it('classifies not_following from exact follow button text', () => {
      const xml = [
        '<android.widget.TextView text="Seguir" resource-id="com.zhiliaoapp.musically:id/fm9" />',
        '<android.widget.TextView text="Follow" resource-id="com.zhiliaoapp.musically:id/u68" />',
      ];

      for (const source of xml) {
        expect(
          classifyTikTokRelationshipFromXml(
            source,
          ),
        ).toBe('not_following');
      }
    });

    it('classifies not_following from the profile accessibility fallback', () => {
      const xml = [
        '<android.widget.Button text="" content-desc="Seguir Nome da Conta" resource-id="other-id" />',
        '<android.widget.Button text="" content-desc="Follow Account Name" resource-id="other-id" />',
      ];

      for (const source of xml) {
        expect(
          classifyTikTokRelationshipFromXml(
            source,
          ),
        ).toBe('not_following');
      }
    });

    it('keeps unrelated friends labels outside mapped controls as unknown', () => {
      const xml = [
        '<android.widget.TextView text="Amigos" resource-id="com.zhiliaoapp.musically:id/y4z" />',
        '<android.widget.FrameLayout content-desc="Amigos" resource-id="com.zhiliaoapp.musically:id/olv" />',
      ].join('\n');

      expect(
        classifyTikTokRelationshipFromXml(
          xml,
        ),
      ).toBe('unknown');
    });

    it('returns unknown when there is not enough relationship evidence', () => {
      const xml =
        '<android.widget.TextView text="TikTok" resource-id="profile-title" />';

      expect(
        classifyTikTokRelationshipFromXml(
          xml,
        ),
      ).toBe('unknown');
    });

    it('classifies the real Phase 6C.1 opened-profile dump as not_following', () => {
      const profileSource =
        readFileSync(
          profileOpenedFixturePath,
          'utf8',
        );

      expect(
        classifyTikTokRelationshipFromXml(
          profileSource,
        ),
      ).toBe('not_following');
    });

    it('preserves relationship precedence before plain follow text', () => {
      const xml =
        '<android.widget.TextView text="Follow back" resource-id="com.zhiliaoapp.musically:id/fm9" />';

      expect(
        classifyTikTokRelationshipFromXml(
          xml,
        ),
      ).toBe('follows_us');
    });
  },
);

// The menu demos: valid scenes, with nothing silently ignored.
import { describe, expect, it } from 'vitest';
import { legacyStyle, sceneFonts, validateScene, type SceneV1 } from '@svertik/engine';
import { DEMOS } from './demo-catalog';


describe('demos', () => {
  for (const { which: name, create: make } of DEMOS) {
    it(`${name}: sin errores ni avisos`, () => {
      expect(validateScene(make().scene)).toEqual({ errors: [], warnings: [] });
    });
  }

  it('demos no longer use JetBrains Mono', () => {
    for (const { create } of DEMOS) {
      for (const font of sceneFonts(create().scene as SceneV1)) expect(font.family).not.toMatch(/^JetBrains Mono/);
    }
  });

  it('none uses legacy font names (with the style inside the name)', () => {
    // "JetBrains Mono Bold" only exists in the editor: the Play page and the exported code download
    // the font by its family, and that one does not exist. With the weight, it does.
    for (const { which: name, create: make } of DEMOS) {
      for (const font of sceneFonts(make().scene as SceneV1)) expect(legacyStyle(font.family), `${name}: ${font.family}`).toBeNull();
    }
  });
});

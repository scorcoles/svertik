// Las demos del menú: escenas válidas, sin nada que se ignore en silencio.
import { describe, expect, it } from 'vitest';
import { validateScene } from '@svertik/engine';
import { demoProject, orbitProject, reelProject, shatterProject } from './demo';

describe('demos', () => {
  for (const [name, make] of [['intro', demoProject], ['shatter', shatterProject], ['reel', reelProject], ['orbit', orbitProject]] as const) {
    it(`${name}: sin errores ni avisos`, () => {
      expect(validateScene(make().scene)).toEqual({ errors: [], warnings: [] });
    });
  }
});

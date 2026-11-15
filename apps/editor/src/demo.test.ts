// Las demos del menú: escenas válidas, sin nada que se ignore en silencio.
import { describe, expect, it } from 'vitest';
import { legacyStyle, sceneFonts, validateScene, type SceneV1 } from '@svertik/engine';
import { DEMOS } from './demo-catalog';


describe('demos', () => {
  for (const { which: name, create: make } of DEMOS) {
    it(`${name}: sin errores ni avisos`, () => {
      expect(validateScene(make().scene)).toEqual({ errors: [], warnings: [] });
    });
  }

  it('ninguna usa nombres de fuente antiguos (con el estilo dentro del nombre)', () => {
    // «JetBrains Mono Bold» solo existe en el editor: en la página Play y en el código exportado la
    // fuente se baja por su familia, y esa no existe. Con el peso, sí.
    for (const { which: name, create: make } of DEMOS) {
      for (const font of sceneFonts(make().scene as SceneV1)) expect(legacyStyle(font.family), `${name}: ${font.family}`).toBeNull();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { BOOT_STAGES } from './boot';

describe('boot', () => {
  it('loads the chunks in stages', () => {
    // Etapas del arranque: core, engine, UI, effects… Cada una su chunk asíncrono, en orden.
    expect(BOOT_STAGES.map((s) => s.id)).toEqual(['core', 'engine', 'ui', 'effects']);
    expect(BOOT_STAGES.map((s) => s.label)).toEqual(['Loading Core', 'Loading Engine', 'Loading UI', 'Loading Effects']);
  });

  it('every stage loads its chunk', async () => {
    for (const stage of BOOT_STAGES) {
      await stage.run();
    }
  });
});

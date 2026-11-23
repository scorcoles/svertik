import { describe, expect, it } from 'vitest';
import { BOOT_STAGES } from './boot';

describe('boot', () => {
  it('loads the chunks in stages', () => {
    // Startup stages: core, engine, UI, effects… Each its own async chunk, in order.
    expect(BOOT_STAGES.map((s) => s.id)).toEqual(['core', 'engine', 'ui', 'effects']);
    expect(BOOT_STAGES.map((s) => s.label)).toEqual(['Loading Core', 'Loading Engine', 'Loading UI', 'Loading Effects']);
  });

  it('every stage loads its chunk', async () => {
    for (const stage of BOOT_STAGES) {
      await stage.run();
    }
  }, 20_000);
});

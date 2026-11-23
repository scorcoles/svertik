import { describe, expect, it, vi } from 'vitest';
import { createFpsMeter } from './fpsmeter';

describe('debug panel', () => {
  it('lists every scene variable it is given, and the custom ones', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const host = document.createElement('div');
      const meter = createFpsMeter(host, true);
      meter.variables({ time: 1.5, width: 900, height: 1400, 'mouse.posX': 12, 'mouse.downMs': 250 }, { dots: 7 });
      const text = host.querySelector('pre')!.textContent!;
      for (const line of ['scene.time', 'scene.width', 'scene.height', 'scene.mouse.posX', 'scene.mouse.downMs', 'scene.custom.dots']) expect(text).toContain(line);
      expect(text).toMatch(/scene\.mouse\.posX\s+12/);
      // a new value (the pointer moved within the same frame) is drawn too
      meter.variables({ time: 1.5, width: 900, height: 1400, 'mouse.posX': 99, 'mouse.downMs': 250 }, { dots: 7 });
      expect(host.querySelector('pre')!.textContent).toMatch(/scene\.mouse\.posX\s+99/);
      meter.stop();
    } finally { vi.unstubAllGlobals(); }
  });

  it('says whether it is visible, following toggle', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const meter = createFpsMeter(document.createElement('div'));
      expect(meter.visible()).toBe(false);
      meter.toggle();
      expect(meter.visible()).toBe(true);
      meter.toggle(false);
      expect(meter.visible()).toBe(false);
      meter.stop();
    } finally { vi.unstubAllGlobals(); }
  });
});

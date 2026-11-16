// Debug overlay for Play: performance metrics and the live scene expression context.
// It is shown with D or ?debug in the URL.

export interface FpsMeter {
  /** Un fotograma calculado por el reproductor, con lo que tardó. */
  frame(ms: number): void;
  variables(scene: Record<string, number>, custom: Record<string, number>): void;
  toggle(on?: boolean): void;
  stop(): void;
}

export function createFpsMeter(parent: HTMLElement, on = false): FpsMeter {
  const el = document.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    left: '12px',
    top: '12px',
    zIndex: '200',
    margin: '0',
    padding: '6px 8px',
    font: '11px/1.5 ui-monospace, "JetBrains Mono", monospace',
    color: '#ededed',
    background: 'rgb(0 0 0 / 0.5)', // overlay.ink (literal: the player page has no tokens)
    pointerEvents: 'none',
    whiteSpace: 'pre',
    maxHeight: '75vh',
    overflow: 'hidden auto',
  });
  el.hidden = !on;
  parent.append(el);

  let screen = 0, computed = 0, sum = 0, worst = 0, last = performance.now();
  let performanceText = '', variablesText = '';
  const render = () => { el.textContent = [performanceText, variablesText].filter(Boolean).join('\n\n'); };
  let raf = requestAnimationFrame(function tick(now) {
    screen++;
    if (now - last >= 1000) {
      const s = (now - last) / 1000;
      const avg = computed ? sum / computed : 0;
      // Lo que podría dar si solo dependiera del cálculo (sin contar lo que tarda el navegador en pintar).
      const budget = avg ? Math.min(999, Math.round(1000 / avg)) : 0;
      performanceText = [
        `screen   ${Math.round(screen / s)} fps`,
        `computed ${Math.round(computed / s)} fps`,
        `frame    ${avg.toFixed(1)} ms avg · ${worst.toFixed(1)} ms worst`,
        `engine   could do ~${budget} fps`,
      ].join('\n');
      render();
      el.style.color = avg > 33 ? 'var(--sv-signal-error)' : avg > 16 ? 'var(--sv-signal-warning)' : 'var(--sv-text-primary)';
      screen = computed = sum = worst = 0;
      last = now;
    }
    raf = requestAnimationFrame(tick);
  });

  return {
    frame(ms) {
      computed++;
      sum += ms;
      worst = Math.max(worst, ms);
    },
    variables(scene, custom) {
      const format = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
      const sceneLines = Object.entries(scene).map(([key, value]) => `scene.${key.padEnd(14)} ${format(value)}`);
      const customLines = Object.entries(custom).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `scene.custom.${key} ${format(value)}`);
      variablesText = ['Scene', ...sceneLines, ...(customLines.length ? ['', 'Custom', ...customLines] : [])].join('\n');
      render();
    },
    toggle(v = el.hidden) {
      el.hidden = !v;
    },
    stop() {
      cancelAnimationFrame(raf);
      el.remove();
    },
  };
}

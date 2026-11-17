// Debug overlay for Play: performance metrics and the live scene expression context.
// It is shown with D or ?debug in the URL.

export interface FpsMeter {
  /** Un fotograma calculado por el reproductor, con lo que tardó. */
  frame(ms: number): void;
  variables(scene: Record<string, number>, custom: Record<string, number>): void;
  /** What painted the last frame, and the renderer chosen (shown, and selectable when `onRenderer` is given). */
  renderer(painted: 'svg' | 'canvas', chosen: RendererChoice): void;
  /** Whether Wire is on (underlines its button). */
  wire(on: boolean): void;
  toggle(on?: boolean): void;
  /** Is the panel showing? (a player only needs to track the pointer while it is) */
  visible(): boolean;
  stop(): void;
}

export type RendererChoice = 'auto' | 'svg' | 'canvas';

export interface FpsMeterOptions {
  /** Switch the player's renderer from the panel (Auto / SVG / Canvas buttons). */
  onRenderer?: (renderer: RendererChoice) => void;
  /** Toggle Wire (outlines only) from the panel, next to the renderer buttons. */
  onWire?: () => void;
}

/** Frame time health, by average ms per computed frame: up to 16 (60 fps), up to 33 (30 fps), slower. */
const HEALTH = { good: '#4ade80', fair: '#fb923c', bad: '#f87171' };

export function createFpsMeter(parent: HTMLElement, on = false, options: FpsMeterOptions = {}): FpsMeter {
  const panel = document.createElement('div');
  const header = document.createElement('div');
  const copy = document.createElement('button');
  const choices = document.createElement('div');
  const el = document.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(panel.style, {
    position: 'fixed',
    left: '12px',
    top: '12px',
    zIndex: '200',
    maxHeight: '75vh',
    overflow: 'hidden auto',
    pointerEvents: 'none',
    background: 'rgb(0 0 0 / 0.5)', // overlay.ink (literal: the player page has no tokens)
  });
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '10px 8px 7px',
  });
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.title = 'Copy debug output';
  copy.setAttribute('aria-label', 'Copy debug output');
  Object.assign(copy.style, {
    border: '0',
    borderRadius: '0',
    padding: '0',
    color: '#ededed',
    background: 'transparent',
    font: '11px/1.5 ui-monospace, "JetBrains Mono", monospace',
    pointerEvents: 'auto',
    cursor: 'pointer',
  });
  Object.assign(el.style, {
    margin: '0',
    padding: '8px 8px 0',
    font: '11px/1.5 ui-monospace, "JetBrains Mono", monospace',
    color: '#ededed',
    background: 'transparent',
    whiteSpace: 'pre',
    overflow: 'visible',
  });
  panel.hidden = !on;
  // Renderer switch: the chosen one is underlined; the line in the text says what actually painted.
  const choiceButtons = new Map<RendererChoice, HTMLButtonElement>();
  Object.assign(choices.style, { display: 'flex', gap: '10px', marginRight: 'auto' });
  if (options.onRenderer) {
    for (const [value, label] of [['auto', 'Auto'], ['svg', 'SVG'], ['canvas', 'Canvas']] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = value === 'auto' ? 'Renderer: canvas for heavy frames, SVG otherwise' : value === 'svg' ? 'Renderer: always SVG' : 'Renderer: always Canvas (frames with filters or masks stay SVG)';
      Object.assign(b.style, { border: '0', borderRadius: '0', padding: '0', color: '#ededed', background: 'transparent', font: '11px/1.5 ui-monospace, "JetBrains Mono", monospace', pointerEvents: 'auto', cursor: 'pointer', opacity: '0.6' });
      b.addEventListener('click', () => options.onRenderer?.(value));
      choiceButtons.set(value, b);
      choices.append(b);
    }
  }
  // Wire: a toggle of its own (it paints in SVG whatever the renderer), set apart by a rule.
  const wireButton = document.createElement('button');
  if (options.onWire) {
    wireButton.type = 'button';
    wireButton.textContent = 'Wire';
    wireButton.title = 'Wire: outlines only (W)';
    wireButton.setAttribute('aria-pressed', 'false');
    Object.assign(wireButton.style, { border: '0', borderLeft: '1px solid rgba(237, 237, 237, 0.3)', borderRadius: '0', padding: '0 0 0 10px', color: '#ededed', background: 'transparent', font: '11px/1.5 ui-monospace, "JetBrains Mono", monospace', pointerEvents: 'auto', cursor: 'pointer', opacity: '0.6' });
    wireButton.addEventListener('click', () => options.onWire?.());
    choices.append(wireButton);
  }
  header.append(choices, copy);
  panel.append(el, header);
  parent.append(panel);

  let screen = 0, computed = 0, sum = 0, worst = 0, last = performance.now();
  let performanceText = '', variablesText = '';
  let painted: 'svg' | 'canvas' | null = null, chosen: RendererChoice | null = null;
  let lastVariablesKey = '';
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const render = () => { el.textContent = [performanceText, variablesText].filter(Boolean).join('\n\n'); };
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText([performanceText, variablesText].filter(Boolean).join('\n\n'));
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Failed';
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
  });
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
        ...(painted ? [`renderer ${painted}${chosen === 'auto' ? ' (auto)' : ''}`] : []),
      ].join('\n');
      render();
      el.style.color = avg > 33 ? 'var(--sv-signal-error)' : avg > 16 ? 'var(--sv-signal-warning)' : 'var(--sv-text-primary)';
      // The renderer painting now, coloured by how it keeps up: green fine, orange so-so, red slow.
      // A second without computed frames (a still scene) keeps the last verdict.
      if (computed) {
        const health = avg > 33 ? HEALTH.bad : avg > 16 ? HEALTH.fair : HEALTH.good;
        for (const [value, b] of choiceButtons) {
          b.style.color = value === painted ? health : '#ededed';
          b.style.opacity = value === painted || value === chosen ? '1' : '0.6';
        }
      }
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
      // Only redraw the text when something changed (the pointer moves between frames too).
      const key = JSON.stringify(scene) + JSON.stringify(custom);
      if (key === lastVariablesKey) return;
      lastVariablesKey = key;
      const format = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
      const sceneLines = Object.entries(scene).map(([key, value]) => `scene.${key.padEnd(18)} ${format(value)}`);
      const customLines = Object.entries(custom).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `scene.custom.${key} ${format(value)}`);
      variablesText = ['Scene', ...sceneLines, ...(customLines.length ? ['', 'Custom', ...customLines] : [])].join('\n');
      render();
    },
    renderer(now, choice) {
      painted = now;
      if (choice === chosen) return;
      chosen = choice;
      for (const [value, b] of choiceButtons) {
        const on = value === choice;
        b.style.opacity = on ? '1' : '0.6';
        b.style.textDecoration = on ? 'underline' : 'none';
        b.setAttribute('aria-pressed', String(on));
      }
    },
    wire(on) {
      wireButton.style.opacity = on ? '1' : '0.6';
      wireButton.style.textDecoration = on ? 'underline' : 'none';
      wireButton.setAttribute('aria-pressed', String(on));
    },
        toggle(v = panel.hidden) {
      panel.hidden = !v;
    },
    visible: () => !panel.hidden,
    stop() {
      cancelAnimationFrame(raf);
      clearTimeout(copyTimer);
      panel.remove();
    },
  };
}

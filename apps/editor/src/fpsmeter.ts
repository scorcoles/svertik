// Medidor de rendimiento para el modo Play: fps de la pantalla, fotogramas calculados por segundo
// y lo que tarda cada uno (media y peor del último segundo). Se enseña con D o con ?debug en la URL.

export interface FpsMeter {
  /** Un fotograma calculado por el reproductor, con lo que tardó. */
  frame(ms: number): void;
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
    background: 'rgb(0 0 0 / 0.6)',
    pointerEvents: 'none',
    whiteSpace: 'pre',
  });
  el.hidden = !on;
  parent.append(el);

  let screen = 0, computed = 0, sum = 0, worst = 0, last = performance.now();
  let raf = requestAnimationFrame(function tick(now) {
    screen++;
    if (now - last >= 1000) {
      const s = (now - last) / 1000;
      const avg = computed ? sum / computed : 0;
      // Lo que podría dar si solo dependiera del cálculo (sin contar lo que tarda el navegador en pintar).
      const budget = avg ? Math.min(999, Math.round(1000 / avg)) : 0;
      el.textContent = [
        `screen   ${Math.round(screen / s)} fps`,
        `computed ${Math.round(computed / s)} fps`,
        `frame    ${avg.toFixed(1)} ms avg · ${worst.toFixed(1)} ms worst`,
        `engine   could do ~${budget} fps`,
      ].join('\n');
      el.style.color = avg > 33 ? '#ff6b6b' : avg > 16 ? '#ffd166' : '#ededed';
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
    toggle(v = el.hidden) {
      el.hidden = !v;
    },
    stop() {
      cancelAnimationFrame(raf);
      el.remove();
    },
  };
}

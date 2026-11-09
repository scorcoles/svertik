import { builtins, createEngine, renderInto, type Scene } from '@svertik/engine';

// Un rectángulo con una retícula dentro, para que se vea cómo se deforma el interior.
const lines = [1, 2, 3, 4, 5]
  .map((i) => `<line x1="${20 + i * 26.66}" y1="40" x2="${20 + i * 26.66}" y2="160"/><line x1="20" y1="${40 + i * 20}" x2="180" y2="${40 + i * 20}"/>`)
  .join('');
const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect x="20" y="40" width="160" height="120" fill="#09fdd1" stroke="#000" stroke-width="1.5"/>
  <g stroke="#000" stroke-width="0.5" fill="none">${lines}</g>
</svg>`;

const scene: Scene = {
  version: 1,
  source,
  stack: [
    { id: 'move', type: 'transform', params: { x: 0, y: 0, rotation: 0 } },
    { id: 'sphere', type: 'spherize', params: { radius: 0.45, strength: 0.6 } },
    { id: 'twist', type: 'twist', params: { radius: 0.5, angle: 45 } },
    { id: 'bend', type: 'bend', params: { angle: 30 } },
    { id: 'wave', type: 'wave', params: { amplitude: 0.02, wavelength: 0.3, phase: 0 } },
    { id: 'noise', type: 'noise', params: { amount: 0.01, scale: 6, evolution: 0, seed: 7 } },
  ],
};

// Lo único que hace la «animación»: cambiar parámetros en el tiempo.
function animate(t: number) {
  const p = (id: string) => scene.stack.find((m) => m.id === id)!.params!;
  p('move').x = Math.sin(t * 0.5) * 6;
  p('move').rotation = Math.sin(t * 0.3) * 8;
  p('sphere').strength = Math.sin(t * 0.8) * 0.8;
  p('twist').angle = Math.sin(t * 0.4) * 70;
  p('bend').angle = Math.sin(t * 0.25) * 40;
  p('wave').phase = t * 120;
  p('noise').evolution = t * 0.15;
}

const engine = createEngine(builtins);
const result = document.querySelector<SVGSVGElement>('[data-result]')!;
const list = document.querySelector<HTMLOListElement>('[data-steps]')!;

const fmt = (v: unknown) => (typeof v === 'number' ? Number(v.toFixed(2)) : JSON.stringify(v));
const describe = (params: Record<string, unknown> = {}) =>
  Object.entries(params)
    .map(([k, v]) => `${k} ${fmt(v)}`)
    .join('\n');

// Una miniatura por paso: el origen y cada modificador acumulado. Clic = activar/desactivar.
const thumbs = ['source', ...scene.stack.map((m) => m.type)].map((name, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<div class="label">${i}. ${name}<span></span></div>`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  li.prepend(svg);
  if (i > 0) {
    const inst = scene.stack[i - 1]!;
    li.title = 'Click to toggle';
    li.addEventListener('click', () => {
      inst.enabled = inst.enabled === false;
      li.classList.toggle('off', inst.enabled === false);
    });
  }
  list.append(li);
  return { svg, info: li.querySelector('span')! };
});

let paused = false;
let t = 0;
let last = performance.now();
function frame(now: number) {
  if (!paused) t += (now - last) / 1000;
  last = now;
  animate(t);
  const steps = engine.evaluateSteps(scene);
  renderInto(result, steps.at(-1)!);
  steps.forEach((geo, i) => renderInto(thumbs[i]!.svg, geo));
  thumbs.forEach((th, i) => (th.info.textContent = i === 0 ? '' : describe(scene.stack[i - 1]!.params)));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.querySelector('[data-action="pause"]')!.addEventListener('click', (e) => {
  paused = !paused;
  (e.currentTarget as HTMLButtonElement).textContent = paused ? 'Play' : 'Pause';
});
document.querySelector('[data-action="svg"]')!.addEventListener('click', () => {
  const blob = new Blob([engine.toSVG(scene)], { type: 'image/svg+xml' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'svertik.svg' });
  a.click();
  URL.revokeObjectURL(a.href);
});
document.querySelector('[data-action="json"]')!.addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  await navigator.clipboard.writeText(JSON.stringify(scene, null, 2));
  btn.textContent = 'Copied';
  setTimeout(() => (btn.textContent = 'Copy JSON'), 1200);
});

// SVG de ejemplo para empezar sin archivo propio.

const gridLines = [1, 2, 3, 4, 5]
  .map((i) => `<line x1="${(20 + i * 26.66).toFixed(2)}" y1="40" x2="${(20 + i * 26.66).toFixed(2)}" y2="160"/><line x1="20" y1="${40 + i * 20}" x2="180" y2="${40 + i * 20}"/>`)
  .join('');

const rings = Array.from({ length: 8 }, (_, i) => `<circle cx="100" cy="100" r="${12 + i * 10}"/>`).join('');

const star = (cx: number, cy: number, r1: number, r2: number, n: number) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? r2 : r1;
    const a = (i * Math.PI) / n - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

export const samples = {
  grid: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="20" y="40" width="160" height="120" fill="#09fdd1" stroke="#000" stroke-width="1.5"/><g stroke="#000" stroke-width="0.5" fill="none">${gridLines}</g></svg>`,
  rings: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g fill="none" stroke="#ededed" stroke-width="2">${rings}</g></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><polygon points="${star(100, 104, 84, 38, 5)}" fill="#09fdd1" stroke="#000" stroke-width="2"/><circle cx="100" cy="104" r="18" fill="#141414"/></svg>`,
} as const;

export type SampleName = keyof typeof samples;

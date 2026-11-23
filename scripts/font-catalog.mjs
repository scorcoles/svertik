// Generates apps/editor/src/font-catalog.json: the Fontsource catalogue reduced to what the editor's
// font picker uses. Only free families with a Latin alphabet, no icon fonts.
// Sorted by popularity (Google Fonts'; families not there go last), with a curated selection
// ("picks": few, varied, well drawn, and drawn well by the engine).
// Usage: node scripts/font-catalog.mjs (needs network). Each entry: [family, category, weights, italic, pick].
import { writeFileSync } from 'node:fs';

const FREE = new Set(['OFL-1.1', 'Apache-2.0', 'UFL-1.0', 'CC0-1.0', 'mit', 'MIT', 'Unlicense']);
const CATEGORY = { 'sans-serif': 'sans', serif: 'serif', display: 'display', handwriting: 'hand', monospace: 'mono', other: 'other' };

export const PICKS = [
  // Sans
  'Inter', 'Manrope', 'Space Grotesk', 'Bricolage Grotesque', 'Instrument Sans', 'DM Sans', 'Archivo', 'Syne', 'Unbounded', 'Outfit',
  // Serif
  'Fraunces', 'Playfair Display', 'Instrument Serif', 'Newsreader', 'DM Serif Display', 'Cormorant Garamond', 'EB Garamond', 'Young Serif',
  // Display
  'Anton', 'Bebas Neue', 'Big Shoulders Display', 'Monoton', 'Rubik Mono One', 'Bungee', 'Climate Crisis', 'Tilt Warp', 'Dela Gothic One',
  // Mono
  'Commit Mono', 'IBM Plex Mono', 'Space Mono', 'DM Mono', 'Major Mono Display',
  // Manuscritas
  'Caveat', 'Permanent Marker', 'Gochi Hand', 'Rock Salt',
];

const res = await fetch('https://api.fontsource.org/v1/fonts');
if (!res.ok) throw new Error(`Fontsource: ${res.status}`);
const all = await res.json();
// Google Fonts popularity (1 = most used). The response starts with a prefix before the JSON.
const gf = await (await fetch('https://fonts.google.com/metadata/fonts')).text();
const rank = new Map(JSON.parse(gf.slice(gf.indexOf('{'))).familyMetadataList.map((f) => [f.family, f.popularity]));
const skip = new Set(process.env.SKIP?.split('|') ?? []);
const picks = new Set(PICKS.filter((p) => !skip.has(p)));
const out = all
  .filter((f) => FREE.has(f.license) && f.subsets.includes('latin') && CATEGORY[f.category])
  .sort((a, b) => (rank.get(a.family) ?? 1e9) - (rank.get(b.family) ?? 1e9) || a.family.localeCompare(b.family))
  .map((f) => [f.family, CATEGORY[f.category], f.weights.join(','), f.styles.includes('italic') ? 1 : 0, picks.has(f.family) ? 1 : 0]);
const missing = [...picks].filter((p) => !out.some((f) => f[0] === p));
if (missing.length) console.warn('picks that are missing:', missing.join(', '));
writeFileSync(new URL('../apps/editor/src/font-catalog.json', import.meta.url), JSON.stringify(out));
console.log(`${out.length} familias (de ${all.length})`);

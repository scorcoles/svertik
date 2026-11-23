// CSS colours ↔ RGB ↔ HSL ↔ OKLCH, without the DOM (the engine also runs in workers and in Node).

export type RGBA = [number, number, number, number];

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080', grey: '#808080',
  orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', lime: '#00ff00', navy: '#000080', teal: '#008080',
  maroon: '#800000', olive: '#808000', silver: '#c0c0c0', brown: '#a52a2a',
};

/** Hex (#rgb, #rrggbb, #rrggbbaa), rgb()/rgba() or a common name. null if not understood (none, url()…). */
export function parseColor(input: string | undefined): RGBA | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s]!;
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? (parseFloat(x) / 100) * 255 : parseFloat(x)));
    if (p.length < 3 || p.some((x) => !Number.isFinite(x))) return null;
    return [p[0]!, p[1]!, p[2]!, p[3] === undefined ? 1 : p[3] > 1 ? p[3] / 255 : p[3]];
  }
  return null;
}

export function toHex([r, g, b, a]: RGBA): string {
  const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${a < 1 ? h(a * 255) : ''}`;
}

/** RGB 0–255 → HSL (h in degrees, s and l in 0–1). */
export function rgbToHsl([r, g, b]: RGBA): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number, a = 1): RGBA {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255, a];
}

// ── OKLCH: perceived lightness, chroma and hue. Mixing there doesn't go through grey between two vivid colours.

const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB 0–255 → OKLab. */
export function rgbToOklab([r, g, b]: RGBA): [number, number, number] {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear sRGB (unclipped: may go beyond 0–1). */
function oklabToLinear(L: number, A: number, B: number): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH (h in radians) → sRGB 0–255. Out of gamut, it lowers the chroma until it fits (doesn't clip channels). */
export function oklchToRgb(L: number, C: number, h: number, alpha = 1): RGBA {
  const fits = (c: number) => oklabToLinear(L, c * Math.cos(h), c * Math.sin(h)).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let c = C;
  if (!fits(c)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  const [r, g, b] = oklabToLinear(L, c * Math.cos(h), c * Math.sin(h)).map((v) => gam(Math.max(0, Math.min(1, v))));
  return [r!, g!, b!, alpha];
}

/** Below this chroma a colour counts as grey: its hue doesn't matter. */
const GRAY = 0.02;

/**
 * Mixes two colours in OKLCH, with the hue along the short way: from turquoise to coral it goes through
 * yellow, not grey. If one of them is grey (or white, or black), the other's hue is used.
 * Alpha, linear.
 */
export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const [La, Aa, Ba] = rgbToOklab(a);
  const [Lb, Ab, Bb] = rgbToOklab(b);
  const Ca = Math.hypot(Aa, Ba), Cb = Math.hypot(Ab, Bb);
  let ha = Math.atan2(Ba, Aa), hb = Math.atan2(Bb, Ab);
  if (Ca < GRAY) ha = hb;
  if (Cb < GRAY) hb = ha;
  let dh = hb - ha;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return oklchToRgb(La + (Lb - La) * t, Ca + (Cb - Ca) * t, ha + dh * t, a[3] + (b[3] - a[3]) * t);
}

import { flatten, line, mapSubPaths, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Recortar trazados (dibujarlos): de cada trazado queda solo el tramo entre Start y End (fracciones de su
 * longitud), desplazado por Offset; en los cerrados, el tramo da la vuelta. Animando End de 0 a 1, el
 * trazo se dibuja solo. Pensado para trazos (stroke); un relleno recortado se cierra en línea recta.
 */
export const trim = defineModifier({
  type: 'trim',
  label: 'Trim',
  kind: 'deformer',
  params: {
    // Neutros: el trazo entero (start 0, end 1). Dentro de Stagger, Range o Field, cada elemento va de su
    // trazo entero a estos valores según su peso: con End a 0, las líneas se dibujan una detrás de otra.
    start: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Start' },
    end: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'End', neutral: 1 },
    offset: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, label: 'Offset' },
  },
  apply(geo, p) {
    // Las curvas back y elastic de Stagger pueden pasarse de 0–1: el tramo, dentro.
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const a = clamp(Math.min(p.start, p.end)), b = clamp(Math.max(p.start, p.end));
    if (a <= 0 && b >= 1 && p.offset === 0) return geo;
    const out = mapSubPaths(geo, (sp) => cut(sp, a + p.offset, b + p.offset) ?? empty(sp));
    return { ...out, shapes: out.shapes.map((s) => ({ ...s, subpaths: s.subpaths.filter((x) => x.segs.length) })) };
  },
});

const empty = (sp: SubPath): SubPath => ({ start: sp.start, segs: [], closed: false });

function cut(sp: SubPath, f0: number, f1: number): SubPath | null {
  const pts = flatten(sp, 24);
  if (sp.closed) pts.push(sp.start);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const L = cum[cum.length - 1]!;
  if (L <= 0 || f1 - f0 <= 1e-6) return null;
  // Abiertos: se recorta dentro de [0, 1]. Cerrados: el tramo puede dar la vuelta.
  let s0 = f0 * L, s1 = f1 * L;
  if (!sp.closed) {
    s0 = Math.max(0, s0);
    s1 = Math.min(L, s1);
    if (s1 - s0 <= 1e-9) return null;
  }
  const at = (s: number): Vec2 => {
    if (sp.closed) s = ((s % L) + L) % L;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const seg = cum[i]! - cum[i - 1]! || 1;
    const k = (s - cum[i - 1]!) / seg;
    const p0 = pts[i - 1]!, p1 = pts[i]!;
    return [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k];
  };
  // Puntos del tramo: el inicio, los vértices de dentro y el final.
  const span = Math.min(s1 - s0, L);
  const out: Vec2[] = [at(s0)];
  const base = Math.floor(s0 / L) * L;
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 1; i < cum.length - 1; i++) {
      const s = base + lap * L + cum[i]!;
      if (s > s0 && s < s0 + span) out.push(at(s));
    }
  }
  out.push(at(s0 + span));
  const full = sp.closed && span >= L - 1e-9;
  return { start: out[0]!, segs: out.slice(1).map((q, i) => line(out[i]!, q)), closed: full };
}

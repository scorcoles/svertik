import { line, subdivide, type Geometry, type SoftMaterial, type SubPath, type Vec2 } from '../geometry';
import { insideFill, prepare } from './halftone';

export interface SoftSettings {
  acceleration: Vec2; friction: number; bounce: number; floor: Vec2 | null; rotation: number; collisions: boolean;
}
interface Link { a: number; b: number; length: number; bend: boolean; body?: boolean; material: SoftMaterial; rigid: boolean }
interface Path { shape: number; sub: number; ids: number[]; source: SubPath; area: number; volume: number; group: string }
interface Body { ids: number[]; rest: Vec2[]; material: SoftMaterial; rigid: boolean }
interface Frame { pos: Float64Array; vel: Float64Array; pending: Set<number> }
export interface SoftPlan {
  base: Geometry; rest: Float64Array; initial: Frame; free: number[]; radius: number[]; damping: number[]; surface: number[];
  paths: Path[]; links: Link[]; bodies: Body[]; groups: { ids: number[]; paths: Path[] }[];
  replay?: { key: string; checkpoints: Frame[]; latest: { step: number; frame: Frame } };
}
interface Solid { polys: Vec2[][]; evenodd: boolean; box: [number, number, number, number] }
const HZ = 120, INTERVAL = 30, ITERATIONS = 8;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const materialPlans = new WeakMap<Geometry, { size: number; plan: SoftPlan }>();

export const hasSoftMaterial = (geo: Geometry) => geo.shapes.some((s) => s.softBody && s.subpaths.some((path) => s.softBody!.mode === 'auto' || (s.softBody!.mode === 'fibers' ? !path.closed : path.closed)));

/** Internal constitutive solver. Gravity/Physics supply every force, clock and contact setting. */
export function materialDynamics(geo: Geometry, time: number, settings: SoftSettings, targets: Geometry[], size: number): Geometry {
  let entry = materialPlans.get(geo);
  if (!entry || entry.size !== size) { entry = { size, plan: buildSoftPlan(geo, size) }; materialPlans.set(geo, entry); }
  return entry.plan.paths.length ? softGeometry(entry.plan, simulateSoft(entry.plan, time, settings, targets, size)) : geo;
}

export function buildSoftPlan(geo: Geometry, size: number): SoftPlan {
  let length = 0;
  for (const s of geo.shapes) for (const path of s.subpaths) {
    let from = path.start;
    for (const seg of path.segs) { length += Math.hypot(seg.c1[0] - from[0], seg.c1[1] - from[1]) + Math.hypot(seg.c2[0] - seg.c1[0], seg.c2[1] - seg.c1[1]) + Math.hypot(seg.p[0] - seg.c2[0], seg.p[1] - seg.c2[1]); from = seg.p; }
  }
  // A contour's particle count follows its perimeter, not the source object's longest side.
  // Long thin arms need a coarse material cage, rather than hundreds of render vertices.
  const base: Geometry = { ...geo, shapes: geo.shapes.map((shape) => ({ ...shape, subpaths: shape.subpaths.map((path) => {
    let perimeter = 0, from = path.start;
    for (const seg of path.segs) { perimeter += Math.hypot(seg.c1[0] - from[0], seg.c1[1] - from[1]) + Math.hypot(seg.c2[0] - seg.c1[0], seg.c2[1] - seg.c1[1]) + Math.hypot(seg.p[0] - seg.c2[0], seg.p[1] - seg.c2[1]); from = seg.p; }
    const samples = Math.max(4, Math.min(64, shape.softBody?.segments ?? 16));
    return subdivide({ viewBox: geo.viewBox, shapes: [{ ...shape, subpaths: [path] }] }, Math.max(perimeter / samples, length / 4096, 0.25)).shapes[0]!.subpaths[0]!;
  }) })) };
  const points: number[] = [], velocities: number[] = [], free: number[] = [], radius: number[] = [], damping: number[] = [], surface: number[] = [];
  const paths: Path[] = [], links: Link[] = [];
  const groups = new Map<string, { ids: number[]; closed: boolean; paths: number; explicit: boolean; material: SoftMaterial; rigid: boolean }>();
  base.shapes.forEach((s, si) => s.subpaths.forEach((source, sub) => {
    if (!source.segs.length) return;
    const material = s.softBody;
    const rigid = !material || (material.mode === 'fibers' && source.closed) || (material.mode === 'bodies' && !source.closed);
    const p: SoftMaterial = rigid ? { mode: 'auto', body: 'outline', pins: 'free', stiffness: 1, bending: 1, volume: 0, damping: 0, recovery: 10, segments: 24 } : material!;
    let path = source;
    const end = path.segs.at(-1)!.p;
    if (path.closed && Math.hypot(end[0] - path.start[0], end[1] - path.start[1]) > 1e-8) path = { ...path, segs: [...path.segs, line(end, path.start)] };
    const samples = [path.start, ...path.segs.map((seg) => seg.p)];
    if (path.closed) samples.pop();
    const ids: number[] = [], internalIds: number[] = [], center: Vec2 = [samples.reduce((n, v) => n + v[0], 0) / samples.length, samples.reduce((n, v) => n + v[1], 0) / samples.length];
    const [vx, vy] = s.impulse?.velocity ?? [0, 0], spin = s.impulse?.spin ?? 0;
    samples.forEach((q, i) => {
      ids.push(points.length / 2); points.push(q[0], q[1]);
      velocities.push(vx - spin * (q[1] - center[1]), vy + spin * (q[0] - center[0]));
      damping.push(p.damping);
      free.push(s.impulse?.immovable || (!path.closed && ((p.pins !== 'free' && i === 0) || (p.pins === 'ends' && i === samples.length - 1))) ? 0 : 1);
      radius.push(path.closed || !s.style.stroke || s.style.stroke === 'none' ? 0 : Math.max(0, Number(s.style['stroke-width'] ?? 1)) / 2);
      surface.push(1);
    });
    const connect = (a: number, b: number, bend: boolean) => links.push({ a, b, bend, material: p, rigid, length: Math.hypot(points[a * 2]! - points[b * 2]!, points[a * 2 + 1]! - points[b * 2 + 1]!) });
    const n = ids.length;
    for (let i = 0; i < n - (path.closed ? 0 : 1); i++) connect(ids[i]!, ids[(i + 1) % n]!, false);
    if (n > 2) for (let i = 0; i < n - (path.closed ? 0 : 2); i++) connect(ids[i]!, ids[(i + 2) % n]!, true);
    // A beam adds a flexible inner spine and cross-sections. The paired surface
    // points keep each section together, so contact bends the whole body instead
    // of letting its lower outline fold independently.
    if (path.closed && !rigid && p.body === 'beam' && n >= 8) {
      const local = ids.map((id) => [points[id * 2]!, points[id * 2 + 1]!] as Vec2);
      const mx = local.reduce((sum, q) => sum + q[0], 0) / n, my = local.reduce((sum, q) => sum + q[1], 0) / n;
      let xx = 0, xy = 0, yy = 0;
      for (const q of local) { const x = q[0] - mx, y = q[1] - my; xx += x * x; xy += x * y; yy += y * y; }
      const angle = Math.atan2(2 * xy, xx - yy) / 2, axis: Vec2 = [Math.cos(angle), Math.sin(angle)], normal: Vec2 = [-Math.sin(angle), Math.cos(angle)];
      const along = local.map((q) => q[0] * axis[0] + q[1] * axis[1]), across = local.map((q) => q[0] * normal[0] + q[1] * normal[1]);
      const min = Math.min(...along), max = Math.max(...along), thickness = Math.max(...across) - Math.min(...across), length = max - min;
      if (length > Math.max(thickness * 2.5, 1)) {
        const sections = Math.max(3, Math.min(24, Math.floor(n / 2), Math.ceil(length / Math.max(thickness, 1))));
        const spine: number[] = [], sectionLinks = new Set<string>();
        for (let section = 0; section <= sections; section++) {
          const sAt = min + length * section / sections, halfWindow = length / sections * 0.55;
          let candidates = ids.map((id, i) => ({ id, i, distance: Math.abs(along[i]! - sAt) })).filter((q) => q.distance <= halfWindow);
          if (candidates.length < 2) candidates = ids.map((id, i) => ({ id, i, distance: Math.abs(along[i]! - sAt) })).sort((a, b) => a.distance - b.distance).slice(0, Math.min(8, n));
          const top = candidates.reduce((a, b) => across[a.i]! < across[b.i]! ? a : b);
          const bottom = candidates.reduce((a, b) => across[a.i]! > across[b.i]! ? a : b);
          if (top.id === bottom.id || Math.hypot(points[top.id * 2]! - points[bottom.id * 2]!, points[top.id * 2 + 1]! - points[bottom.id * 2 + 1]!) < thickness * 0.35) continue;
          const key = `${Math.min(top.id, bottom.id)}:${Math.max(top.id, bottom.id)}`;
          if (sectionLinks.has(key)) continue;
          sectionLinks.add(key);
          const id = points.length / 2, x = (points[top.id * 2]! + points[bottom.id * 2]!) / 2, y = (points[top.id * 2 + 1]! + points[bottom.id * 2 + 1]!) / 2;
          points.push(x, y); velocities.push(vx - spin * (y - center[1]), vy + spin * (x - center[0]));
          free.push(s.impulse?.immovable ? 0 : 1); radius.push(0); damping.push(p.damping); surface.push(0);
          internalIds.push(id); spine.push(id);
          connect(top.id, bottom.id, false); connect(id, top.id, false); connect(id, bottom.id, false);
        }
        for (let i = 0; i < spine.length - 1; i++) connect(spine[i]!, spine[i + 1]!, false);
        for (let i = 0; i < spine.length - 2; i++) connect(spine[i]!, spine[i + 2]!, true);
      }
    }
    const area = path.closed ? samples.reduce((sum, q, i) => { const r = samples[(i + 1) % n]!; return sum + q[0] * r[1] - r[0] * q[1]; }, 0) / 2 : 0;
    const key = s.bodyGroup !== undefined ? `body:${s.bodyGroup}` : s.clone !== undefined ? `clone:${s.clone}` : `shape:${si}`;
    paths.push({ shape: si, sub, ids, source: path, area, volume: rigid ? 0 : p.volume, group: key });
    const group = groups.get(key) ?? { ids: [], closed: false, paths: 0, explicit: s.bodyGroup !== undefined, material: p, rigid };
    group.ids.push(...ids, ...internalIds); group.closed ||= path.closed || rigid; group.paths++;
    groups.set(key, group);
  }));
  const bodies: Body[] = [];
  for (const group of groups.values()) {
    if (!group.closed && !(group.explicit && group.paths > 1)) continue;
    const { ids } = group;
    const cx = ids.reduce((sum, id) => sum + points[id * 2]!, 0) / ids.length, cy = ids.reduce((sum, id) => sum + points[id * 2 + 1]!, 0) / ids.length;
    bodies.push({ ids, material: group.material, rigid: group.rigid, rest: ids.map((id) => [points[id * 2]! - cx, points[id * 2 + 1]! - cy]) });
  }
  const rest = new Float64Array(points);
  const bodyParticles = new Set(bodies.flatMap((body) => body.ids));
  for (const link of links) link.body = bodyParticles.has(link.a) && bodyParticles.has(link.b);
  return { base, rest, initial: { pos: rest.slice(), vel: new Float64Array(velocities), pending: new Set() }, free, radius, damping, surface, paths, links, bodies, groups: [...groups.entries()].map(([key, g]) => ({ ids: g.ids, paths: paths.filter((p) => p.group === key) })) };
}

function solidsOf(targets: Geometry[], detail: number): Solid[] {
  return targets.flatMap((geo) => geo.shapes.flatMap((s) => {
    const l = prepare(s, detail);
    return l?.fill && l.polys.length ? [{ polys: l.polys, box: l.box, evenodd: l.evenodd }] : [];
  }));
}

/** Project to a closed solid's closest boundary, or the first boundary crossed this step. */
function solidContact(s: Solid, x: number, y: number, ox: number, oy: number, radius: number, sweep: boolean): [number, number, number, number] | null {
  const b = s.box;
  if (Math.max(x, ox) + radius < b[0] || Math.min(x, ox) - radius > b[2] || Math.max(y, oy) + radius < b[1] || Math.min(y, oy) - radius > b[3]) return null;
  const inside = insideFill(s.polys, [x, y], s.evenodd);
  let best = Infinity, qx = x, qy = y, nx = 0, ny = -1, first = Infinity;
  const vx = x - ox, vy = y - oy;
  const wasInside = sweep && insideFill(s.polys, [ox, oy], s.evenodd);
  for (const poly of s.polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!, c = poly[i]!, dx = c[0] - a[0], dy = c[1] - a[1], length2 = dx * dx + dy * dy;
    if (length2 < 1e-16) continue;
    if (sweep && !wasInside) {
      const det = vx * dy - vy * dx;
      if (Math.abs(det) > 1e-12) {
        const ax = a[0] - ox, ay = a[1] - oy, t = (ax * dy - ay * dx) / det, u = (ax * vy - ay * vx) / det;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < first) {
          first = t; qx = ox + vx * t; qy = oy + vy * t;
          const len = Math.sqrt(length2), sign = (-dy * vx + dx * vy) > 0 ? -1 : 1;
          nx = -dy / len * sign; ny = dx / len * sign;
        }
      }
    }
    if (first !== Infinity) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length2));
    const px = a[0] + dx * t, py = a[1] + dy * t, d2 = (px - x) ** 2 + (py - y) ** 2;
    if (d2 < best) {
      best = d2; qx = px; qy = py;
      const d = Math.sqrt(d2), sign = inside ? 1 : -1;
      nx = d > 1e-10 ? (px - x) / d * sign : -dy / Math.sqrt(length2);
      ny = d > 1e-10 ? (py - y) / d * sign : dx / Math.sqrt(length2);
    }
  }
  if (first === Infinity && !inside && best >= radius * radius) return null;
  return [qx + nx * (radius + 1e-5), qy + ny * (radius + 1e-5), nx, ny];
}

export function simulateSoft(plan: SoftPlan, time: number, p: SoftSettings, targets: Geometry[], size: number): Frame {
  const key = JSON.stringify([p, targets.map((g) => g.shapes.map((s) => [s.subpaths, s.style.fill, s.style['fill-rule']]))]);
  let replay = plan.replay;
  const boxes = (pos: Float64Array) => plan.groups.map((group) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of group.ids) { const x = pos[id * 2]!, y = pos[id * 2 + 1]!, r = plan.radius[id]!; x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
    return [x0, y0, x1, y1];
  });
  const overlap = (a: number[], b: number[]) => a[0]! <= b[2]! && b[0]! <= a[2]! && a[1]! <= b[3]! && b[1]! <= a[3]!;
  if (!replay || replay.key !== key) {
    const initial = { ...plan.initial, pending: new Set<number>() }, b = boxes(initial.pos);
    if (p.collisions) for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (overlap(b[i]!, b[j]!)) initial.pending.add(i * b.length + j);
    replay = plan.replay = { key, checkpoints: [initial], latest: { step: 0, frame: initial } };
  }
  const solids = solidsOf(targets, Math.max(0.25, size / 1000));
  const { rest, free, radius, damping, surface } = plan;
  const count = free.length, nx = -Math.sin(p.rotation), ny = Math.cos(p.rotation);
  const advance = (frame: Frame, dt: number): Frame => {
    const pos = frame.pos.slice(), vel = frame.vel.slice(), contact = new Float64Array(count * 2), contactSpeed = new Float64Array(count);
    const projected = frame.pos.slice();
    const pending = new Set(frame.pending);

    // Body elasticity is a physical relaxation rate, rather than a near-rigid correction
    // repeated 120 times per second. Fibres keep strong axial links while bending freely.
    const relaxation = (material: SoftMaterial, rigid: boolean) => rigid ? 1 : 1 - Math.exp(-((12 + 80 * clamp(material.stiffness)) ** 2) * dt * dt / ITERATIONS);
    // Material damping removes strain velocity while preserving translation and rigid spin.
    for (const group of plan.groups) {
      const n = group.ids.length;
      let cx = 0, cy = 0, vx = 0, vy = 0;
      for (const id of group.ids) { cx += pos[id * 2]!; cy += pos[id * 2 + 1]!; vx += vel[id * 2]!; vy += vel[id * 2 + 1]!; }
      cx /= n; cy /= n; vx /= n; vy /= n;
      let spin = 0, inertia = 0;
      for (const id of group.ids) { const x = pos[id * 2]! - cx, y = pos[id * 2 + 1]! - cy; spin += x * (vel[id * 2 + 1]! - vy) - y * (vel[id * 2]! - vx); inertia += x * x + y * y; }
      spin = inertia > 1e-12 ? spin / inertia : 0;
      for (const id of group.ids) if (free[id]) {
        const keep = Math.exp(-Math.max(0, damping[id]!) * 160 * dt);
        const rigidX = vx - spin * (pos[id * 2 + 1]! - cy), rigidY = vy + spin * (pos[id * 2]! - cx);
        vel[id * 2] = rigidX + (vel[id * 2]! - rigidX) * keep + p.acceleration[0] * dt;
        vel[id * 2 + 1] = rigidY + (vel[id * 2 + 1]! - rigidY) * keep + p.acceleration[1] * dt;
        pos[id * 2] = pos[id * 2]! + vel[id * 2]! * dt;
        pos[id * 2 + 1] = pos[id * 2 + 1]! + vel[id * 2 + 1]! * dt;
      }
    }
    const project = () => {
      for (let i = 0; i < count; i++) if (free[i] && surface[i]) {
        let x = pos[i * 2]!, y = pos[i * 2 + 1]!;
        const beforeX = x, beforeY = y;
        for (const s of solids) {
          const hit = solidContact(s, x, y, projected[i * 2]!, projected[i * 2 + 1]!, radius[i]!, true);
          if (hit) { [x, y] = hit; contact[i * 2] = hit[2]; contact[i * 2 + 1] = hit[3]; }
        }
        const depth = p.floor ? (x - p.floor[0]) * nx + (y - p.floor[1]) * ny + radius[i]! : -Infinity;
        if (depth > 0) { x -= nx * depth; y -= ny * depth; contact[i * 2] = -nx; contact[i * 2 + 1] = -ny; }
        contactSpeed[i] = Math.max(contactSpeed[i]!, Math.hypot(x - beforeX, y - beforeY) / dt);
        pos[i * 2] = x; pos[i * 2 + 1] = y;
        projected[i * 2] = x; projected[i * 2 + 1] = y;
      }
    };
    const bodyContacts = () => {
      if (!p.collisions || plan.groups.length < 2) return;
      const b = boxes(pos), count = b.length;
      const contours = new Map(plan.groups.map((group, i) => [group, { box: b[i]!, open: group.paths.some((path) => !path.source.closed), polys: group.paths.filter((path) => path.source.closed).map((path) => path.ids.map((i): Vec2 => [pos[i * 2]!, pos[i * 2 + 1]!])) }]));
      const contactPoint = (id: number, other: SoftPlan['groups'][number]) => {
        if (!free[id]) return;
        const x = pos[id * 2]!, y = pos[id * 2 + 1]!;
        const outline = contours.get(other)!, box = outline.box, pad = radius[id]!;
        if (x + pad < box[0]! || x - pad > box[2]! || y + pad < box[1]! || y - pad > box[3]!) return;
        const polys = outline.polys;
        const inside = polys.length > 0 && insideFill(polys, [x, y], true);
        if (!inside && !pad && !outline.open) return;
        let nearest: { a: number; b: number; t: number; nx: number; ny: number; depth: number; distance: number } | null = null;
        for (const path of other.paths) for (let j = 0; j < path.ids.length - (path.source.closed ? 0 : 1); j++) {
          const a = path.ids[j]!, c = path.ids[(j + 1) % path.ids.length]!, ax = pos[a * 2]!, ay = pos[a * 2 + 1]!;
          const dx = pos[c * 2]! - ax, dy = pos[c * 2 + 1]! - ay, length = dx * dx + dy * dy;
          if (length < 1e-12) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)), qx = ax + dx * t, qy = ay + dy * t;
          const distance = Math.hypot(x - qx, y - qy), reach = radius[id]! + (path.source.closed ? 0 : radius[a]!);
          if (!inside && distance >= reach) continue;
          const sign = inside ? -1 : 1, nx = distance > 1e-10 ? (x - qx) / distance * sign : -dy / Math.sqrt(length), ny = distance > 1e-10 ? (y - qy) / distance * sign : dx / Math.sqrt(length);
          if (!nearest || distance < nearest.distance) nearest = { a, b: c, t, nx, ny, depth: inside ? distance + reach : reach - distance, distance };
        }
        if (!nearest) return;
        const { a, b, t, nx, ny, depth } = nearest, wa = free[a]! * (1 - t), wb = free[b]! * t, sum = free[id]! + wa * (1 - t) + wb * t;
        if (!sum) return;
        const correction = depth * 0.8 / sum;
        pos[id * 2] = pos[id * 2]! + nx * correction * free[id]!; pos[id * 2 + 1] = pos[id * 2 + 1]! + ny * correction * free[id]!;
        pos[a * 2] = pos[a * 2]! - nx * correction * wa; pos[a * 2 + 1] = pos[a * 2 + 1]! - ny * correction * wa;
        pos[b * 2] = pos[b * 2]! - nx * correction * wb; pos[b * 2 + 1] = pos[b * 2 + 1]! - ny * correction * wb;
        contact[id * 2] = nx; contact[id * 2 + 1] = ny;
        if (wa) { contact[a * 2] = -nx; contact[a * 2 + 1] = -ny; }
        if (wb) { contact[b * 2] = -nx; contact[b * 2 + 1] = -ny; }
      };
      for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
        const pair = i * count + j;
        if (!overlap(b[i]!, b[j]!)) { pending.delete(pair); continue; }
        if (pending.has(pair)) continue;
        for (const id of plan.groups[i]!.ids) if (surface[id]) contactPoint(id, plan.groups[j]!);
        for (const id of plan.groups[j]!.ids) if (surface[id]) contactPoint(id, plan.groups[i]!);
      }
    };
    project();
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      for (const link of plan.links) {
        const { a, b } = link, w = free[a]! + free[b]!;
        if (!w) continue;
        const dx = pos[b * 2]! - pos[a * 2]!, dy = pos[b * 2 + 1]! - pos[a * 2 + 1]!, length = Math.hypot(dx, dy);
        if (length < 1e-12) continue;
        const strength = link.body ? relaxation(link.material, link.rigid) * (link.bend ? clamp(link.material.bending) : 1)
          : 1 - Math.pow(1 - clamp(link.bend ? link.material.bending : link.material.stiffness), 1 / ITERATIONS);
        const k = (length - link.length) / length * strength / w;
        pos[a * 2] = pos[a * 2]! + dx * k * free[a]!; pos[a * 2 + 1] = pos[a * 2 + 1]! + dy * k * free[a]!;
        pos[b * 2] = pos[b * 2]! - dx * k * free[b]!; pos[b * 2 + 1] = pos[b * 2 + 1]! - dy * k * free[b]!;
      }
      for (const body of plan.bodies) {
        const cx = body.ids.reduce((sum, id) => sum + pos[id * 2]!, 0) / body.ids.length, cy = body.ids.reduce((sum, id) => sum + pos[id * 2 + 1]!, 0) / body.ids.length;
        // Beam deformation is temporary: elastic shape memory lets impact flex the
        // body, then gradually restores its rigid rest pose without cancelling bounce.
        let memory = 1;
        if (!body.rigid && body.material.body === 'beam') {
          const n = body.ids.length;
          let vx = 0, vy = 0;
          for (const id of body.ids) { vx += vel[id * 2]!; vy += vel[id * 2 + 1]!; }
          vx /= n; vy /= n;
          let spin = 0, inertia = 0;
          for (const id of body.ids) {
            const x = pos[id * 2]! - cx, y = pos[id * 2 + 1]! - cy;
            spin += x * (vel[id * 2 + 1]! - vy) - y * (vel[id * 2]! - vx); inertia += x * x + y * y;
          }
          spin = inertia > 1e-12 ? spin / inertia : 0;
          let strainSpeed2 = 0, impactSpeed = 0;
          for (const id of body.ids) {
            const rigidX = vx - spin * (pos[id * 2 + 1]! - cy), rigidY = vy + spin * (pos[id * 2]! - cx);
            strainSpeed2 += (vel[id * 2]! - rigidX) ** 2 + (vel[id * 2 + 1]! - rigidY) ** 2;
            impactSpeed = Math.max(impactSpeed, contactSpeed[id]!);
          }
          const scale = Math.max(1, Math.sqrt(inertia / n));
          const activity = Math.max(Math.sqrt(strainSpeed2 / n), impactSpeed);
          const stillness = 1 - clamp(activity / Math.max(5, scale * 0.2));
          memory = clamp(body.material.recovery / 100) * stillness;
        }
        const bodyStrength = relaxation(body.material, body.rigid) * memory;
        let a = 0, b = 0;
        body.ids.forEach((id, j) => { const q = body.rest[j]!, x = pos[id * 2]! - cx, y = pos[id * 2 + 1]! - cy; a += q[0] * x + q[1] * y; b += q[0] * y - q[1] * x; });
        const angle = Math.atan2(b, a), c = Math.cos(angle), s = Math.sin(angle);
        body.ids.forEach((id, j) => {
          if (!free[id]) return;
          const q = body.rest[j]!;
          pos[id * 2] = pos[id * 2]! + (cx + c * q[0] - s * q[1] - pos[id * 2]!) * bodyStrength;
          pos[id * 2 + 1] = pos[id * 2 + 1]! + (cy + s * q[0] + c * q[1] - pos[id * 2 + 1]!) * bodyStrength;
        });
      }
      for (const path of plan.paths) if (path.volume && path.source.closed && Math.abs(path.area) > 1e-10) {
        const { ids } = path, n = ids.length;
        let area = 0, weight = 0;
        for (let j = 0; j < n; j++) {
          const a = ids[j]!, b = ids[(j + 1) % n]!, prev = ids[(j + n - 1) % n]!;
          area += (pos[a * 2]! * pos[b * 2 + 1]! - pos[b * 2]! * pos[a * 2 + 1]!) / 2;
          const gx = (pos[b * 2 + 1]! - pos[prev * 2 + 1]!) / 2, gy = (pos[prev * 2]! - pos[b * 2]!) / 2;
          weight += free[a]! * (gx * gx + gy * gy);
        }
        if (weight > 1e-12) {
          const lambda = (path.area - area) / weight * (1 - Math.pow(1 - clamp(path.volume), 1 / ITERATIONS));
          const changes = ids.map((id, j) => { const prev = ids[(j + n - 1) % n]!, next = ids[(j + 1) % n]!; return [(pos[next * 2 + 1]! - pos[prev * 2 + 1]!) / 2 * lambda * free[id]!, (pos[prev * 2]! - pos[next * 2]!) / 2 * lambda * free[id]!] as Vec2; });
          ids.forEach((id, j) => { pos[id * 2] = pos[id * 2]! + changes[j]![0]; pos[id * 2 + 1] = pos[id * 2 + 1]! + changes[j]![1]; });
        }
      }
      bodyContacts();
      project();
    }
    for (let i = 0; i < count; i++) {
      if (!free[i]) { pos[i * 2] = rest[i * 2]!; pos[i * 2 + 1] = rest[i * 2 + 1]!; vel[i * 2] = vel[i * 2 + 1] = 0; continue; }
      let vx = (pos[i * 2]! - frame.pos[i * 2]!) / dt, vy = (pos[i * 2 + 1]! - frame.pos[i * 2 + 1]!) / dt;
      const cx = contact[i * 2]!, cy = contact[i * 2 + 1]!;
      if (cx || cy) {
        const normal = Math.max(0, vx * cx + vy * cy, -(vel[i * 2]! * cx + vel[i * 2 + 1]! * cy) * clamp(p.bounce));
        const tangent = (-vx * cy + vy * cx) * (1 - clamp(p.friction));
        vx = normal * cx - tangent * cy; vy = normal * cy + tangent * cx;
      }
      vel[i * 2] = vx; vel[i * 2 + 1] = vy;
    }
    return { pos, vel, pending };
  };
  const whole = Math.floor(time * HZ + 1e-9), at = Math.min(Math.floor(whole / INTERVAL), replay.checkpoints.length - 1);
  let step = at * INTERVAL, frame = replay.checkpoints[at]!;
  if (replay.latest.step <= whole && replay.latest.step > step) { step = replay.latest.step; frame = replay.latest.frame; }
  for (; step < whole; step++) {
    frame = advance(frame, 1 / HZ);
    if ((step + 1) % INTERVAL === 0 && (step + 1) / INTERVAL === replay.checkpoints.length) replay.checkpoints.push(frame);
  }
  replay.latest = { step: whole, frame };
  const fraction = time - whole / HZ;
  return fraction > 1e-12 ? advance(frame, fraction) : frame;
}

/** Add the sampled displacement to the original cubics: the rest pose stays exact. */
export function softGeometry(plan: SoftPlan, frame: Frame): Geometry {
  const paths = new Map<string, SubPath>();
  for (const path of plan.paths) {
    const { ids, source } = path;
    const displacement = (id: number): Vec2 => [frame.pos[id * 2]! - plan.rest[id * 2]!, frame.pos[id * 2 + 1]! - plan.rest[id * 2 + 1]!];
    const at = (id: number): Vec2 => [frame.pos[id * 2]!, frame.pos[id * 2 + 1]!];
    paths.set(`${path.shape}:${path.sub}`, { ...source, start: at(ids[0]!), segs: source.segs.map((seg, i) => {
      const a = displacement(ids[i % ids.length]!), b = displacement(ids[(i + 1) % ids.length]!);
      return { c1: [seg.c1[0] + (a[0] * 2 + b[0]) / 3, seg.c1[1] + (a[1] * 2 + b[1]) / 3], c2: [seg.c2[0] + (a[0] + b[0] * 2) / 3, seg.c2[1] + (a[1] + b[1] * 2) / 3], p: at(ids[(i + 1) % ids.length]!) };
    }) });
  }
  return { ...plan.base, shapes: plan.base.shapes.map((shape, si) => {
    const { impulse: _impulse, patternTransform: _frame, ...rest } = shape;
    return { ...rest, subpaths: shape.subpaths.map((path, pi) => paths.get(`${si}:${pi}`) ?? path) };
  }) };
}

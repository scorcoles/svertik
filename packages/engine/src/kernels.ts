// The kernels: the heavy calculations of the engine, in Rust (WebAssembly).
//
// The engine works without them (every kernel also has its version in TypeScript), but when they are
// there the scenes with expensive effects go several times faster. They are only loaded when the scene
// needs them: the minimal player downloads nothing extra if nobody uses them.

/** A shape of the Metaball effect: its outlines (each one, its points) and its box. */
export interface MetaballShape {
  /** Each outline, its points (x, y, x, y…). */
  rings: number[][];
  /** The box of the shape: [x0, y0, x1, y1]. */
  box: [number, number, number, number];
}

export interface MetaballInput {
  reach: number;
  grow: number;
  quality: number;
  /** The box of everything: [x0, y0, x1, y1]. */
  box: [number, number, number, number];
  shapes: MetaballShape[];
}

export interface Kernels {
  /** The outlines of the metaball field: each element, its points (x, y, x, y…). */
  metaball(input: MetaballInput): number[][];
}

/** Where the module comes from: its bytes, its URL, or nothing (the one next to this file). */
export type KernelSource = ArrayBuffer | ArrayBufferView | string | URL;

let current: Kernels | null = null;

/** The kernels loaded (or null if the engine goes alone, in TypeScript). */
export const kernels = (): Kernels | null => current;

/** Sets the kernels (the player or the CLI loads them once). */
export const setKernels = (k: Kernels | null): void => {
  current = k;
};

/** The part of `node:fs` this needs (so the engine does not depend on its types). */
interface ReadFileSync {
  readFileSync(path: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };
}

/** The bytes of the module: in the browser they are downloaded; in Node, read from disk. */
async function wasmBytes(): Promise<ArrayBuffer> {
  const url = new URL('./kernels/svertik_kernels.wasm', import.meta.url);
  const proc = (globalThis as { process?: { versions?: { node?: string }; getBuiltinModule?: (id: string) => unknown } }).process;
  if (proc?.versions?.node && url.protocol === 'file:') {
    // No `import 'node:fs'`: that would make the browser build warn (and browsers have no fs). Node 22
    // hands the module over without a static import.
    const fs = proc.getBuiltinModule?.('node:fs') as ReadFileSync | undefined;
    if (!fs) throw new Error('svertik: no fs to read the kernels module');
    const file = fs.readFileSync(url);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`svertik: cannot read the kernels module (${res.status})`);
  return res.arrayBuffer();
}

/** The bytes, from whatever the source is. */
async function bytesOf(source: KernelSource | undefined): Promise<ArrayBuffer> {
  if (source === undefined) return wasmBytes();
  if (source instanceof ArrayBuffer) return source;
  if (ArrayBuffer.isView(source)) {
    return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
  }
  if (typeof source === 'string' || source instanceof URL) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`svertik: cannot read the kernels module (${res.status})`);
    return res.arrayBuffer();
  }
  return wasmBytes();
}

/** Builds the kernels from what the module exports. */
function makeKernels(exports: Record<string, unknown>): Kernels {
  const alloc = exports.alloc_bytes as (size: number) => number;
  const free = exports.free_bytes as (ptr: number, size: number) => void;
  const call = exports.metaball as (...args: number[]) => number;
  const outPtr = exports.out_ptr as () => number;
  const outLen = exports.out_len as () => number;
  // The buffer is read every time: if the memory grows, the old one is detached.
  const memory = (): ArrayBuffer => (exports.memory as WebAssembly.Memory).buffer;

  const metaball = (input: MetaballInput): number[][] => {
    // The points of every outline, then the tables of the outlines and of the shapes.
    let total = 0;
    for (const s of input.shapes) for (const r of s.rings) total += r.length / 2;
    const points = new Float64Array(total * 2);
    const ringTable = new Int32Array(input.shapes.reduce((a, s) => a + s.rings.length * 2, 0));
    const shapeTable = new Int32Array(input.shapes.length * 2);
    const boxes = new Float64Array(input.shapes.length * 4);
    let p = 0;
    let ri = 0;
    let sh = 0;
    for (const s of input.shapes) {
      shapeTable[sh * 2] = s.rings.length;
      shapeTable[sh * 2 + 1] = ri;
      for (const r of s.rings) {
        ringTable[ri * 2] = r.length / 2;
        ringTable[ri * 2 + 1] = p;
        points.set(r, p * 2);
        p += r.length / 2;
        ri++;
      }
      boxes.set(s.box, sh * 4);
      sh++;
    }
    // Into the module's memory.
    const pBytes = alloc(points.byteLength);
    const rBytes = alloc(ringTable.byteLength);
    const sBytes = alloc(shapeTable.byteLength);
    const bBytes = alloc(boxes.byteLength);
    try {
      new Float64Array(memory(), pBytes, points.length).set(points);
      new Int32Array(memory(), rBytes, ringTable.length).set(ringTable);
      new Int32Array(memory(), sBytes, shapeTable.length).set(shapeTable);
      new Float64Array(memory(), bBytes, boxes.length).set(boxes);
      // The pointers are byte addresses (that is what a pointer is in wasm).
      call(
        input.reach,
        input.grow,
        input.quality,
        input.box[0],
        input.box[1],
        input.box[2],
        input.box[3],
        pBytes,
        points.length / 2,
        rBytes,
        ringTable.length / 2,
        sBytes,
        shapeTable.length / 2,
        bBytes,
      );
      const out = new Float64Array(memory(), outPtr(), outLen());
      // The header says how many numbers come before the points; then, the table of the outlines.
      const header = out[0]!;
      const loops: number[][] = [];
      for (let i = 0; i < header - 1; i += 2) {
        const count = out[1 + i]!;
        const offset = out[2 + i]!;
        const pts = new Array<number>(count * 2);
        for (let k = 0; k < count * 2; k++) pts[k] = out[header + offset * 2 + k]!;
        loops.push(pts);
      }
      return loops;
    } finally {
      free(pBytes, points.byteLength);
      free(rBytes, ringTable.byteLength);
      free(sBytes, shapeTable.byteLength);
      free(bBytes, boxes.byteLength);
    }
  };

  return { metaball };
}

/**
 * Loads the kernels. `source` is optional: a website that serves the module from elsewhere (or from a
 * blob, or that wants no network at all) passes its bytes or its URL. If they cannot be loaded, the
 * engine goes on with its versions in TypeScript: the drawing is the same.
 */
export async function initKernels(source?: KernelSource): Promise<Kernels | null> {
  if (current) return current;
  try {
    const bytes = await bytesOf(source);
    const { instance } = await WebAssembly.instantiate(bytes, {});
    current = makeKernels(instance.exports as unknown as Record<string, unknown>);
    return current;
  } catch {
    return null;
  }
}

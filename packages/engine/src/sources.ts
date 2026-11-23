// SVG sources outside the project: an object can point to its SVG (`href`) instead of carrying it.
import type { SceneV1 } from './scene';

interface ObjectLike { kind: 'object'; name?: string; source?: unknown; href?: unknown; packed?: unknown }

const isObjectNode = (v: unknown): v is ObjectLike => !!v && typeof v === 'object' && (v as { kind?: unknown }).kind === 'object';

/** Every object node in the scene, wherever it is: groups, layers, compositions and packs' originals. */
function eachObject(value: unknown, visit: (node: ObjectLike) => void): void {
  if (Array.isArray(value)) for (const item of value) eachObject(item, visit);
  else if (value && typeof value === 'object') {
    if (isObjectNode(value)) visit(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') eachObject(child, visit);
  }
}

/** A file name from the object's name: "Star Logo" → "Star Logo.svg". */
const fileName = (name: string | undefined) => {
  const base = (name ?? '').replace(/\.svg$/i, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'drawing';
  return `${base}.svg`;
};

/**
 * The scene with its SVG sources left out: each object keeps an `href` (a file name, relative to the project)
 * and an empty `source`. The same SVG gets the same file; different SVGs never share one.
 */
export function detachSources(scene: SceneV1): { scene: SceneV1; files: Map<string, string> } {
  const out = structuredClone(scene);
  const files = new Map<string, string>(); // href → SVG
  const byText = new Map<string, string>(); // SVG → href
  eachObject(out, (node) => {
    if (typeof node.source !== 'string' || !node.source) return;
    let href = byText.get(node.source);
    if (!href) {
      href = typeof node.href === 'string' && node.href ? node.href : fileName(node.name);
      const [stem, ext] = [href.replace(/\.svg$/i, ''), /\.svg$/i.test(href) ? href.slice(-4) : ''];
      for (let i = 2; files.has(href) && files.get(href) !== node.source; i++) href = `${stem}-${i}${ext}`;
      files.set(href, node.source);
      byText.set(node.source, href);
    }
    node.href = href;
    node.source = '';
  });
  return { scene: out, files };
}

/** The `href`s whose SVG isn't in the scene yet (each once, in order). */
export function missingSources(scene: SceneV1): string[] {
  const out = new Set<string>();
  eachObject(scene, (node) => {
    if (typeof node.href === 'string' && node.href && !node.source && !node.packed) out.add(node.href);
  });
  return [...out];
}

/**
 * The scene with the SVGs it points to filled in. `files` is looked up by `href`, then by its bare file name
 * (so "art/logo.svg" also matches a dropped "logo.svg"). The `href` stays, so the project can be saved
 * without them again.
 */
export function attachSources(scene: SceneV1, files: ReadonlyMap<string, string> | Record<string, string>): SceneV1 {
  const map = files instanceof Map ? files : new Map(Object.entries(files));
  const bare = new Map([...map].map(([k, v]) => [k.replace(/^.*[\\/]/, ''), v]));
  const out = structuredClone(scene);
  eachObject(out, (node) => {
    if (typeof node.href !== 'string' || !node.href || node.source) return;
    const svg = map.get(node.href) ?? bare.get(node.href.replace(/^.*[\\/]/, ''));
    if (svg !== undefined) node.source = svg;
  });
  return out;
}

/** Loads the missing SVGs with `read` (a path or URL, relative to the project) and fills them in. */
export async function resolveSources(scene: SceneV1, read: (href: string) => Promise<string> | string): Promise<SceneV1> {
  const missing = missingSources(scene);
  if (!missing.length) return scene;
  const files = new Map<string, string>();
  for (const href of missing) files.set(href, await read(href));
  return attachSources(scene, files);
}

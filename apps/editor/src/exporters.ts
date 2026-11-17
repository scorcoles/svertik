// Lo que sale del editor: SVG plano y JSON de la escena (el JS lo arma code.ts).
import { stripPackGeometry, type SceneV1 } from '@svertik/engine';

/**
 * JSON that stays readable without ballooning: anything whose one-line form fits in `width` characters
 * (a point, a Bézier segment, a modifier's params) goes on one line; only larger values open up.
 * `JSON.stringify(value, null, 2)` puts every number on its own line, which makes packed geometry huge.
 */
export function compactJSON(value: unknown, width = 100, indent = ''): string {
  const flat = JSON.stringify(value);
  if (flat === undefined || flat.length + indent.length <= width || value === null || typeof value !== 'object') return flat;
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    // Arrays of small items (numbers, points) fill lines instead of one item each.
    const items = value.map((v) => compactJSON(v === undefined ? null : v, width, inner));
    if (items.every((s) => !s.includes('\n'))) {
      const lines: string[] = [];
      let line = '';
      for (const item of items) {
        if (line && inner.length + line.length + item.length + 2 > width) { lines.push(line); line = ''; }
        line += (line ? ', ' : '') + item;
      }
      if (line) lines.push(line);
      return `[\n${lines.map((l) => inner + l).join(',\n')}\n${indent}]`;
    }
    return `[\n${items.map((s) => inner + s).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && typeof v !== 'function');
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJSON(v, width, inner)}`).join(',\n')}\n${indent}}`;
}

/** The scene as JSON, without what it can rebuild (the geometry of packs that keep their original). */
export const sceneJSON = (scene: SceneV1) => compactJSON(stripPackGeometry(scene));

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// File System Access API (Chromium): not in TypeScript's DOM lib yet.
interface SaveFilePickerOptions { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] }
type SavePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

/** True where the browser can save to a file the user picks (Chrome, Edge); elsewhere saving downloads. */
export const canPickFiles = () => typeof window !== 'undefined' && 'showSaveFilePicker' in window;

/**
 * Saves a project for real: into `handle` when there is one, otherwise into a file the user picks
 * (Save as). Returns the handle written, null if the user cancelled, or 'downloaded' where the browser
 * can't pick files and the text went out as a download.
 */
export async function saveProjectFile(text: string, suggestedName: string, handle: FileSystemFileHandle | null): Promise<FileSystemFileHandle | 'downloaded' | null> {
  if (!canPickFiles()) {
    download(suggestedName, text, 'application/json');
    return 'downloaded';
  }
  let target = handle;
  if (!target) {
    try {
      target = await (window as unknown as { showSaveFilePicker: SavePicker }).showSaveFilePicker({
        suggestedName,
        types: [{ description: 'svertik project', accept: { 'application/json': ['.json'] } }],
      });
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return null;
      throw error;
    }
  }
  const writable = await target.createWritable();
  await writable.write(text);
  await writable.close();
  return target;
}

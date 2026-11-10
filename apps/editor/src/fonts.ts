// Fuentes del editor para la primitiva Text: las dos que ya carga la interfaz (JetBrains Mono normal y
// negrita) y, en Chrome/Edge, las del sistema (API de fuentes locales, con permiso; se leen al usarlas).
import { hasFont, registerFont } from '@svertik/engine';
import regular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import bold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url';

export const BUNDLED: Record<string, string> = { 'JetBrains Mono': regular, 'JetBrains Mono Bold': bold };

interface LocalFont {
  fullName: string;
  blob(): Promise<Blob>;
}
const system = new Map<string, LocalFont>();

export const canUseSystemFonts = () => typeof window !== 'undefined' && 'queryLocalFonts' in window;

/** Carga las incluidas. */
export async function loadBundled() {
  await Promise.all(
    Object.entries(BUNDLED).map(async ([name, url]) => registerFont(name, await (await fetch(url)).arrayBuffer())),
  );
}

/** Pide permiso y lista las fuentes del sistema (sin leerlas aún). Devuelve sus nombres. */
export async function listSystemFonts(): Promise<string[]> {
  if (!canUseSystemFonts()) return [];
  const fonts = (await (window as unknown as { queryLocalFonts(): Promise<LocalFont[]> }).queryLocalFonts()) ?? [];
  for (const f of fonts) system.set(f.fullName, f);
  return [...system.keys()].sort((a, b) => a.localeCompare(b));
}

/** Se asegura de que una fuente está registrada (las del sistema se leen la primera vez que se usan). */
export async function ensureFont(name: string): Promise<boolean> {
  if (hasFont(name)) return true;
  const f = system.get(name);
  if (!f) return false;
  try {
    registerFont(name, await (await f.blob()).arrayBuffer());
    return true;
  } catch {
    return false;
  }
}

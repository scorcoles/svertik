// Lo que sale del editor: SVG plano y JSON de la escena (el JS lo arma code.ts).
import type { AnyScene } from '@svertik/engine';

export const sceneJSON = (scene: AnyScene) => JSON.stringify(scene, null, 2);

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

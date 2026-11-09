// Lo que sale del editor: SVG plano, JSON de la escena y un fragmento de código para el runtime.
import type { Scene } from '@svertik/engine';

export const sceneJSON = (scene: Scene) => JSON.stringify(scene, null, 2);

/** Fragmento listo para pegar: importa el motor, carga la escena y la pinta en un <svg>. */
export function codeSnippet(scene: Scene): string {
  const types = [...new Set(scene.stack.map((m) => m.type))];
  return `import { createEngine, ${types.join(', ')} } from '@svertik/engine';

const scene = ${JSON.stringify(scene)};

// Solo los modificadores que usa la escena.
const engine = createEngine([${types.join(', ')}]);
const live = engine.mount(document.querySelector('svg'), scene);

// Para animar: cambia parámetros y vuelve a pintar.
// scene.stack[0].params.phase = 90;
// live.update(scene);
`;
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

# svertik

Editor no destructivo de SVG: un SVG de partida y una pila de efectos (esferizar, agrietar…) que un motor en JS aplica en tiempo real. Exporta SVG plano o la configuración (JSON o código) para que el motor la reproduzca.

Un experimento de [VERTIK](https://www.vertik.net). Contexto: [docs/recap.md](docs/recap.md).

**Estado:** motor en marcha (seis deformadores); el editor, todavía no. Plan en [docs/PLAN.md](docs/PLAN.md).

## Probarlo

```bash
pnpm install
pnpm demos      # demo de la cadena en http://localhost:5173
pnpm test       # tests del motor
pnpm typecheck
```

## Uso del motor

```ts
import { builtins, createEngine } from '@svertik/engine';

const engine = createEngine(builtins);
const scene = {
  version: 1,
  source: '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>',
  stack: [
    { id: 'a', type: 'spherize', params: { strength: 0.6 } },
    { id: 'b', type: 'wave', params: { phase: 0 } },
  ],
};

engine.toSVG(scene);                    // SVG plano
const live = engine.mount(svgEl, scene); // en vivo
scene.stack[1].params.phase = 90;
live.update(scene);                      // solo se recalcula desde «wave»
```

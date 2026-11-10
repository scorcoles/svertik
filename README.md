# svertik

**Alpha 0.0.1.** Editor no destructivo de SVG, al modo de Cinema 4D: un SVG (o una primitiva, o un texto) y una pila de efectos que un motor en JS recalcula en vivo. Lo original nunca se toca. Se anima con una línea de tiempo y se lleva a cualquier web tal cual: SVG plano, el proyecto en JSON o código que reproduce los efectos y la animación.

Un experimento de [VERTIK](https://www.vertik.net). Contexto: [docs/recap.md](docs/recap.md) · Plan y estado: [docs/PLAN.md](docs/PLAN.md).

## Qué hace

- **Efectos** (más de 30), en cuatro familias:
  - **Deform:** Transform, Rotate 3D, Spherize, Twist, Bend, Taper, Shear, Wave, Ripple, Noise, Roughen, Melt, Cylinder, Perspective, Envelope, Path Wrap, Morph, Trim.
  - **Generate:** Crack, Damage, Clone, Mirror, Mosaic, Fractal, Glitch, Boolean.
  - **Effect** (por elementos, como MoGraph): Step, Stagger, Range, Field, Explosion.
  - **Style:** Color, Tint, Paint, Gradient, Opacity.
- **Primitivas** (rectángulo, elipse, polígono, estrella, línea, espiral, peón) y **texto** convertido en trazados (una pieza por letra).
- **Animación:** fotogramas clave en cualquier valor, curvas (también back, elastic, bounce) y presets de entrada de letras.
- **Proyectos `.svrtk`**: guardar (⌘S) y volver a abrir (⌘O o arrastrando el archivo).
- Solo lo que SVG puede expresar: lo que exporta es SVG estándar.

## Probarlo

```bash
pnpm install
pnpm editor     # el editor
pnpm test       # tests (motor, interfaz y editor)
pnpm typecheck
pnpm storybook  # componentes
```

## El motor, en una web

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

engine.toSVG(scene);                     // SVG plano
const live = engine.mount(svgEl, scene); // en vivo
scene.stack[1].params.phase = 90;
live.update(scene);                      // solo se recalcula desde «wave»
```

El editor genera este código (con la animación incluida) en su panel **Code**.

## Licencia

MIT. Las fuentes incluidas (JetBrains Mono) son OFL.

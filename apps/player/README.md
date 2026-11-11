# @svertik/player

El reproductor de svertik: el motor y nada más, para incrustar una escena en cualquier web.

```bash
pnpm --filter @svertik/player build   # → apps/player/dist
pnpm --filter @svertik/player dev     # la página de demostración
```

## Qué se baja

El reproductor pesa poco porque solo lleva lo que la escena usa:

| | gzip |
|---|---|
| el núcleo (siempre) | ~24 KB |
| cada efecto | +0,3 KB (los simples) … +18 KB (los que recortan polígonos) |
| el importador de SVG (si la escena trae SVG suelto) | +8,5 KB |
| `opentype.js` (si la escena tiene texto) | +77 KB |

`pnpm size` lo mide (y `pnpm size -- escena.json` dice lo que pesa una escena concreta).

## Cómo se usa

Lo más corto: se marca el `<svg>` y el reproductor lo encuentra solo.

```html
<svg id="logo" data-svertik="escena.json"></svg>
<script type="module" src="svertik-player.js"></script>
```

O con JavaScript, para controlarlo:

```js
import { play } from './svertik-player.js';

const player = await play(escena, '#logo');   // o un elemento
player.stop();                                 // para la animación
```

`play` devuelve `{ scene, svg, refresh, stop }`. `loadScene(url)` lee una escena (un `.svrtk` o el JSON de
la escena) y `mountAll()` reproduce todas las escenas marcadas de la página.

## La escena

Es el mismo JSON del editor (`SceneV2`): objetos, su pila de efectos, la animación y las interacciones.
Los efectos que nombra son los que se cargan (cada uno, un trozo aparte); los que no existen, avisan.

## Los trozos

En `dist/`:

- `svertik-player.js`: el núcleo.
- `effects/*.js`: un trozo por efecto. Solo se baja el que la escena usa (y el compartidos entre ellos).
- `manifest.json`: qué efecto está en qué trozo (lo usa `pnpm size`).

Al subirlo a un servidor, hay que subirlo todo (los trozos, aunque no se usen, están en el mismo sitio).

# svertik

Put a scene made in the [svertik editor](https://github.com/scorcoles/svertik) (or written
as JSON) on any web page and it plays. It carries the engine and nothing else, and the browser only downloads
the effects the scene uses.

## Quick start

Mark an `<svg>` with the scene's URL and load the script. It finds every marked `<svg>` on the page and plays it.

```html
<svg data-svertik="scene.json" style="width: 100%"></svg>
<script type="module" src="https://cdn.jsdelivr.net/npm/svertik/dist/svertik.js"></script>
```

Pin a version in production (`svertik@0.1.0/dist/…`). The scene can also go inline:

```html
<svg data-svertik-scene='{"version":1,"objects":[…]}'></svg>
```

## From JavaScript

```js
import { play, loadScene } from 'https://cdn.jsdelivr.net/npm/svertik/dist/svertik.js';

const scene = await loadScene('scene.json');
const player = await play(scene, '#logo');   // a selector, an <svg>, or a container (an <svg> is made inside)
player.stop();                               // stops the animation and removes its listeners
```

Or install it (`npm install svertik`) and `import { play } from 'svertik'` with a bundler.

- `play(scene, target, options?)` plays a scene and returns `{ scene, svg, refresh, stop }`. Options:
  `renderer` (`'auto'` by default: a canvas for frames with many shapes, SVG otherwise; or `'svg'`, `'canvas'`),
  `wire` (`true` toggles an outline view with the W key; off by default so an embedded scene takes no keys),
  `onFrame` (how long each frame took).
- `loadScene(url)` reads a scene: a project file or a bare scene, with the SVGs it keeps apart (`href`)
  resolved relative to the JSON.
- `mountAll(root?)` plays every marked `<svg>` under `root` (it runs by itself when the page loads).

The scene is the same JSON the editor saves (`SceneV1`): objects, their effect stacks, the animation and the
interactions, including pointer gestures such as Mouse Instance and Physics' click, drag and double-click.

## What is downloaded

| | gzip |
| --- | --- |
| the core (always: shapes, animation, filters) | ~64 KB |
| each effect the scene uses | +0.3 KB (simple deformers) … +18 KB (polygon clipping, soft bodies) |
| the SVG importer (only for scenes with raw SVG) | +8.5 KB |
| `opentype.js` (only for scenes with text) | +77 KB |

Fonts come from Fontsource (jsDelivr) when the scene has text.

## Hosting it yourself

Copy the whole `dist/` folder to your server and point the script at `svertik.js`. Keep the
`effects/` folder next to it: each effect is a chunk of its own, loaded with a relative URL when a scene
needs it.

## License

MIT

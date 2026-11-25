# Changelog

svertik is alpha software. Save project files regularly.

## 0.0.20

### Added

- **Recent** on the start screen: the scenes you changed in any tab, kept in the browser (IndexedDB) so they survive closing it, with when and whether they were saved to a file. Opening one goes on with the same entry; the twelve newest are kept. Also in svertik menu → **Open recent**, which asks about unsaved changes first.

### Changed

- Dropdowns keep their choice on one line, cut with an ellipsis when it is longer than the field. Spanish: "Documento actual" for the document's palette.

## 0.0.19

### Added

- The editor in Spanish: menus, panels, notices, the tour, Play and the help of every effect. It follows the browser's language, and svertik menu → Language switches it (remembered in the browser). Effect and parameter names stay in English, as in the docs and the scene JSON.

## 0.0.18

### Changed

- Physics is about four times faster on scenes with many bodies and no collisions between them (a 2,500-piece confetti poster: ~42 → ~11 ms per frame). Bodies that cannot touch anything are no longer placed every step, and the input's outlines are hashed once instead of on every frame.

## 0.0.17

### Added

- **Physics → Hover push** (`push`, px): in Play the pointer sweeps the bodies it passes near, without clicking; they go along with it and aside, and Air drag stops them. With Body collisions off it handles a couple of thousand pieces.

## 0.0.16

### Added

- **Document → Seed generator → On load** (`seedOnLoad`): Play draws a new seed every time the scene loads, so a generative piece comes out different on each visit. The editor and exports keep the stored seed.

## 0.0.15

### Added

- **Document → Fit → Adapt** (`fullViewport: "adapt"`): in Play the document takes the screen's shape around its centre, so `scene.width`/`height` and the physics walls follow the screen. **Content** (on by default) scales the content to fit; off, it keeps its size in the middle.
- **Document → Walls** (`physicsBounds`): the document's edges are walls for every Physics in the scene (with Adapt, the screen's edges). No more hidden rectangles to keep bodies in.

## 0.0.14

### Added

- Editor tour: the first time a scene is open, a few cards point at the canvas, tools, effects, stack, properties, document, timeline, Play and Export. Esc skips it, arrows move between steps, and **Take the tour** in the svertik menu brings it back.

## 0.0.13

### Added

- Link previews: a short link pasted in a chat app or a social site shows a card with the scene's name and a picture of the frame it was shared from (1200 × 630). Share draws the card and uploads it with the scene; the link's first picture stays.

## 0.0.12

### Added

- **Share link** in the svertik menu and in Export, besides Play's share button. A link shared from the editor opens the scene in the editor (`link.svertik.com/e/<id>`); one shared from Play opens it in Play (`link.svertik.com/<id>`). Both point to the same stored scene.

## 0.0.11

### Changed

- The editor no longer writes the scene into the address bar (`#s=…`). Your work is kept for the tab in session storage instead: it survives a reload and a duplicated tab gets a copy. Links (`#s=`, `#p=`, short links) still open, and leave the address bar once read. To pass a scene on, use Share.

## 0.0.10

### Added

- Short share links: in the hosted editor, Share stores the scene at `link.svertik.com` and copies a short link (`link.svertik.com/<id>`) that opens it in Play. The same scene always gets the same link, and scenes too big for a URL can now be shared too. The service is `apps/link`, a single PHP file that anyone can host; the editor uses it when built with `VITE_SHARE_URL`, and otherwise (or if the service cannot be reached) puts the scene in the link as before.
- Pack works on several selected objects in one step, and undoes in one step.
- Scenes are renamed in their own toolbar strip.

### Fixed

- Document controls no longer overlap the toolbar menus, and the document toolbar shows simpler metadata.

## 0.0.9

### Added

- Perspective shows a 4 × 4 grid through its quad on the canvas, mapped with the effect's own homography, as a reference for the receding lines.
- **Each** effect (Effect menu), like Step: the effects nested in it apply to every element separately, with formulas that read `element.index`, `count`, `row`, `column`, `u`, `v`, `distance` (0 at the centre, 1 for the furthest) and `random`. A **Shape** inside it rebuilds each Clone copy with other values for the shape's own parameters (Inner = `19 * (1 - element.distance)` closes the holes of a donut grid towards the edges).

### Changed

- Effect menus regrouped by purpose: Deform (now also Crack, Radial Cut, Damage, Mosaic, Voronoi, Boolean, Metaball), Repeat (Clone, Mirror, Fractal, Particles), Draw (tone to marks and new lines: Halftone, Wave Lines, Vector Grain, Crosshatch, Dithering, Contour, Pixelate, Flow Field, Network, Weave, String Art, Spirograph, Connect, Trace, Random Wave/Bars), Effect, Motion (Gravity, Physics, Rigid Body, Soft Body, Rope, Explosion, Follow Path, Look At), Style, Glitch and Filters. Utils keeps compositions, Instance, Mouse Instance, Effector, Connector and Tracer.
- Long parameter labels wrap to a second line instead of being cut.
- The On checkbox is gone from effect and Effector panels: the stack's toggle and eye already do it.

### Fixed

- Light theme: accent text, icons and focus lines (props, ƒx, links, selected items) use a deeper teal with enough contrast; the bright turquoise stays for fills.
- The node-level `each` of 0.0.8 becomes an Each › Shape; the editor converts saved scenes when it opens them.

## 0.0.8

### Added

- **Each**: per-copy values for a shape's own parameters. When the first effect is a Clone, every copy is built with its Each values, numbers or formulas that read `element.index`, `count`, `row`, `column`, `u`, `v`, `distance` (0 at the centre, 1 for the furthest copy) and `random`. For example, a grid of donuts whose hole closes towards the edges: Inner = `19 * (1 - element.distance)`. Editor: an Each section in the shape's panel. Validation warns when Each cannot apply.

## 0.0.7

### Changed

- Donut: its panel section is titled Donut radius, and its parameters are labelled Outer and Inner.

## 0.0.6

### Added

- **Compress** deformer (`compress`, Deform menu): crowds the drawing towards a center line along one axis, or spreads it away with a negative Strength, while both ends of the box stay put and the order of points is kept. The center moves from Start at one edge to End at the other, so one Clone grid can carry a dense band that sweeps diagonally row by row. With Rigid Pieces first, marks keep their shape and pile into a solid bar. 87 modifiers in total.
- Compress icon, reference page and catalog entry.
- `pnpm run deploy`: publishes the hosted editor from a clean, pushed `main` after the tests, then checks the live version.
- Compress handles on the canvas: the center line from Start to End, the guides the marks follow, and handles to slide Start and End along their edges and to set Strength beside the center line.

### Changed

- The editor is no longer published to GitHub Pages; GitHub Actions only run the tests.
- Compress parameters are labelled Start and End.

### Fixed

- Saving the scene in the editor URL no longer raises an unhandled error when compression fails or is cut short; the URL is left as it was.
- Deformers after a Clone (Compress, Gather, Spherize and the rest) subdivided every copy at the scale of the original shape, not of the whole grid: a grid of small marks was cut into hundreds of points each. A 44 × 34 grid with Compress goes from about 200 ms to about 8 ms per frame, and its SVG from 6.5 MB to under 0.4 MB.

## 0.0.5

- Non-destructive SVG editing with 86 modifiers, parametric expressions, and animation timelines.
- Editable paths with cubic Bézier handles and canvas text editing.
- Light and dark workspaces with resizable Code, Notes, Debug, and Timeline panels.
- Commit Mono throughout the interface and bundled demo text.
- Twelve scenes available from the demo menu, with standalone playback and editable shared links.
- Updated pawn tool icon and favicon.
- Export SVG, PNG, MP4, project JSON, or runtime code.

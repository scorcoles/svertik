# Changelog

svertik is alpha software. Save project files regularly.

## Unreleased

### Added

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

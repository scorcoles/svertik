# Changelog

svertik is alpha software. Save project files regularly.

## Unreleased

### Added

- Compress handles on the canvas: the center line from Start to End, the guides the marks follow, and handles to slide Start and End along their edges and to set Strength beside the center line.

### Changed

- Compress parameters are labelled Start and End.

### Fixed

- Deformers after a Clone (Compress, Gather, Spherize and the rest) subdivided every copy at the scale of the original shape, not of the whole grid: a grid of small marks was cut into hundreds of points each. A 44 × 34 grid with Compress goes from about 200 ms to about 8 ms per frame, and its SVG from 6.5 MB to under 0.4 MB.

## 0.0.6

### Added

- **Compress** deformer (`compress`, Deform menu): crowds the drawing towards a center line along one axis, or spreads it away with a negative Strength, while both ends of the box stay put and the order of points is kept. The center moves from Start at one edge to End at the other, so one Clone grid can carry a dense band that sweeps diagonally row by row. With Rigid Pieces first, marks keep their shape and pile into a solid bar. 87 modifiers in total.
- Compress icon, reference page and catalog entry.
- `pnpm run deploy`: publishes the hosted editor from a clean, pushed `main` after the tests, then checks the live version.

### Changed

- The editor is no longer published to GitHub Pages; GitHub Actions only run the tests.

### Fixed

- Saving the scene in the editor URL no longer raises an unhandled error when compression fails or is cut short; the URL is left as it was.

## 0.0.5

- Non-destructive SVG editing with 86 modifiers, parametric expressions, and animation timelines.
- Editable paths with cubic Bézier handles and canvas text editing.
- Light and dark workspaces with resizable Code, Notes, Debug, and Timeline panels.
- Commit Mono throughout the interface and bundled demo text.
- Twelve scenes available from the demo menu, with standalone playback and editable shared links.
- Updated pawn tool icon and favicon.
- Export SVG, PNG, MP4, project JSON, or runtime code.

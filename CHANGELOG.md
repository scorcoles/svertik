# Changelog

svertik is alpha software. Save project files regularly.

## 0.0.29

### Added

- Envelope and Perspective are edited on a picture in the panel: the box at rest, the warped grid the effect makes (Envelope's control net too) and its points to drag (⇧ locks an axis, double-click resets one, Alt+click sets a key; animated points turn into diamonds, filled where there is a key). The canvas handles of every point parameter (centres, Envelope and Perspective points…) do the same: diamonds when animated, Alt+click for a key. Their numbers are one click away (Show values).
- Presets for effects, as live thumbnails: selecting one of 57 effects (deformers, glitches, generators, colour and finish, Particles…) shows a few ready looks above its parameters, drawn on the selected object itself. Hover one to see it move (presets with motion animate); click to apply it. A preset sets its values and puts the rest back to their defaults, keeping where the effect sits and what it is linked to (centres, targets, the clock, seeds); the one the effect matches is marked. They are ordinary values afterwards: tweak away. Particles' motion presets joined them. View › Show presets hides them (on by default).

## 0.0.28

### Added

- Rigid Body › Pin: holds one point of the body where it is (Point, fractions of its box; Bones' Start by default), so it turns about it like a hinge: a pendulum, a door, arms rooted at their base. Contacts turn a pinned body instead of shifting it.
- Wire in the players (Play, shared links, the embedded player) shows Bones' chains too, as the editor does. The evaluated document gives them as `doc.guides()`.

### Fixed

- Bones' guides in Wire follow the body when Physics (or any effect of a group above) moves or turns it.
- Physics restarted its world on every frame when a body's shape was animated (Bones, Wave, a formula on its size…), so animated bodies never collided: it now goes on, swapping in the new shapes.
- In a widened side panel, labels get a wider column (no more "Acceleratio / n") and sliders, dropdowns and formulas take the room.

## 0.0.27

### Added

- Bones: each bone has its own length (Length 1–6, in the Chain group; relative to the others, sharing the Start–End distance), so joints go where they are needed. IK takes the lengths into account.
- Bones on the canvas: with the effect selected, its chain is an actuator and each joint a handle that turns the bone ending there (⇧ snaps to 15°). In Wire, every object's bones show at the playhead, formulas resolved.

### Changed

- Bones bends each joint round an arc tangent to both bones, like Bend: the thickness is kept, the inner side compresses instead of folding over and the outer side stays round. Smooth sets how long the arc is. Saved scenes keep their angles, but their joints now look like this.
- The version and the number of modifiers moved from the status bar to the end of the svertik menu, so the status bar keeps to one line.

### Fixed

- Actuators and guides froze while playing when their values were animated (every frame cancelled the pending redraw); they now follow playback.

## 0.0.26

### Added

- `scene.object.<name>.<value>` in formulas: read any other object of the scene by its system name, made from its display name ("Esféra Roja copia" → `esfera_roja_copia`): its placement, opacity, shape values, props, and its effects by name, nested (`scene.object.esfera.grid.each.transform.rotation`). Formulas that read each other across objects resolve in passes; renaming an object or an effect rewrites the formulas that use it, in the same undo step.
- The Console, in place of Debug (status bar → Console): a shell like a browser's. Type an expression and see its value at the current time; the editor's errors and warnings and the stopwatch's measurement come in the same stream. Pin expressions to keep them live on top while the scene plays; ↑/↓ for history; text zoom. Commands: `play()`, `pause()`, `stop()`, `goto(s)`, `frame(n)`, `select(name)`, `set(name.value, n)`, `seed(n?)`, `undo()`, `redo()`, `objects()`, `pin()`, `unpin()`, `clear()`, `help()`. It docks below the canvas or as a column on the right.
- Suggestions while writing formulas, in the console and the formula editor: after `scene.`, `scene.object.` (objects, then their values and effects), `this.`, `element.` inside Each, and functions. ↑/↓, Tab or Enter, Escape; Ctrl+Space asks for them. Inside a call, parameter help shows its signature with the argument being written (`clamp(x, min, max)`, `scene.countDown(seconds)`).

### Changed

- The side panel (Stack, Document) can be made wider or narrower by dragging its left edge; double-click for the usual width. The browser remembers it.
- Notes can dock on the right too, sharing the column with the Console.

### Fixed

- An object whose position, scale, rotation or opacity holds a formula showed empty fields in the inspector: it now shows the formula (a click opens it in the formula editor, ƒx turns it back into a number), and dragging the label no longer overwrites it.
- The console colours its commands and their arguments as such, not as unknown names; suggestions follow the console's text zoom.

## 0.0.25

### Added

- The formula editor: every ƒx field (parameters, document variables, props, Each › Shape values) shows its formula on one line, and a click opens it large below the canvas to write it over several lines; turning a field into a formula opens it there directly, ready to type. Its title says where it is (Object › Effect › field). It edits that field live, shows whether it is valid, takes names from the ƒx reference, and Escape goes back to the field. Formulas can now be up to 4096 characters.
- Formulas are coloured in the formula editor: functions, variable chains (`scene.mouse.posX`, `element.random`, `this.radius`), numbers, operators, brackets by how deeply they nest, and a wavy underline under names the language doesn't know.

## 0.0.24

### Added

- `scene.device.tiltX`, `scene.device.tiltY` and `scene.device.active` in formulas: how a phone or tablet is tilted in Play (−1…1 from how it was held, following the screen's orientation), and whether a motion sensor is feeding them. iOS asks for permission on the first tap. The ƒx reference lists them under Device. Example: a grid of eyes that look where you tip the phone, the mouse on a computer.

### Changed

- A scene opened from a file without a name takes the file's name (without .json) instead of "untitled".
- Projects are .json files only: the old .svrtk extension is no longer offered or recognised by the editor and the CLI (the soft body sample is now `demos/softbody-material.json`).

## 0.0.23

### Changed

- Faster scenes driven by the pointer or by formulas: an effect that reads another object (a Clone placed inside a hidden shape) is no longer redone every frame while that object stays the same; Network finds where each link leaves its node exactly instead of sampling, and keeps only the nearest neighbours instead of sorting them all; Play only rewrites the paths that changed. A dense 8-layer network ring under a hover lens went from about 196 ms to 27 ms per frame.

- Opening a scene with more than two layers (a file, a demo, a link, a recent one) shows the Layers panel, open; your saved preference for other scenes stays as it was.

### Fixed

- A hidden object's row in the Stack no longer lets the rows scrolling under it show through when it sticks to the top; only its contents are dimmed, and its eye stays clear.

## 0.0.22

### Changed

- Resizing a primitive on the canvas changes its size values (width, height, radius, size, a Path's points…) instead of its scale, so formulas that read them keep working (a Donut's `this.radius - 50` stays a 50 px ring). It grows around the pivot from a corner, or from the opposite side from an edge; the label by the pointer shows its size. Shapes sized by one value still stretch when pulled on one axis; several objects, groups and imported SVGs still scale. Scale stays in the inspector.

## 0.0.21

### Added

- `this.name` in formulas: read another value of the same object or effect, e.g. a Donut's Inner as `this.radius - 50` keeps the ring 50 px wide. It reads shape parameters (also those left at their default), placement, opacity and an effect's own parameters; formulas that read each other resolve in order, cycles use their fallback. The ƒx reference lists the `this.*` names of the selection.
- **Values for formulas** in an effect's Info tab and in an object's inspector: every `this.name` it can read, with its label and current value (also defaults); a click copies the reference.

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

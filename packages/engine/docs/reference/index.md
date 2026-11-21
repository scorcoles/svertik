# Reference

Every built-in effect and primitive of `@svertik/engine`, generated from their schemas. Each page lists the parameters (type, default, range) and a JSON snippet for a scene.

## Effects

### Deform

| Effect | Type | What it does |
| --- | --- | --- |
| [Transform](effects/transform.md) | `transform` | Moves, rotates and scales the whole drawing, around a pivot. |
| [Rotate 3D](effects/rotate3d.md) | `rotate3d` | Rotates the drawing in 3D (X, Y, Z) around a pivot and projects it with perspective. |
| [Spherize](effects/spherize.md) | `spherize` | Bulges (strength > 0) or pinches (strength < 0) what falls inside a circle. |
| [Rigid Pieces](effects/rigidpieces.md) | `rigidpieces` | Blends downstream deformation between pointwise bending and whole-piece rigid motion. |
| [Twist](effects/twist.md) | `twist` | A whirl: turns more the closer a point is to the center, and nothing at the edge of the radius. |
| [Bend](effects/bend.md) | `bend` | Curves the drawing like a sheet: the chosen axis becomes an arc of `angle` degrees. |
| [Bones](effects/bones.md) | `bones` | A chain of 2 to 6 equal bones from Start to End. |
| [Taper](effects/taper.md) | `taper` | Narrows (or widens) one end: the width across the axis changes along it. |
| [Gather](effects/gather.md) | `gather` | Squeezes the drawing towards one side along an axis, by an amount that changes across it: Start applies at one edge (top for axis x, left for axis y), End at the other, positive towards the left/top and negative towards the right/bottom. |
| [Rope](effects/rope.md) | `rope` | Open paths hang as ropes pinned at both ends: a Verlet chain with the drawn length, Gravity, Wind and Damping, that settles and swings. |
| [Shear](effects/shear.md) | `shear` | Slants the drawing: X shifts with the height and Y with the width, around the center. |
| [Wave](effects/wave.md) | `wave` | Makes the drawing wavy: moves each point across the direction of the wave. |
| [Ripple](effects/ripple.md) | `ripple` | Concentric waves from a point, like a drop in water; they fade with the distance. |
| [Noise](effects/noise.md) | `noise` | Moves each point with smooth noise: an organic, hand-drawn look. |
| [Roughen](effects/roughen.md) | `roughen` | Fractal edges on any drawing: `organic` tears the outline (midpoint displacement, like a coastline or torn paper); `koch` turns each segment into a Koch peak, `iterations` times. |
| [Round Corners](effects/roundcorners.md) | `roundcorners` | Rounds the corners: wherever the path changes direction sharply, it cuts both segments and joins them with an arc of `radius` px (or a straight cut, `chamfer`). |
| [Spikes](effects/spikes.md) | `spikes` | Regular spikes along the outline: `count` tips per path, evenly spaced, `height` px out (negative: inwards). |
| [Melt](effects/melt.md) | `melt` | The drawing drips downwards, more the lower it is; noise decides where the drops fall. |
| [Cylinder](effects/cylinder.md) | `cylinder` | Wraps the drawing around a vertical cylinder (like the label of a can). |
| [Perspective](effects/perspective.md) | `perspective` | Free perspective: each corner of the drawing goes where you drag its handle. |
| [Envelope](effects/envelope.md) | `envelope` | Envelope distortion: drag the nine points of the mesh and the drawing bends with it. |
| [Path Wrap](effects/pathwrap.md) | `pathwrap` | Wraps the drawing along another object's path (its longest one). |
| [Morph](effects/morph.md) | `morph` | Morphs this drawing into another object's shape. |
| [Trim](effects/trim.md) | `trim` | Trims paths (draws them): only the part of each path between Start and End (fractions of its length) remains, shifted by Offset; closed paths wrap around. |

### Generate

| Effect | Type | What it does |
| --- | --- | --- |
| [Crack](effects/crack.md) | `crack` | Branching cracks from an impact point. |
| [Damage](effects/damage.md) | `damage` | Wear: cracks coming in from the edges, chips on the edge and specks, cut as holes. |
| [Clone](effects/clone.md) | `clone` | Duplicates the drawing in a grid, concentric rings or a line, around the original. |
| [Particles](effects/particles.md) | `particles` | Seeded particle generator that uses the complete source object as its particle: geometry, colours and relative proportions are preserved. |
| [Mirror](effects/mirror.md) | `mirror` | Reflects the drawing on an axis at a fraction of its box. |
| [Mosaic](effects/mosaic.md) | `mosaic` | Cuts the drawing into tiles on a grid of columns × rows, with a gutter and a rotated grid: rectangles, triangles, hexagons, or one shape per cell (circle, polygon, star or another object). |
| [Voronoi](effects/voronoi.md) | `voronoi` | Turns filled artwork into stable jittered cells; optional drift morphs the shared tessellation without edge cells popping in or out. |
| [Fractal](effects/fractal.md) | `fractal` | Repeats the drawing inside itself, smaller each time (an iterated function system): Sierpinski triangle, Sierpinski carpet, a branching tree or a spiral. |
| [Halftone](effects/halftone.md) | `halftone` | A halftone screen: the drawing sampled on a rotated grid where each cell becomes a mark (circle, square, diamond, line or ring) sized by the tone. |
| [Vector Grain](effects/vectorgrain.md) | `vectorgrain` | Vector stipple that gathers at the edges, as real marks (not the SVG Grain filter). |
| [Crosshatch](effects/crosshatch.md) | `crosshatch` | Pen-drawing shading with parallel lines: up to four layers of hatching (at Angle, then +90°, +45° and −45°), each drawn only where the tone is darker than its threshold, so dark areas get denser cross-hatching. |
| [Dithering](effects/dithering.md) | `dithering` | Converts sampled tone into a binary grid of vector cells. |
| [Contour](effects/contour.md) | `contour` | Draws vector isolines through equal tones in the input, like elevation lines on a map. |
| [Boolean](effects/boolean.md) | `boolean` | Boolean operations between elements (a group's children, a Clone's copies…): union, subtract (the front ones cut the back one), intersect or exclude. |
| [Metaball](effects/metaball.md) | `metaball` | Smoothly fuses nearby forms with stable multiway joins and bounded field sampling. |
| [Pixelate](effects/pixelate.md) | `pixelate` | Everything made of little squares, like pixel art: a grid of `size` px where each cell takes the colour of what is on top at its centre (stroke or fill). |

### Glitch

| Effect | Type | What it does |
| --- | --- | --- |
| [Slices](effects/slices.md) | `slices` | Glitch: horizontal bands of the drawing shifted sideways, each one an element. |
| [Blocks](effects/blocks.md) | `blocks` | Glitch: rectangular blocks cut out and shown displaced, leaving their gap. |
| [Scanlines](effects/scanlines.md) | `scanlines` | Glitch: scan lines across the drawing, clipped to it. |
| [Streaks](effects/streaks.md) | `streaks` | Glitch: streaks escaping sideways from the real edge of the shape. |
| [RGB Split](effects/rgbsplit.md) | `rgbsplit` | Chromatic separation with two modes: Channels (default) extracts the source RGB plates, shifting red and blue along Angle while green stays in place. |

### Effect

| Effect | Type | What it does |
| --- | --- | --- |
| [Step](effects/step.md) | `step` | Incremental effector: applies the modifiers nested in it to each element separately, with their numbers multiplied by the element's position. |
| [Oscillate](effects/oscillate.md) | `oscillate` | Periodic modulation of nested effects: sine, triangle, square or saw. |
| [Wiggle](effects/wiggle.md) | `wiggle` | Smooth seeded random modulation of nested effects. |
| [Pulse](effects/pulse.md) | `pulse` | Repeated pulses of nested effects, from neutral to full strength and back. |
| [Shake](effects/shake.md) | `shake` | A seeded one-shot impact that loses strength and returns exactly to neutral at Duration. |
| [Stagger](effects/stagger.md) | `stagger` | Each element makes its own transition, with its curve, a little after the previous one. |
| [Range](effects/range.md) | `range` | Selects elements, text words/lines or Clone grid rows/columns for nested effects. |
| [Field](effects/field.md) | `field` | Field selector: the nested effects act more or less on each element depending on where it is relative to a shape (ellipse, plane or box). |
| [Explosion](effects/explosion.md) | `explosion` | Each element (a piece of Damage or Crack, a Mosaic tile, a Clone copy, a letter…) flies away from a centre: it moves out, spins and shrinks a little, each in its own way. |
| [Gravity](effects/gravity.md) | `gravity` | Drops each element onto a virtual floor, rigid by default or elastic when it carries Soft Body material, inheriting velocity and spin from Explosion or Rigid body. |
| [Soft Body](effects/softbody.md) | `softbody` | Elastic material for open fibres and closed bodies. |
| [Physics](effects/physics.md) | `physics` | A deterministic 2D dynamics simulation for a group; Rigid body children can attract toward their solid geometry. |
| [Rigid body](effects/rigidbody.md) | `rigidbody` | Sets initial motion, immovability, or an attractor field toward the body's solid geometry. |

### Style

| Effect | Type | What it does |
| --- | --- | --- |
| [Color](effects/color.md) | `color` | Assign or vary colour per element: `solid` assigns the selected colour to fill, stroke or both; `shift` rotates the hue and adjusts saturation and lightness; `gradient` spreads a gradient across the elements; `random` varies them at random; `palette` picks one exact colour from an editable list for each element, including each Clone copy. |
| [Tint](effects/tint.md) | `tint` | Pushes the colour towards a target colour. |
| [Paint](effects/paint.md) | `paint` | Fill and stroke: lays a colour over the fill (amount 1 replaces it) and adds or changes the stroke: width, opacity, joins, caps, dashes and paint order. |
| [Gradient](effects/gradient.md) | `gradient` | A gradient on the fill or the stroke of each shape: linear (with an angle) or radial (centre, radius and focus), with an optional middle colour (`via`). |
| [Feather](effects/feather.md) | `feather` | Softens a solid fill with a radial fade and slightly expands the shape to preserve its opaque centre. |
| [Mask](effects/mask.md) | `mask` | Native SVG mask: the object only shows where another object lets it (`source`). |
| [Opacity](effects/opacity.md) | `opacity` | Makes the drawing transparent. |

### Filters

| Effect | Type | What it does |
| --- | --- | --- |
| [Shadow](effects/shadow.md) | `shadow` | Drop shadow: a blurred, shifted copy behind the drawing, in one colour. |
| [Blur](effects/blur.md) | `blur` | Blur in both directions or only one (motion blur), on the whole drawing or only in an area. |
| [Glow](effects/glow.md) | `glow` | A coloured halo around the drawing, behind it. |
| [Grain](effects/grain.md) | `grain` | Fine noise over the drawing (only inside it), like film or print grain. |
| [Displace](effects/displace.md) | `displace` | The edges tremble or ripple with organic noise. |
| [Bevel](effects/bevel.md) | `bevel` | Relief: light and shade on the edges, as if the drawing had volume. |
| [Thicken](effects/thicken.md) | `thicken` | Makes the drawing thicker (or thinner with a negative amount), or adds a coloured outline around it like a sticker (`outline`). |
| [Tone](effects/tone.md) | `tone` | Tone: posterize (few levels per channel, like a poster), duotone (shadows in one colour and lights in another) or invert the colours. |

### Utils

| Effect | Type | What it does |
| --- | --- | --- |
| [Follow Path](effects/followpath.md) | `followpath` | Moves the whole object, without bending it, to a point on another object's path: `position` is the fraction of the way (0 start, 1 end; closed paths loop). |
| [Connect](effects/connect.md) | `connect` | Joins two objects with a line that follows them: the drawing becomes the stretch from `from` to `to` (their anchors, fractions of their box), keeping its style. |
| [Network](effects/network.md) | `network` | Draws elastic, breakable links between each shape and its nearest neighbours. |
| [Trace](effects/trace.md) | `trace` | A trail: the drawing becomes the path another object's center followed during the last `length` seconds of the animation, keeping its style. |
| [Look At](effects/lookat.md) | `lookat` | Turns the object so that it faces another one (its center), around `pivot`. |

## Primitives

| Primitive | Shape | What it is |
| --- | --- | --- |
| [Rectangle](shapes/rectangle.md) | `rectangle` | A rectangle, with optional rounded corners. |
| [Ellipse](shapes/ellipse.md) | `ellipse` | An ellipse (a circle when width and height match). |
| [Donut](shapes/donut.md) | `donut` | A ring: a circle of Outer radius with a round hole of Inner radius, both exact curves. |
| [Polygon](shapes/polygon.md) | `polygon` | A regular polygon with any number of sides. |
| [Star](shapes/star.md) | `star` | A star with any number of points and an inner radius (2 points make a needle or a diamond). |
| [Cross](shapes/cross.md) | `cross` | A filled plus sign: Size controls the overall extent and Width the thickness of its arms, clamped to Size. |
| [Arrow](shapes/arrow.md) | `arrow` | A continuous arrow outline with independent Start head and End head selectors: none, triangular, V, square or round. |
| [Line](shapes/line.md) | `line` | A straight line, by length and angle. |
| [Spiral](shapes/spiral.md) | `spiral` | An Archimedean spiral, by radius and number of turns. |
| [Text](shapes/text.md) | `text` | Text turned into outlines, one piece per letter (so Step, Stagger and Range can treat letters, words and lines separately). |
| [Pawn](shapes/pawn.md) | `pawn` | A chess pawn: svertik's test shape, with curves and straight parts. |

# Reference

Every built-in effect and primitive of `@svertik/engine`, generated from their schemas. Each page lists the parameters (type, default, range) and a JSON snippet for a scene.

## Effects

### Deform

| Effect | Type | What it does |
| --- | --- | --- |
| [Transform](effects/transform.md) | `transform` | Moves, rotates and scales the whole drawing, around a pivot. |
| [Rotate 3D](effects/rotate3d.md) | `rotate3d` | Rotates the drawing in 3D (X, Y, Z) around a pivot and projects it with perspective. |
| [Spherize](effects/spherize.md) | `spherize` | Bulges (strength > 0) or pinches (strength < 0) what falls inside a circle. |
| [Twist](effects/twist.md) | `twist` | A whirl: turns more the closer a point is to the center, and nothing at the edge of the radius. |
| [Bend](effects/bend.md) | `bend` | Curves the drawing like a sheet: the chosen axis becomes an arc of `angle` degrees. |
| [Bones](effects/bones.md) | `bones` | A chain of 2 to 6 equal bones from Start to End. |
| [Taper](effects/taper.md) | `taper` | Narrows (or widens) one end: the width across the axis changes along it. |
| [Shear](effects/shear.md) | `shear` | Slants the drawing: X shifts with the height and Y with the width, around the center. |
| [Wave](effects/wave.md) | `wave` | Makes the drawing wavy: moves each point across the direction of the wave. |
| [Ripple](effects/ripple.md) | `ripple` | Concentric waves from a point, like a drop in water; they fade with the distance. |
| [Noise](effects/noise.md) | `noise` | Moves each point with smooth noise: an organic, hand-drawn look. |
| [Roughen](effects/roughen.md) | `roughen` | Fractal edges on any drawing: `organic` tears the outline (midpoint displacement, like a coastline or torn paper); `koch` turns each segment into a Koch peak, `iterations` times. |
| [Round Corners](effects/roundcorners.md) | `roundcorners` | Rounds the corners: wherever the path changes direction sharply, it cuts both segments and joins them with an arc of `radius` px (or a straight cut, `chamfer`). |
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
| [Clone](effects/clone.md) | `clone` | Duplicates the drawing in a grid, a circle or a line, around the original. |
| [Mirror](effects/mirror.md) | `mirror` | Reflects the drawing on an axis at a fraction of its box. |
| [Mosaic](effects/mosaic.md) | `mosaic` | Cuts the drawing into tiles on a grid of columns × rows, with a gutter and a rotated grid: rectangles, triangles, hexagons, or one shape per cell (circle, polygon, star or another object). |
| [Fractal](effects/fractal.md) | `fractal` | Repeats the drawing inside itself, smaller each time (an iterated function system): Sierpinski triangle, Sierpinski carpet, a branching tree or a spiral. |
| [Boolean](effects/boolean.md) | `boolean` | Boolean operations between elements (a group's children, a Clone's copies…): union, subtract (the front ones cut the back one), intersect or exclude. |
| [Metaball](effects/metaball.md) | `metaball` | The elements melt into each other like drops when they get close: each one gives its signed distance, joined with a smooth union of reach `reach` (px). |
| [Pixelate](effects/pixelate.md) | `pixelate` | Everything made of little squares, like pixel art: a grid of `size` px where each cell takes the colour of what is on top at its centre (stroke or fill). |

### Glitch

| Effect | Type | What it does |
| --- | --- | --- |
| [Slices](effects/slices.md) | `slices` | Glitch: horizontal bands of the drawing shifted sideways, each one an element. |
| [Blocks](effects/blocks.md) | `blocks` | Glitch: rectangular blocks cut out and shown displaced, leaving their gap. |
| [Scanlines](effects/scanlines.md) | `scanlines` | Glitch: scan lines across the drawing, clipped to it. |
| [Streaks](effects/streaks.md) | `streaks` | Glitch: streaks escaping sideways from the real edge of the shape. |
| [RGB Split](effects/rgbsplit.md) | `rgbsplit` | RGB split: two coloured copies of the drawing shifted to each side (Distance, along Angle). |

### Effect

| Effect | Type | What it does |
| --- | --- | --- |
| [Step](effects/step.md) | `step` | Incremental effector: applies the modifiers nested in it to each element separately, with their numbers multiplied by the element's position. |
| [Stagger](effects/stagger.md) | `stagger` | Each element makes its own transition, with its curve, a little after the previous one. |
| [Range](effects/range.md) | `range` | Range selector: picks which elements (letters, words, lines, copies, tiles…) get the nested effects, and how much, by their order. |
| [Field](effects/field.md) | `field` | Field selector: the nested effects act more or less on each element depending on where its centre is relative to a shape (circle, plane or box). |
| [Explosion](effects/explosion.md) | `explosion` | Each element (a piece of Damage or Crack, a Mosaic tile, a Clone copy, a letter…) flies away from a centre: it moves out, spins and shrinks a little, each in its own way. |

### Style

| Effect | Type | What it does |
| --- | --- | --- |
| [Color](effects/color.md) | `color` | Colour variation per element: `shift` rotates the hue and adjusts saturation and lightness; `gradient` spreads a gradient across the elements; `random` varies them at random. |
| [Tint](effects/tint.md) | `tint` | Pushes the colour towards a target colour. |
| [Paint](effects/paint.md) | `paint` | Fill and stroke: lays a colour over the fill (amount 1 replaces it) and adds or changes the stroke: width, opacity, joins, caps, dashes and paint order. |
| [Gradient](effects/gradient.md) | `gradient` | A gradient on the fill or the stroke of each shape: linear (with an angle) or radial (centre, radius and focus), with an optional middle colour (`via`). |
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
| [Trace](effects/trace.md) | `trace` | A trail: the drawing becomes the path another object's center followed during the last `length` seconds of the animation, keeping its style. |
| [Look At](effects/lookat.md) | `lookat` | Turns the object so that it faces another one (its center), around `pivot`. |

## Primitives

| Primitive | Shape | What it is |
| --- | --- | --- |
| [Rectangle](shapes/rectangle.md) | `rectangle` | A rectangle, with optional rounded corners. |
| [Ellipse](shapes/ellipse.md) | `ellipse` | An ellipse (a circle when width and height match). |
| [Polygon](shapes/polygon.md) | `polygon` | A regular polygon with any number of sides. |
| [Star](shapes/star.md) | `star` | A star with any number of points and an inner radius (2 points make a needle or a diamond). |
| [Line](shapes/line.md) | `line` | A straight line, by length and angle. |
| [Spiral](shapes/spiral.md) | `spiral` | An Archimedean spiral, by radius and number of turns. |
| [Text](shapes/text.md) | `text` | Text turned into outlines, one piece per letter (so Step, Stagger and Range can treat letters, words and lines separately). |
| [Pawn](shapes/pawn.md) | `pawn` | A chess pawn: svertik's test shape, with curves and straight parts. |

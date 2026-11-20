# Voronoi

Turns filled artwork into a tessellation of vector cells. Each cell is clipped to the input silhouette and is emitted as its own element, so later effects such as Step, Color, Explosion or Physics can address cells individually.

The cell centers use a regular grid with seeded jitter. A smaller Cell size creates more detail and more paths. Large inputs automatically use a coarser grid above about 1,000 sites to keep generation responsive. Open paths without a fill are not converted.

| Parameter | Type | Default | Range | Description |
|---|---|---:|---:|---|
| Cell size | number | 32 | 8–200 px | Approximate distance between cell centers. |
| Jitter | number | 0.8 | 0–1 | Moves each center by up to half a cell. |
| Color | enum | original | original, ink | Keep the sampled source paint or use one solid ink. |
| Ink | color | `#111111` | — | Cell fill when Color is Ink. |
| Seed | seed | 1 | — | Changes the deterministic cell layout. |

Gradients are sampled at each cell center and become solid cell fills. Voronoi generates geometry; use Color or other style effects afterwards to change its appearance.

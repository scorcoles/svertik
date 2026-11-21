# Voronoi

Turns filled artwork into a tessellation of vector cells. Each cell is clipped to the input silhouette and is emitted as its own element, so later effects such as Step, Color, Explosion or Physics can address cells individually. The optional Motion controls move the sites smoothly over time and rebuild the complete tessellation on every sample. Adjacent cells therefore keep shared borders as they change shape; the motion is deterministic at any time and can be scrubbed or rendered directly.

The cell centers use a regular grid with seeded jitter. For a fixed input silhouette, the set of sites is chosen once from points inside the filled region and stays fixed during motion. Sites are kept inside the silhouette as they drift, so cells do not enter or disappear at the boundary. Their clipped Voronoi regions cover the source without gaps before later effects are applied. A smaller Cell size creates more detail and more paths. Large inputs automatically use a coarser grid above about 1,000 sites to keep generation responsive. Open paths without a fill are not converted.

Set **Drift** above 0 to move the cell sites by smooth, seeded noise, up to half a cell spacing. **Speed** controls how quickly they move. **Time** is linked to `scene.time` when Voronoi is added in the editor; for authored JSON, use `{ "$expr": "scene.time", "fallback": 0 }` or animate Time. Drift defaults to 0, so existing static tessellations stay unchanged. Stronger Drift makes the cells visibly change shape; the cell count and IDs remain stable while every frame is recomputed from the same sites. Round Corners can soften the cells, but it cuts their corners and can open gaps; use a small radius when you want the cells to remain visually connected. For an additional organic edge treatment, add Noise after Voronoi and animate its Evolution.

| Parameter | Type | Default | Range | Description |
|---|---|---:|---:|---|
| Cell size | number | 32 | 8–200 px | Approximate distance between cell centers. |
| Jitter | number | 0.8 | 0–1 | Moves each center by up to half a cell. |
| Seed | seed | 1 | — | Changes the deterministic cell layout. |
| Drift | number | 0 | 0–0.5 | Site movement as a fraction of cell spacing; 0 keeps the layout still. |
| Speed | number | 0.5 | 0–3 | Rate of the smooth site movement. |
| Time | number | 0 | seconds | Animation time; link to `scene.time` to play continuously. |

Gradients are sampled at each cell center and become solid cell fills. Voronoi generates geometry and preserves sampled source colour; use Color or Tint afterwards to change its appearance.

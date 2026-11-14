// Los cálculos pesados del motor, en Rust.
//
// Cada kernel es una función pura: recibe números planos (los puntos de las curvas, en la
// memoria del módulo) y devuelve números planos. Nada cruza el límite como objetos: así el
// coste de la llamada es el de los datos, no el del idioma.
//
// La interfaz es deliberadamente simple:
//
//   * la parte de JavaScript pide memoria con `alloc_bytes` y escribe ahí los datos;
//   * llama al kernel, que deja el resultado en un búfer propio;
//   * lee el resultado con `out_ptr` y `out_len`.
//
// Los resultados deben ser idénticos a los de la versión en TypeScript (el corpus lo comprueba),
// así que el código sigue la implementación original paso a paso.

use std::alloc::{alloc, dealloc, Layout};

/// Memory for the input data (the JavaScript side writes there).
#[no_mangle]
pub extern "C" fn alloc_bytes(size: usize) -> *mut u8 {
    if size == 0 {
        return std::ptr::null_mut();
    }
    unsafe { alloc(Layout::from_size_align(size, 8).expect("tamaño de memoria")) }
}

/// Frees memory given back by `alloc_bytes`.
#[no_mangle]
pub unsafe extern "C" fn free_bytes(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    dealloc(ptr, Layout::from_size_align(size, 8).expect("tamaño de memoria"));
}

/// The result of the last kernel: where it is and how long it is.
static mut OUT: Vec<f64> = Vec::new();






#[no_mangle]
pub extern "C" fn out_ptr() -> *const f64 {
    unsafe { OUT.as_ptr() }
}

#[no_mangle]
pub extern "C" fn out_len() -> usize {
    unsafe { OUT.len() }
}

// ─────────────────────────────────────────────────────────────────────────────
// El efecto Metaball: el campo de distancia con signo de unos contornos y su contorno.
//
// Es el efecto más caro del motor: para cada punto de una rejilla, la distancia con signo a
// todos los contornos, y luego marching squares para sacar el contorno del campo.
//
// La entrada (en la memoria del módulo):
//
//   puntos:  [x, y, x, y, ...] de todos los contornos, seguidos
//   anillos: [n_puntos, offset, n_puntos, offset, ...] (offset en puntos)
//   formas:  [n_anillos, offset, n_anillos, offset, ...] (offset en anillos)
//   cajas:   [x0, y0, x1, y1, ...] de cada forma
//
// La salida: [n_contornos, (n_puntos, offset) por contorno, ...puntos] en `out_ptr`.

/// Union suave: como el mínimo, pero con un cuello de `k` entre las dos formas.
fn smin(a: f64, b: f64, k: f64) -> f64 {
    if !a.is_finite() {
        return b;
    }
    if k <= 0.0 {
        return a.min(b);
    }
    let h = (k - (a - b).abs()).max(0.0) / k;
    a.min(b) - h * h * k * 0.25
}

/// A segment of an outline, with what does not depend on the query point.
#[derive(Clone, Copy)]
struct Seg {
    ax: f64,
    ay: f64,
    bx: f64,
    by: f64,
    ex: f64,
    ey: f64,
    len2: f64,
}

impl Seg {
    /// The squared distance from the point to the segment (the same arithmetic as in TypeScript).
    #[inline]
    fn distance2(&self, x: f64, y: f64) -> f64 {
        let t = if self.len2 != 0.0 {
            (((x - self.ax) * self.ex + (y - self.ay) * self.ey) / self.len2)
                .max(0.0)
                .min(1.0)
        } else {
            0.0
        };
        (x - self.ax - t * self.ex).powi(2) + (y - self.ay - t * self.ey).powi(2)
    }

    /// The `x` where the segment crosses the horizontal line `y` (if it does).
    #[inline]
    fn crossing(&self, y: f64) -> Option<f64> {
        if (self.ay > y) != (self.by > y) {
            Some(((self.bx - self.ax) * (y - self.ay)) / (self.by - self.ay) + self.ax)
        } else {
            None
        }
    }
}

/// The segments of the rings (the same ones as in the TypeScript version).
fn segments_of(rings: &[&[f64]]) -> Vec<Seg> {
    let mut segs = Vec::new();
    for r in rings {
        let n = r.len() / 2;
        if n < 2 {
            continue;
        }
        let mut j = n - 1;
        for i in 0..n {
            let (ax, ay) = (r[j * 2], r[j * 2 + 1]);
            let (bx, by) = (r[i * 2], r[i * 2 + 1]);
            let (ex, ey) = (bx - ax, by - ay);
            segs.push(Seg { ax, ay, bx, by, ex, ey, len2: ex * ex + ey * ey });
            j = i;
        }
    }
    segs
}

/// A shape of the field: its segments, its box and, for each row of the grid, the `x` of the
/// crossings of the even-odd test (sorted). The crossings of a row do not depend on where along the
/// row the point is, so they are computed once for the whole row instead of once per point.
struct Shape {
    segs: Vec<Seg>,
    bounds: [f64; 4],
    rows: Vec<Vec<f64>>,
}

impl Shape {
    /// Distance to the shape, negative inside (even-odd between its rings).
    fn signed_distance(&self, x: f64, y: f64, row: usize) -> f64 {
        let xs = &self.rows[row];
        // Inside if an odd number of crossings are to the right of the point.
        let inside = (xs.len() - xs.partition_point(|&v| v <= x)) % 2 == 1;
        let mut best = f64::INFINITY;
        for s in &self.segs {
            let d = s.distance2(x, y);
            if d < best {
                best = d;
            }
        }
        let d = best.sqrt();
        if inside {
            -d
        } else {
            d
        }
    }
}

/// Marching squares: the contours where the field crosses zero.
///
/// A crossing point lives on an edge of the grid: the horizontal one between (i, j) and (i + 1, j), or
/// the vertical one between (i, j) and (i, j + 1). They are numbered by the edge, so no map is needed
/// (each edge belongs to two cells at most, and so it has two links at most).
fn contour(field: &[f64], nx: i32, ny: i32, ox: f64, oy: f64, cell: f64) -> Vec<Vec<[f64; 2]>> {
    let at = |i: i32, j: i32| field[(j * nx + i) as usize];
    let n = (nx * ny) as usize;
    // Kind 0: the horizontal edge of (i, j). Kind 1: the vertical edge of (i, j).
    let slot = |kind: usize, i: i32, j: i32| kind * n + (j * nx + i) as usize;

    let mut index: Vec<bool> = vec![false; 2 * n];
    let mut first: Vec<usize> = vec![usize::MAX; 2 * n];
    let mut second: Vec<usize> = vec![usize::MAX; 2 * n];
    let mut order: Vec<usize> = Vec::new();

    fn link(
        a: usize,
        b: usize,
        index: &mut [bool],
        first: &mut [usize],
        second: &mut [usize],
        order: &mut Vec<usize>,
    ) {
        for k in [a, b] {
            if !index[k] {
                index[k] = true;
                order.push(k);
            }
        }
        for (x, y) in [(a, b), (b, a)] {
            if first[x] == usize::MAX {
                first[x] = y;
            } else if second[x] == usize::MAX {
                second[x] = y;
            }
        }
    }

    for j in 0..ny - 1 {
        for i in 0..nx - 1 {
            let v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
            let c = (if v[0] < 0.0 { 1 } else { 0 })
                | (if v[1] < 0.0 { 2 } else { 0 })
                | (if v[2] < 0.0 { 4 } else { 0 })
                | (if v[3] < 0.0 { 8 } else { 0 });
            if c == 0 || c == 15 {
                continue;
            }
            let top = slot(0, i, j);
            let right = slot(1, i + 1, j);
            let bottom = slot(0, i, j + 1);
            let left = slot(1, i, j);
            let centre = (v[0] + v[1] + v[2] + v[3]) / 4.0 < 0.0;
            let mut pair = |a: usize, b: usize, index: &mut Vec<bool>, first: &mut Vec<usize>, second: &mut Vec<usize>, order: &mut Vec<usize>| {
                link(a, b, index, first, second, order);
            };
            match c {
                1 | 14 => pair(left, top, &mut index, &mut first, &mut second, &mut order),
                2 | 13 => pair(top, right, &mut index, &mut first, &mut second, &mut order),
                3 | 12 => pair(left, right, &mut index, &mut first, &mut second, &mut order),
                4 | 11 => pair(right, bottom, &mut index, &mut first, &mut second, &mut order),
                6 | 9 => pair(top, bottom, &mut index, &mut first, &mut second, &mut order),
                7 | 8 => pair(left, bottom, &mut index, &mut first, &mut second, &mut order),
                5 => {
                    if centre {
                        pair(left, bottom, &mut index, &mut first, &mut second, &mut order);
                        pair(top, right, &mut index, &mut first, &mut second, &mut order);
                    } else {
                        pair(left, top, &mut index, &mut first, &mut second, &mut order);
                        pair(right, bottom, &mut index, &mut first, &mut second, &mut order);
                    }
                }
                10 => {
                    if centre {
                        pair(left, top, &mut index, &mut first, &mut second, &mut order);
                        pair(right, bottom, &mut index, &mut first, &mut second, &mut order);
                    } else {
                        pair(left, bottom, &mut index, &mut first, &mut second, &mut order);
                        pair(top, right, &mut index, &mut first, &mut second, &mut order);
                    }
                }
                _ => {}
            }
        }
    }

    // The crossing point of an edge, by interpolation.
    let point = |k: usize| -> [f64; 2] {
        let (kind, rest) = (k / n, k % n);
        let (i, j) = ((rest % nx as usize) as i32, (rest / nx as usize) as i32);
        let a = at(i, j);
        let b = if kind == 0 { at(i + 1, j) } else { at(i, j + 1) };
        let t = if a == b { 0.5 } else { a / (a - b) };
        if kind == 0 {
            [ox + (i as f64 + t) * cell, oy + j as f64 * cell]
        } else {
            [ox + i as f64 * cell, oy + (j as f64 + t) * cell]
        }
    };

    let mut used: Vec<bool> = vec![false; 2 * n];
    let mut loops: Vec<Vec<[f64; 2]>> = Vec::new();
    for start in order {
        if used[start] {
            continue;
        }
        let mut loop_points: Vec<[f64; 2]> = Vec::new();
        let mut prev = usize::MAX;
        let mut cur = start;
        while cur != usize::MAX && !used[cur] {
            used[cur] = true;
            loop_points.push(point(cur));
            let a = first[cur];
            let b = second[cur];
            let next = if a != prev && a != usize::MAX && !used[a] {
                a
            } else if b != prev && b != usize::MAX && !used[b] {
                b
            } else {
                usize::MAX
            };
            prev = cur;
            cur = next;
        }
        if loop_points.len() >= 3 {
            loops.push(loop_points);
        }
    }
    loops
}

/// The Metaball field and its contour.
///
/// `points`: the points of all the rings.
/// `rings`: (count, offset) of each ring, in points.
/// `shapes`: (count, offset) of each shape, in rings.
/// `boxes`: the box of each shape.
/// Returns the number of points written to `out_ptr`.
#[no_mangle]
pub extern "C" fn metaball(
    reach: f64,
    grow: f64,
    quality: f64,
    x0: f64,
    y0: f64,
    x1: f64,
    y1: f64,
    points: *const f64,
    n_points: usize,
    rings: *const i32,
    n_rings: usize,
    shapes: *const i32,
    n_shapes: usize,
    boxes: *const f64,
) -> usize {
    let pts: &[f64] = unsafe { std::slice::from_raw_parts(points, n_points * 2) };
    let ring_tbl: &[i32] = unsafe { std::slice::from_raw_parts(rings, n_rings * 2) };
    let shape_tbl: &[i32] = unsafe { std::slice::from_raw_parts(shapes, n_shapes * 2) };
    let bx: &[f64] = unsafe { std::slice::from_raw_parts(boxes, n_shapes * 4) };

    // The rings of each shape.
    let mut solids: Vec<(Vec<Seg>, [f64; 4])> = Vec::with_capacity(n_shapes);
    for s in 0..n_shapes {
        let (count, off) = (shape_tbl[s * 2] as usize, shape_tbl[s * 2 + 1] as usize);
        let mut list: Vec<&[f64]> = Vec::with_capacity(count);
        for r in off..off + count {
            let (pc, po) = (ring_tbl[r * 2] as usize, ring_tbl[r * 2 + 1] as usize);
            list.push(&pts[po * 2..(po + pc) * 2]);
        }
        solids.push((segments_of(&list), [bx[s * 4], bx[s * 4 + 1], bx[s * 4 + 2], bx[s * 4 + 3]]));
    }

    let quality = quality.max(30.0).min(400.0).round();
    let k = reach.max(0.0);
    let pad = k + grow.max(0.0) + 2.0;
    let cell = (x1 - x0).max(y1 - y0).max(1.0) / quality;

    let gx0 = x0 - pad - cell;
    let gy0 = y0 - pad - cell;
    let nx = ((x1 - x0 + 2.0 * pad) / cell).ceil() as i32 + 3;
    let ny = ((y1 - y0 + 2.0 * pad) / cell).ceil() as i32 + 3;

    let near = 2.0 * k + grow.abs() + 2.0 * cell;

    // A coarse grid first: where the four corners are far from the outline, the fine nodes are
    // interpolated (only which side they are on matters).
    const S: i32 = 4;
    let cx = (nx - 1 + S - 1) / S + 2;
    let cy = (ny - 1 + S - 1) / S + 2;

    // The rows of the grid: the fine ones (step `cell`) and the coarse ones (step `S * cell`).
    let n_rows = (((cy - 1) * S).max(ny - 1) + 1) as usize;
    let shapes: Vec<Shape> = solids
        .into_iter()
        .map(|(segs, box_)| {
            let mut rows: Vec<Vec<f64>> = (0..n_rows).map(|_| Vec::new()).collect();
            for s in &segs {
                let (y0, y1) = (s.ay.min(s.by), s.ay.max(s.by));
                let mut m = ((y0 - gy0) / cell).floor() as i64 - 1;
                let end = ((y1 - gy0) / cell).ceil() as i64 + 1;
                while m <= end {
                    if m >= 0 && (m as usize) < n_rows {
                        let y = gy0 + m as f64 * cell;
                        if let Some(x) = s.crossing(y) {
                            rows[m as usize].push(x);
                        }
                    }
                    m += 1;
                }
            }
            for r in &mut rows {
                r.sort_by(|a, b| a.partial_cmp(b).unwrap());
            }
            Shape { segs, bounds: box_, rows }
        })
        .collect();

    let field_at = |x: f64, y: f64, row: usize| -> f64 {
        let mut f = f64::INFINITY;
        for sh in &shapes {
            let b = sh.bounds;
            let dx = (b[0] - x).max(0.0).max(x - b[2]);
            let dy = (b[1] - y).max(0.0).max(y - b[3]);
            let box_d = dx.hypot(dy);
            // Outside its box the signed distance is at least `box_d`, so if even that cannot bring
            // the smooth union down (smin(f, d, k) is f when d >= f + k), the shape is left out.
            if (dx > 0.0 || dy > 0.0) && box_d >= f + k {
                continue;
            }
            let d = if box_d > near { box_d } else { sh.signed_distance(x, y, row) };
            f = smin(f, d, k);
        }
        f - grow
    };

    let mut coarse = vec![0.0f64; (cx * cy) as usize];
    for j in 0..cy {
        for i in 0..cx {
            coarse[(j * cx + i) as usize] =
                field_at(gx0 + i as f64 * S as f64 * cell, gy0 + j as f64 * S as f64 * cell, (j * S) as usize);
        }
    }
    let safe = 1.5 * S as f64 * cell;
    let mut field = vec![0.0f64; (nx * ny) as usize];
    for j in 0..ny {
        let cj = (j / S).min(cy - 2);
        let fy = j as f64 / S as f64 - cj as f64;
        for i in 0..nx {
            let ci = (i / S).min(cx - 2);
            let fx = i as f64 / S as f64 - ci as f64;
            let a = coarse[(cj * cx + ci) as usize];
            let b = coarse[(cj * cx + ci + 1) as usize];
            let c = coarse[((cj + 1) * cx + ci) as usize];
            let d = coarse[((cj + 1) * cx + ci + 1) as usize];
            let far = (a > safe && b > safe && c > safe && d > safe) || (a < -safe && b < -safe && c < -safe && d < -safe);
            field[(j * nx + i) as usize] = if far {
                a * (1.0 - fx) * (1.0 - fy) + b * fx * (1.0 - fy) + c * (1.0 - fx) * fy + d * fx * fy
            } else {
                field_at(gx0 + i as f64 * cell, gy0 + j as f64 * cell, j as usize)
            };
        }
    }

    let loops = contour(&field, nx, ny, gx0, gy0, cell);

    // The result: the header (how many numbers come before the points), the table of the
    // contours (how many points each one, and where it starts) and the points.
    let n_loops = loops.len();
    let mut table: Vec<f64> = Vec::with_capacity(n_loops * 2);
    let mut body: Vec<f64> = Vec::new();
    for l in &loops {
        table.push(l.len() as f64);
        table.push(body.len() as f64 / 2.0);
        for p in l {
            body.push(p[0]);
            body.push(p[1]);
        }
    }
    let mut flat: Vec<f64> = Vec::with_capacity(1 + table.len() + body.len());
    flat.push((1 + table.len()) as f64);
    flat.extend(table);
    flat.extend(body);
    unsafe {
        OUT = flat;
        OUT.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A circle of radius `r` around the origin, as a ring.
    fn circle(r: f64, n: usize) -> Vec<f64> {
        let mut pts = Vec::with_capacity(n * 2);
        for i in 0..n {
            let a = i as f64 / n as f64 * std::f64::consts::TAU;
            pts.push(r * a.cos());
            pts.push(r * a.sin());
        }
        pts
    }

    #[test]
    fn the_metaball_field_has_a_contour_around_a_ball() {
        let ring = circle(50.0, 64);
        let points = ring.clone();
        let rings: Vec<i32> = vec![points.len() as i32 / 2, 0];
        let shapes: Vec<i32> = vec![1, 0];
        let boxes: Vec<f64> = vec![-50.0, -50.0, 50.0, 50.0];
        let n = unsafe {
            metaball(
                30.0,
                0.0,
                100.0,
                -50.0,
                -50.0,
                50.0,
                50.0,
                points.as_ptr(),
                points.len() / 2,
                rings.as_ptr(),
                1,
                shapes.as_ptr(),
                1,
                boxes.as_ptr(),
            )
        };
        assert!(n > 0, "no hay resultado");
        let out = unsafe { OUT.clone() };
        let header = out[0] as usize;
        assert_eq!(header, 3, "un contorno: la cabecera y su tabla");
        let count = out[1] as usize;
        let offset = out[2] as usize;
        assert!(count > 8, "el contorno tiene pocos puntos: {count}");
        // The contour is around the ball: its points are near the radius.
        for i in 0..count {
            let x = out[header + offset * 2 + i * 2];
            let y = out[header + offset * 2 + i * 2 + 1];
            let d = x.hypot(y);
            assert!((40.0..60.0).contains(&d), "punto fuera: {d}");
        }
    }
}

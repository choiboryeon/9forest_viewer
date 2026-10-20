// Spatial metadata stays in the model's native XY plane (Z is height).
const EPS = 1e-8;
const prepared = new WeakMap();

function geometry(meta) {
  if (prepared.has(meta)) return prepared.get(meta);
  const regions = Array.isArray(meta.floorRegions)
    ? meta.floorRegions.filter(r => !/stair/i.test(`${r.id || ''} ${r.kind || ''}`))
    : [{bounds: [0, 0, meta.width_m || 0, meta.depth_m || 0], z: 0}];
  const value = {regions, obstacles: meta.obstacles || []};
  prepared.set(meta, value);
  return value;
}

export function floorAt(meta, x, y) {
  let z = -Infinity;
  for (const r of geometry(meta).regions) {
    const [x0, y0, x1, y1] = r.bounds;
    if (x >= x0 - EPS && x <= x1 + EPS && y >= y0 - EPS && y <= y1 + EPS) z = Math.max(z, r.z || 0);
  }
  return Number.isFinite(z) ? z : 0;
}

// Slicing at every floor edge detects holes/concave notches that a corner test misses.
function covered(regions, x0, y0, x1, y1) {
  const relevant = regions.filter(r => r.bounds[0] <= x1 + EPS && r.bounds[2] >= x0 - EPS && r.bounds[1] <= y1 + EPS && r.bounds[3] >= y0 - EPS);
  const xs = [x0, x1];
  for (const {bounds: b} of relevant) for (const x of [b[0], b[2]]) if (x > x0 && x < x1) xs.push(x);
  xs.sort((a, b) => a - b);
  const samples = x1 - x0 <= EPS ? [x0] : xs.slice(1).map((x, i) => (xs[i] + x) / 2);
  return samples.every(x => {
    const intervals = relevant.filter(r => r.bounds[0] <= x + EPS && r.bounds[2] >= x - EPS).map(r => [r.bounds[1], r.bounds[3]]).sort((a, b) => a[0] - b[0]);
    let end = y0;
    let touched = false;
    for (const [lo, hi] of intervals) {
      if (hi < end - EPS) continue;
      if (lo > end + EPS) break;
      touched = true;
      end = Math.max(end, hi);
      if (end >= y1 - EPS) return true;
    }
    return touched && end >= y1 - EPS;
  });
}

// Optional vertical bounds are absolute Z. The default checks the floor footprint;
// callers with tall/suspended objects can supply their full bottom/top interval.
export function canPlace(meta, x, y, hx, hy, clearance = .04, vertical) {
  if (![x, y, hx, hy, clearance].every(Number.isFinite) || hx < 0 || hy < 0 || clearance < 0) return false;
  const {regions, obstacles} = geometry(meta);
  const ex = hx + clearance, ey = hy + clearance;
  const x0 = x - ex, y0 = y - ey, x1 = x + ex, y1 = y + ey;
  if (!covered(regions, x0, y0, x1, y1)) return false;
  const floor = floorAt(meta, x, y);
  const bottom = vertical?.bottom ?? floor, top = vertical?.top ?? floor + .5;
  return obstacles.every(o => {
    if ((o.minZ ?? 0) >= top - EPS || (o.maxZ ?? Infinity) <= bottom + EPS) return true;
    const b = o.bounds;
    return x1 <= b[0] + EPS || x0 >= b[2] - EPS || y1 <= b[1] + EPS || y0 >= b[3] - EPS;
  });
}

// Unlike canPlace's absolute interval, fitPlacement's optional vertical interval
// is relative to the local floor so every candidate is tested at its own height.
export function fitPlacement(meta, x, y, hx, hy, vertical) {
  if (![x, y, hx, hy].every(Number.isFinite) || hx < 0 || hy < 0) return null;
  const valid = (px, py) => {
    const floor = floorAt(meta, px, py);
    const interval = vertical ? {bottom: floor + vertical.bottom, top: floor + vertical.top} : undefined;
    return canPlace(meta, px, py, hx, hy, .04, interval);
  };
  if (valid(x, y)) return {x, y};
  const {regions, obstacles} = geometry(meta), ex = hx + .04, ey = hy + .04;
  const xs = new Set([x]), ys = new Set([y]);
  for (const {bounds: b} of [...regions, ...obstacles]) {
    for (const edge of [b[0], b[2]]) { xs.add(edge - ex); xs.add(edge + ex); }
    for (const edge of [b[1], b[3]]) { ys.add(edge - ey); ys.add(edge + ey); }
  }
  // The feasible set is orthogonal; its nearest point is the input projected onto
  // one of these edge combinations, including candidates across floor seams.
  let best = null, distance = Infinity;
  for (const px of xs) for (const py of ys) {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < distance && valid(px, py)) { best = {x: px, y: py}; distance = d; }
  }
  return best;
}

export function canWalk(meta, x, y) {
  const floor = floorAt(meta, x, y);
  return canPlace(meta, x, y, 0, 0, .22, {bottom: floor, top: floor + 1.9});
}

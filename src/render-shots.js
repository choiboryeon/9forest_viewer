import {canWalk, floorAt} from './spatial.js';

// Suggests still-camera compositions for a finished layout. Coordinates follow the
// room metadata (Z up). A shot stores the vertical FOV of the final crop, so the
// viewer can show the same framing whatever the stage's own aspect ratio is.
const DEG = Math.PI / 180;
const KIND = {low: '낮은 시점', eye: '눈높이', high: '높은 시점'};
const FRAME = {center: '중앙 구도', left: '왼쪽 3분할', right: '오른쪽 3분할'};
const SAFE = .9;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

function corners(b) {
  const p = [];
  for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) p.push([x, y, z]);
  return p;
}

// Camera basis for yaw (around Z, 0 = +X) and pitch (negative looks down).
function basis(yaw, pitch) {
  const cp = Math.cos(pitch), f = [Math.cos(yaw) * cp, Math.sin(yaw) * cp, Math.sin(pitch)];
  const r = [Math.sin(yaw), -Math.cos(yaw), 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return {f, r, u};
}

function toCamera(p, pos, {f, r, u}) {
  const d = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
  return [d[0] * r[0] + d[1] * r[1] + d[2] * r[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * f[0] + d[1] * f[1] + d[2] * f[2]];
}

// Smallest vertical FOV (radians) that keeps every point inside the safe frame.
function fitFov(points, pos, b, aspect) {
  let t = 0;
  for (const p of points) {
    const [x, y, z] = toCamera(p, pos, b);
    if (z <= .05) return Infinity;
    t = Math.max(t, Math.abs(y) / z / SAFE, Math.abs(x) / z / SAFE / aspect);
  }
  return 2 * Math.atan(t);
}

function evaluate(c, targets, aspect) {
  const b = basis(c.yaw, c.pitch), ty = Math.tan(c.fov / 2), tx = ty * aspect;
  let cover = 0, weight = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, cx = 0, cy = 0, cw = 0;
  const dist = [];
  c.inside = [];
  for (const t of targets) {
    let inside = 0;
    const counted = (t.visibility ?? 1) > 0;
    for (const p of t.corners) {
      const [x, y, z] = toCamera(p, c.position, b);
      if (z <= .05) continue;
      const nx = x / z / tx, ny = y / z / ty;
      if (Math.abs(nx) <= 1 && Math.abs(ny) <= 1) inside++;
      if (!counted) continue;
      minX = Math.min(minX, nx); maxX = Math.max(maxX, nx); minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
    }
    const [x, y, z] = toCamera(t.center, c.position, b);
    if (counted && z > .05) { cx += x / z / tx * t.weight; cy += y / z / ty * t.weight; cw += t.weight; }
    inside /= t.corners.length;
    c.inside.push(inside);
    cover += inside * t.weight * (t.visibility ?? 1);
    weight += t.weight;
    dist.push(Math.hypot(t.center[0] - c.position[0], t.center[1] - c.position[1]));
  }
  cover /= weight || 1;
  const fill = (clamp(maxX, -1, 1) - clamp(minX, -1, 1)) * (clamp(maxY, -1, 1) - clamp(minY, -1, 1)) / 4;
  const fillScore = 1 - Math.min(1, Math.abs(fill - .42) / .42);
  const centroid = cw ? [cx / cw, cy / cw] : [0, 0];
  const anchors = [[-1 / 3, -1 / 3, 1], [1 / 3, -1 / 3, 1], [-1 / 3, 0, 1], [1 / 3, 0, 1], [0, 0, .85], [0, -1 / 3, .9]];
  const thirds = Math.max(...anchors.map(([x, y, w]) => w * (1 - Math.min(1, Math.hypot(centroid[0] - x, centroid[1] - y) / .5))));
  const pitchScore = c.kind === 'high' ? 1 - clamp((Math.abs(c.pitch) - 38 * DEG) / (20 * DEG), 0, 1) : 1 - clamp((Math.abs(c.pitch) - 12 * DEG) / (25 * DEG), 0, 1);
  const mean = dist.reduce((a, d) => a + d, 0) / dist.length;
  const depth = dist.length > 1 ? clamp(Math.sqrt(dist.reduce((a, d) => a + (d - mean) ** 2, 0) / dist.length) / mean * 2, 0, 1) : .5;
  const comfort = clamp((c.nearest - .7) / .6, 0, 1);
  const fovScore = 1 - clamp((c.fov / DEG - 45) / 25, 0, 1);
  c.cover = cover;
  // Coverage gates composition: a handsome frame of half the layout loses to a
  // plainer one that shows everything.
  const composition = .22 * fillScore + .2 * thirds + .16 * pitchScore + .12 * depth + .18 * comfort + .12 * fovScore;
  c.score = cover ** 1.5 * (.3 + .7 * composition);
  return c;
}

function frame(position, kind, targets, aspect, composition) {
  const pts = targets.flatMap(t => t.corners), center = weightedCenter(targets);
  if (!pts.length) return null;
  const yaw0 = Math.atan2(center[1] - position[1], center[0] - position[0]);
  let loA = Infinity, hiA = -Infinity, loE = Infinity, hiE = -Infinity;
  for (const p of pts) {
    const h = Math.hypot(p[0] - position[0], p[1] - position[1]), a = wrap(Math.atan2(p[1] - position[1], p[0] - position[0]) - yaw0), e = Math.atan2(p[2] - position[2], Math.max(h, .05));
    loA = Math.min(loA, a); hiA = Math.max(hiA, a); loE = Math.min(loE, e); hiE = Math.max(hiE, e);
  }
  // OrbitControls in the viewer never look upward, so every pitch stays below level.
  const [minPitch, maxPitch] = kind === 'high' ? [-55 * DEG, -8 * DEG] : [-35 * DEG, -1 * DEG];
  const pitch = clamp((loE + hiE) / 2, minPitch, maxPitch);
  let yaw = yaw0 + (loA + hiA) / 2, fov = clamp(fitFov(pts, position, basis(yaw, pitch), aspect), 30 * DEG, 62 * DEG);
  if (composition !== 'center') {
    // Place the group's centre on a vertical third, then refit the field of view.
    for (let i = 0; i < 2; i++) {
      const shift = Math.atan(Math.tan(fov / 2) * aspect / 3);
      yaw = yaw0 + (loA + hiA) / 2 + (composition === 'left' ? -shift : shift);
      fov = clamp(fitFov(pts, position, basis(yaw, pitch), aspect), 30 * DEG, 62 * DEG);
    }
  }
  return {position, kind, composition, yaw, pitch, fov};
}

function weightedCenter(targets) {
  const w = targets.reduce((a, t) => a + t.weight, 0) || 1;
  return [0, 1, 2].map(i => targets.reduce((a, t) => a + t.center[i] * t.weight, 0) / w);
}

function nearestBox(p, targets) {
  return Math.min(...targets.map(({box: b}) => Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.y0 - p[1], 0, p[1] - b.y1))));
}

function shot(c, total) {
  const b = basis(c.yaw, c.pitch), d = 2.5;
  return {
    position: c.position.map(v => Math.round(v * 1000) / 1000),
    target: c.position.map((v, i) => Math.round((v + b.f[i] * d) * 1000) / 1000),
    fov: Math.round(c.fov / DEG * 10) / 10,
    score: Math.round(c.score * 1000) / 1000,
    visible: c.inside.filter((v, i) => v >= .5 && (c.visibility?.[i] ?? 1) >= .5).length,
    total,
    kind: c.kind,
    composition: c.composition,
    label: `${KIND[c.kind]} · ${FRAME[c.composition]}`
  };
}

export function planShots({meta, targets: input, aspect = 1.5, count = 4, ceilingAt = () => meta.ceiling_m ?? 2.6, visibility = null, obstruction = null, finalists = 24}) {
  const targets = (input || []).filter(t => t?.box).map(t => {
    const b = t.box;
    return {...t, weight: t.weight ?? 1, corners: corners(b), center: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]};
  });
  if (!targets.length) return [];
  const bounds = meta.bounds || {min: [0, 0], max: [meta.width_m, meta.depth_m]};
  const [minX, minY] = bounds.min, [maxX, maxY] = bounds.max;
  const area = (maxX - minX) * (maxY - minY), step = clamp(Math.sqrt(area / 220), .35, .8), inset = .35;
  const center = weightedCenter(targets), candidates = [];
  for (let x = minX + inset; x <= maxX - inset + 1e-9; x += step) for (let y = minY + inset; y <= maxY - inset + 1e-9; y += step) {
    if (!canWalk(meta, x, y)) continue;
    const nearest = nearestBox([x, y], targets);
    if (nearest < .45 || Math.hypot(center[0] - x, center[1] - y) < 1) continue;
    const floor = floorAt(meta, x, y), ceiling = ceilingAt(x, y);
    const heights = [['low', 1.15], ['eye', 1.6]];
    const high = Math.min(ceiling - floor - .3, 3.2);
    if (high > 2.1) heights.push(['high', high]);
    for (const [kind, h] of heights) {
      const position = [x, y, floor + h];
      // One sightline per target first, so cameras frame what they can actually see.
      const seen = visibility ? targets.map(t => visibility(position, t.source ?? t, 1)) : targets.map(() => 1);
      const framed = targets.filter((t, i) => seen[i] > 0);
      if (!framed.length) continue;
      for (const composition of ['center', 'left', 'right']) {
        const c = frame(position, kind, framed, aspect, composition);
        c.nearest = nearest;
        c.coarse = seen;
        candidates.push(evaluate(c, targets.map((t, i) => ({...t, visibility: seen[i]})), aspect));
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  // Keep the strongest few of every camera height so the final set can vary.
  const pool = [...new Set([...candidates.slice(0, finalists), ...Object.keys(KIND).flatMap(k => candidates.filter(c => c.kind === k).slice(0, 8))])];
  for (const c of pool) {
    if (visibility) {
      c.visibility = targets.map((t, i) => c.inside[i] > 0 && c.coarse[i] > 0 ? visibility(c.position, t.source ?? t, 5) : 0);
      evaluate(c, targets.map((t, i) => ({...t, visibility: c.visibility[i]})), aspect);
    }
    // Beams, columns or walls right in front of the lens spoil a cut even when
    // every object stays visible behind them.
    if (obstruction) {
      const b = basis(c.yaw, c.pitch), ty = Math.tan(c.fov / 2), tx = ty * aspect, far = Math.min(1.2, .6 * c.nearest + .3), rays = [];
      for (const v of [-.8, -.27, .27, .8]) for (const u of [-.85, -.42, 0, .42, .85]) {
        const d = [0, 1, 2].map(i => b.f[i] + b.r[i] * u * tx + b.u[i] * v * ty), len = Math.hypot(...d);
        rays.push(d.map(x => x / len));
      }
      c.clutter = obstruction(c.position, rays, far);
      c.score *= 1 - .85 * c.clutter;
    }
  }
  pool.sort((a, b) => b.score - a.score);
  const picked = [], near = (p, c, d, a) => Math.hypot(p.position[0] - c.position[0], p.position[1] - c.position[1]) < d && Math.abs(wrap(p.yaw - c.yaw)) < a * DEG;
  const take = c => { if (picked.length < count && !picked.includes(c) && !picked.some(p => near(p, c, 1.2, 35))) picked.push(c); };
  const top = pool[0]?.score ?? 0;
  if (pool.length) take(pool[0]);
  // Offer each other camera height once if it holds up against the best cut.
  for (const kind of Object.keys(KIND)) { const c = pool.find(c => c.kind === kind && c.score >= .6 * top && !picked.some(p => near(p, c, 1.2, 35))); if (c) take(c); }
  for (const c of pool) if (picked.filter(p => p.kind === c.kind).length < 2) take(c);
  for (const c of pool) if (picked.length < count && !picked.includes(c) && !picked.some(p => near(p, c, .6, 20))) picked.push(c);
  picked.sort((a, b) => b.score - a.score);
  return picked.map(c => shot(c, targets.length));
}

// Vertical FOV that shows `fov` (degrees, for a crop of `aspect`) inside a stage of
// `stageAspect`, with the crop centred and as large as possible.
export function stageFov(fov, aspect, stageAspect) {
  const t = Math.tan(fov * DEG / 2), scale = aspect > stageAspect ? aspect / stageAspect : 1;
  return 2 * Math.atan(t * scale) / DEG;
}

export function cropFov(stageFovDeg, aspect, stageAspect) {
  const t = Math.tan(stageFovDeg * DEG / 2), scale = aspect > stageAspect ? stageAspect / aspect : 1;
  return 2 * Math.atan(t * scale) / DEG;
}

// Largest centred rectangle of `aspect` inside a width × height stage.
export function cropRect(width, height, aspect) {
  const w = Math.min(width, height * aspect), h = w / aspect;
  return {x: (width - w) / 2, y: (height - h) / 2, width: w, height: h};
}

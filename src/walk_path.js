import {canPlace, canWalk, floorAt} from './spatial.js';

// A collision-aware visitor route. Native metadata coordinates include negative Y.
export function planWalk({width, depth, door, objects = [], metadata}) {
  const cell = .16, margin = metadata?.floorRegions ? .22 : .24, eye = 1.65;
  const bounds = metadata?.bounds || {min: [0, 0], max: [width, depth]};
  const [minX, minY] = bounds.min, [maxX, maxY] = bounds.max;
  const nx = Math.max(1, Math.floor((maxX - minX - 2 * margin) / cell) + 1);
  const ny = Math.max(1, Math.floor((maxY - minY - 2 * margin) / cell) + 1);
  const point = (i, j) => [minX + margin + i * cell, minY + margin + j * cell];
  const at = k => point(k % nx, Math.floor(k / nx));
  const inside = (x, y) => metadata?.floorRegions ? canWalk(metadata, x, y) : x >= minX + margin && x <= maxX - margin && y >= minY + margin && y <= maxY - margin;
  const clear = (x, y) => inside(x, y) && objects.every(o => !o.blocks || Math.abs(x - o.x) >= o.hx + .24 || Math.abs(y - o.y) >= o.hy + .24);
  const cells = Array.from({length: nx * ny}, (_, k) => clear(...at(k)));
  const nearest = ([x, y]) => {
    let best = -1, score = Infinity;
    for (let k = 0; k < cells.length; k++) if (cells[k]) {
      const [px, py] = at(k), d = (x - px) ** 2 + (y - py) ** 2;
      if (d < score) { score = d; best = k; }
    }
    return best;
  };
  const segmentClear = (a, b) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / .07));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!clear(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
    return true;
  };
  // A viewing point in the next room must not count as a visit through a wall.
  const visible = (from, item) => {
    if (!metadata?.floorRegions) return true;
    const steps = Math.max(1, Math.ceil(Math.hypot(from[0] - item.x, from[1] - item.y) / .02));
    const fromZ = floorAt(metadata, ...from) + eye, targetZ = item.focusZ ?? eye;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = from[0] + (item.x - from[0]) * t, y = from[1] + (item.y - from[1]) * t, z = fromZ + (targetZ - fromZ) * t;
      if (!canPlace(metadata, x, y, 0, 0, .01, {bottom: z - .01, top: z + .01})) return false;
    }
    return true;
  };
  const distance = path => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
  const neighbors = new Map();
  function adjacent(k) {
    if (neighbors.has(k)) return neighbors.get(k);
    const x = k % nx, y = Math.floor(k / nx), list = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const xx = x + dx, yy = y + dy, next = yy * nx + xx;
      if (xx < 0 || xx >= nx || yy < 0 || yy >= ny || !cells[next]) continue;
      if (dx && dy && (!cells[y * nx + xx] || !cells[yy * nx + x])) continue;
      if (segmentClear(at(k), at(next))) list.push(next);
    }
    neighbors.set(k, list);
    return list;
  }
  let previousStart = -1, previous;
  function route(from, to) {
    const start = nearest(from), goal = nearest(to);
    if (start < 0 || goal < 0) return null;
    if (previousStart !== start) {
      previous = new Int32Array(cells.length).fill(-1);
      const queue = new Int32Array(cells.length); let head = 0, tail = 0;
      previous[start] = start; queue[tail++] = start;
      while (head < tail) {
        const k = queue[head++];
        for (const next of adjacent(k)) if (previous[next] < 0) { previous[next] = k; queue[tail++] = next; }
      }
      previousStart = start;
    }
    if (previous[goal] < 0) return null;
    const nodes = [];
    for (let k = goal; k !== start; k = previous[k]) nodes.push(at(k));
    nodes.push(at(start)); nodes.reverse();
    const raw = [from, ...nodes, to], simple = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      let j = raw.length - 1;
      while (j > i + 1 && !segmentClear(raw[i], raw[j])) j--;
      simple.push(raw[j]); i = j;
    }
    return simple.slice(1).every((p, i) => segmentClear(simple[i], p)) ? simple : null;
  }
  const entranceX = (door?.x_m ?? width / 2) + (door?.width_m ?? 0) / 2;
  const entrance = metadata?.entrance || [Math.max(margin, Math.min(width - margin, entranceX)), Math.max(margin, Math.min(depth - margin, depth - .34))];
  const entranceNode = nearest(entrance);
  if (entranceNode < 0) return {start: null, eye, segments: [], visits: 0, skipped: objects.length, skippedIds: objects.map(o => o.id), total: 0, noWalk: true};
  const start = at(entranceNode), remaining = [...objects], segments = [], skippedIds = [];
  let current = start, visits = 0;
  while (remaining.length) {
    remaining.sort((a, b) => Math.hypot(a.x - current[0], a.y - current[1]) - Math.hypot(b.x - current[0], b.y - current[1]));
    const item = remaining.shift(), radius = Math.max(item.hx, item.hy) + .78, candidates = [];
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, r = radius + ring * .36, x = item.x + Math.cos(angle) * r, y = item.y + Math.sin(angle) * r;
      if (clear(x, y) && visible([x, y], item)) candidates.push([x, y]);
    }
    candidates.sort((a, b) => Math.hypot(a[0] - current[0], a[1] - current[1]) - Math.hypot(b[0] - current[0], b[1] - current[1]));
    let bestPath = null, bestLength = Infinity;
    for (const candidate of candidates) {
      const path = route(current, candidate);
      if (!path) continue;
      const length = distance(path);
      if (length < bestLength) { bestPath = path; bestLength = length; }
      if (bestLength < .45) break;
    }
    if (!bestPath) { skippedIds.push(item.id); continue; }
    const focus = [item.x, item.y, item.focusZ ?? eye];
    if (bestLength > .05) {
      segments.push({kind: 'move', path: bestPath, focus, id: item.id, duration: Math.max(.7, bestLength / .92)});
      current = bestPath.at(-1);
    }
    segments.push({kind: 'look', position: current, focus, id: item.id, scanH: item.scanH ?? .08, scanV: item.scanV ?? .06, duration: 2.4});
    visits++;
  }
  segments.push({kind: 'spin', position: current, duration: 8});
  return {start, eye, segments, visits, skipped: skippedIds.length, skippedIds, noWalk: false, total: segments.reduce((sum, s) => sum + s.duration, 0)};
}

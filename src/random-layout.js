// Seeded random object layout. This module only decides which objects to try and
// where; the viewer's tryPlace callback fits each candidate (mount type, walls,
// fixed obstacles, the live station, ducts, other objects). With the same seed and
// the same space state the result is identical.
export class SeededRandom {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}

export const normalizeSeed = seed => (parseInt(seed, 10) >>> 0) || 1;

// regions: [{bounds:[x0,y0,x1,y1]}] sampled by area. types: ids to place, in order
// of preference (shuffled here). tryPlace(candidate, placed) returns an item or null.
export function randomLayout({seed, count, types, regions, tryPlace, attempts = 80}) {
  const rng = new SeededRandom(normalizeSeed(seed));
  const usable = regions.filter(r => r.bounds[2] > r.bounds[0] && r.bounds[3] > r.bounds[1]);
  const areas = usable.map(r => (r.bounds[2] - r.bounds[0]) * (r.bounds[3] - r.bounds[1]));
  const total = areas.reduce((a, b) => a + b, 0);
  const pickRegion = () => { let t = rng.next() * total; for (let i = 0; i < usable.length; i++) { t -= areas[i]; if (t <= 0) return usable[i]; } return usable.at(-1); };
  const chosen = rng.shuffle(types).slice(0, Math.max(0, Math.min(count, types.length)));
  const placed = [], skipped = [];
  for (const type of chosen) {
    let item = null;
    for (let a = 0; a < attempts && !item && total > 0; a++) {
      const [x0, y0, x1, y1] = pickRegion().bounds;
      item = tryPlace({type, x: rng.range(x0, x1), y: rng.range(y0, y1), rotation: rng.int(0, 23) * 15, heightT: rng.next()}, placed);
    }
    if (item) placed.push(item); else skipped.push(type);
  }
  return {placed, skipped};
}

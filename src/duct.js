import * as THREE from 'three';

// Ported from duct-simulator/duct-simulator.html. The generator works in its own
// Y-up box (x/z = floor, y = height) centred on the region; the viewer places
// that box in a space and rotates it to Z-up. Same seed + parameters = same ducts.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DEG = Math.PI / 180;

export const DUCT_DEFAULTS = {complexity: 4, type: 'auto', mode: 'auto', count: 0, diameter: .5, W: 6, D: 4, H: 5.7, supports: true, plinth: false, avoid: true};
export const DUCT_LIMITS = {complexity: [1, 10], count: [0, 8], diameter: [.2, 1.4], W: [2, 16], D: [2, 13], H: [2, 12]};
export const MODE_KO = {floor: '바닥', wall: '벽면', ceiling: '천장', mixed: '혼합'};
export const TYPE_KO = {rigid: '스파이럴', flex: '플렉시블', mix: '혼합'};

// ---------------------------------------------------------------- RNG
class RNG {
  constructor(seed) { this.s = seed >>> 0; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  chance(p) { return this.next() < p; }
  pick(a) { return a[Math.floor(this.next() * a.length)]; }
  gauss() { return (this.next() + this.next() + this.next() - 1.5) * 1.15; }
  weighted(items, w) {
    let s = 0; for (const x of w) s += x;
    let r = this.next() * s;
    for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
}

// ---------------------------------------------------------------- spatial hash of duct samples
class SpatialHash {
  constructor(cell = 1) { this.cell = cell; this.map = new Map(); this.maxCy = 0; }
  key(x, y, z) { return ((x + 1000) * 2000 + (y + 1000)) * 2000 + (z + 1000); }
  add(s) {
    const c = this.cell, iy = Math.floor(s.p.y / c);
    const k = this.key(Math.floor(s.p.x / c), iy, Math.floor(s.p.z / c));
    let a = this.map.get(k); if (!a) this.map.set(k, a = []);
    a.push(s); this.maxCy = Math.max(this.maxCy, iy);
  }
  query(p, rad, fn) {
    const c = this.cell;
    const x0 = Math.floor((p.x - rad) / c), x1 = Math.floor((p.x + rad) / c);
    const y0 = Math.floor((p.y - rad) / c), y1 = Math.floor((p.y + rad) / c);
    const z0 = Math.floor((p.z - rad) / c), z1 = Math.floor((p.z + rad) / c);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const a = this.map.get(this.key(x, y, z)); if (!a) continue;
      for (const s of a) if (fn(s)) return true;
    }
    return false;
  }
  queryColumn(px, pz, rad, fn) {
    const c = this.cell;
    const x0 = Math.floor((px - rad) / c), x1 = Math.floor((px + rad) / c);
    const z0 = Math.floor((pz - rad) / c), z1 = Math.floor((pz + rad) / c);
    for (let x = x0; x <= x1; x++) for (let y = -1; y <= this.maxCy; y++) for (let z = z0; z <= z1; z++) {
      const a = this.map.get(this.key(x, y, z)); if (!a) continue;
      for (const s of a) if (fn(s)) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------- materials (created on first build)
function mulberry(a) { const r = new RNG(a); return () => r.next(); }
function metalTexture(withSeam) {
  const s = 512, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#cdd0d4'; g.fillRect(0, 0, s, s);
  const rnd = mulberry(withSeam ? 11 : 23);
  // galvanized spangle: overlapping irregular flakes, drawn wrapped so the tile repeats
  for (let i = 0; i < 700; i++) {
    const x = rnd() * s, y = rnd() * s, rr = 10 + rnd() * 34, v = (205 + rnd() * 22) | 0;
    const pts = []; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + rnd() * .7; pts.push([Math.cos(a) * rr * (.55 + rnd() * .6), Math.sin(a) * rr * (.55 + rnd() * .6)]); }
    g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.22)`;
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
      g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(x + px + dx, y + py + dy) : g.moveTo(x + px + dx, y + py + dy)); g.fill();
    }
  }
  const im = g.getImageData(0, 0, s, s), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(im, 0, 0);
  if (withSeam) {
    // helical lock seam of spiral duct (diagonal across the tile = helix around the tube)
    for (const off of [-s, 0, s]) {
      g.strokeStyle = 'rgba(70,75,82,0.55)'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(0, s + off); g.lineTo(s, off); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, s + off + 6); g.lineTo(s, off + 6); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
let MAT = null;
function materials() {
  MAT ??= {
    spiral: new THREE.MeshStandardMaterial({ map: metalTexture(true), metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
    gore: new THREE.MeshStandardMaterial({ map: metalTexture(false), metalness: 1, roughness: 0.27, side: THREE.DoubleSide }),
    flex: new THREE.MeshStandardMaterial({ color: 0xe4e6ea, metalness: 1, roughness: 0.22, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2724, metalness: 0.5, roughness: 0.55 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0xfbfaf8, roughness: 0.9 }),
  };
  return MAT;
}
// Shared geometry and materials must survive disposal of one duct installation.
export function isSharedDuctResource(x) { return x === BOX || x === CYL || (MAT && Object.values(MAT).includes(x)); }

// ---------------------------------------------------------------- geometry buffers
function newBuf() { return { pos: [], nor: [], uv: [], idx: [], n: 0 }; }
function bufToGeo(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  if (b.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
  g.computeBoundingSphere();
  return g;
}

// Radius profile along one piece: [axialPos, radiusScale, slope]. Raised lips at both ends read as seams.
function makeProfile(Lax, r, straight) {
  const e = (0.004 + r * 0.012) / r;
  const bw = Math.min(0.022 + r * 0.03, Lax * 0.22);
  const p = [[0, 1 + e], [bw, 1 + e], [bw * 1.8, 1]];
  if (straight && Lax > 3.4) {
    // coupling joints of ~3 m spiral duct lengths
    const n = Math.floor(Lax / 3);
    for (let i = 1; i <= n; i++) {
      const s = Lax * i / (n + 1);
      p.push([s - bw, 1], [s - bw * .35, 1 + e], [s + bw * .35, 1 + e], [s + bw, 1]);
    }
  }
  p.push([Lax - bw * 1.8, 1], [Lax - bw, 1 + e], [Lax, 1 + e]);
  for (let j = 0; j < p.length; j++) {
    const a = p[Math.max(0, j - 1)], b = p[Math.min(p.length - 1, j + 1)];
    p[j][2] = b[0] > a[0] ? (b[1] - a[1]) * r / (b[0] - a[0]) * 0.5 : 0;
  }
  return p;
}

const _u = V(), _n = V();
// One cylindrical piece between Qa and Qb, cut by the miter planes (normals ma / mb) at both ends.
function addPiece(buf, Qa, d, ma, mb, N, B, r, Lax, cum, prof, S, nU, pitch) {
  const base = buf.n, rings = prof.length;
  const dma = d.dot(ma), dmb = d.dot(mb);
  for (let k = 0; k <= S; k++) {
    const phi = k / S * Math.PI * 2, cs = Math.cos(phi), sn = Math.sin(phi);
    _u.set(N.x * cs + B.x * sn, N.y * cs + B.y * sn, N.z * cs + B.z * sn);
    const tA = -(r * _u.dot(ma)) / dma;
    const tB = -(r * _u.dot(mb)) / dmb;
    const gl = Lax + tB - tA;
    for (let j = 0; j < rings; j++) {
      const [s, sc, sl] = prof[j];
      const g = s / Lax * gl, t = tA + g, rr = r * sc;
      buf.pos.push(Qa.x + _u.x * rr + d.x * t, Qa.y + _u.y * rr + d.y * t, Qa.z + _u.z * rr + d.z * t);
      _n.copy(_u).addScaledVector(d, -sl).normalize();
      buf.nor.push(_n.x, _n.y, _n.z);
      buf.uv.push(k / S * nU, (cum + t) / pitch);
    }
  }
  for (let k = 0; k < S; k++) for (let j = 0; j < rings - 1; j++) {
    const a = base + k * rings + j, b = a + rings;
    buf.idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  buf.n += (S + 1) * rings;
}

function anyPerp(d) {
  const ref = Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  return V().crossVectors(d, ref).normalize();
}

// Polyline of points -> mitered pieces (straight runs and elbow gores).
function buildMitered(Q, types, r, bufs) {
  const m = Q.length - 1, S = r > 0.45 ? 56 : 40;
  const nU = Math.max(2, Math.round(2 * Math.PI * r / 0.5)), pitch = 0.3;
  const D = [], M = [];
  for (let i = 0; i < m; i++) D.push(Q[i + 1].clone().sub(Q[i]).normalize());
  M[0] = D[0].clone();
  for (let i = 1; i < m; i++) M[i] = D[i - 1].clone().add(D[i]).normalize();
  M[m] = D[m - 1].clone();
  const N = anyPerp(D[0]), q = new THREE.Quaternion();
  let cum = 0;
  for (let i = 0; i < m; i++) {
    if (i > 0) {
      q.setFromUnitVectors(D[i - 1], D[i]); N.applyQuaternion(q);
      N.addScaledVector(D[i], -N.dot(D[i])).normalize();
    }
    const B = V().crossVectors(D[i], N);
    const Lax = Q[i].distanceTo(Q[i + 1]);
    const straight = types[i] === 'straight';
    addPiece(straight ? bufs.straight : bufs.gore, Q[i], D[i], M[i], M[i + 1], N, B, r, Lax, cum,
      makeProfile(Lax, r, straight), S, nU, pitch);
    cum += Lax;
  }
  return cum;
}

// Corner polyline -> rounded polyline with gored elbows.
function roundCorners(pts, Rs, goresPer90) {
  const Q = [pts[0].clone()], T = [];
  let elbows = 0, gores = 0;
  const push = (P, t) => { if (P.distanceTo(Q[Q.length - 1]) < 1e-4) return; Q.push(P); T.push(t); };
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k].clone().sub(pts[k - 1]).normalize();
    const b = pts[k + 1].clone().sub(pts[k]).normalize();
    const th = Math.acos(clamp(a.dot(b), -1, 1));
    if (th < 1e-3) continue;
    const R = Rs[k], t = R * Math.tan(th / 2);
    const S0 = pts[k].clone().addScaledVector(a, -t);
    const nrm = b.clone().addScaledVector(a, -a.dot(b)).normalize();
    const O = S0.clone().addScaledVector(nrm, R);
    const g = Math.max(2, Math.round(goresPer90 * th / (Math.PI / 2)));
    push(S0, 'straight');
    for (let j = 1; j <= g; j++) {
      const f = th * j / g;
      push(O.clone().addScaledVector(nrm, -R * Math.cos(f)).addScaledVector(a, R * Math.sin(f)), 'gore');
    }
    elbows++; gores += g;
  }
  push(pts[pts.length - 1].clone(), 'straight');
  return { Q, T, elbows, gores };
}

// ---------------------------------------------------------------- generation state
let rng, hash, room, maxR;
const CLR = 0.12;          // clearance between different ducts
const STEP = 0.2;          // collision sampling step

const AXES = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];
const DIAGS = [];
for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) for (const si of [1, -1]) for (const sj of [1, -1]) {
  const c = [0, 0, 0]; c[i] = si; c[j] = sj; DIAGS.push(V(...c).normalize());
}
const HORIZ = [V(1, 0, 0), V(-1, 0, 0), V(0, 0, 1), V(0, 0, -1)];

function inBounds(q, r, b) {
  return q.x - r >= b.x0 && q.x + r <= b.x1 && q.y - r >= b.y0 - 1e-6 && q.y + r <= b.y1 &&
    q.z - r >= b.z0 && q.z + r <= b.z1;
}
function distToBounds(p, d, r, b) {
  let t = Infinity;
  const ax = [['x', b.x0, b.x1], ['y', b.y0, b.y1], ['z', b.z0, b.z1]];
  for (const [k, lo, hi] of ax) {
    if (d[k] > 1e-6) t = Math.min(t, (hi - r - p[k]) / d[k]);
    else if (d[k] < -1e-6) t = Math.min(t, (lo + r - p[k]) / d[k]);
  }
  return Math.max(0, t);
}
function collides(q, r, id, seg) {
  return hash.query(q, r + maxR + CLR, o => {
    if (o.duct === id && o.seg >= seg - 1) return false;
    const lim = r + o.r + (o.duct === id ? 0.03 : CLR);
    return o.p.distanceToSquared(q) < lim * lim;
  });
}
function segmentFree(p, d, L, r, id, seg, b, skipStart = 0, skipEnd = 0) {
  const q = V();
  for (let s = 0; ; s += STEP) {
    if (s > L) s = L;
    q.copy(p).addScaledVector(d, s);
    if (s >= skipStart && s <= L - skipEnd && !inBounds(q, r, b)) return false;
    if (collides(q, r, id, seg)) return false;
    if (s >= L) return true;
  }
}
function register(p, d, L, r, id, seg, kind) {
  for (let s = 0; ; s += STEP) {
    if (s > L) s = L;
    hash.add({ p: p.clone().addScaledVector(d, s), r, duct: id, seg, kind });
    if (s >= L) break;
  }
}
const snapLen = (L, d) => {
  const unit = 0.25 / Math.max(Math.abs(d.x), Math.abs(d.y), Math.abs(d.z));
  return Math.round(L / unit) * unit;
};

function regionFor(mode, c) {
  const m = 0.25;
  const base = { x0: room.x0 + m, x1: room.x1 - m, z0: room.z0 + m, z1: room.z1 - m, y0: 0, y1: room.y1 - 0.05 };
  if (mode === 'floor') base.y1 = Math.min(room.y1 - 0.2, lerp(2.6, 4.6, c));
  if (mode === 'wall') { base.z0 = room.z0; base.z1 = Math.min(room.z1 - m, room.z0 + lerp(1.3, 3.2, c)); }
  if (mode === 'ceiling') base.y0 = Math.max(0, room.y1 - lerp(2.4, 4.2, c));
  return base;
}

// ---------------------------------------------------------------- rigid duct: orthogonal / diagonal random walk
function pickStart(sp, reg) {
  const { r, R } = sp;
  const rx = () => Math.round(rng.range(reg.x0 + r + 0.4, reg.x1 - r - 0.4) * 4) / 4;
  const rz = () => Math.round(rng.range(reg.z0 + r + 0.4, reg.z1 - r - 0.4) * 4) / 4;
  if (sp.mode === 'floor') {
    if (rng.chance(0.35)) {
      const d = rng.pick(HORIZ);
      return { p: V(rx(), r, rz()), d, L: snapLen(rng.range(R + 0.6, sp.maxL + 1), d), skip: 0 };
    }
    const top = reg.y1 - r;
    if (top < R + 0.5) return null;
    return { p: V(rx(), 0, rz()), d: V(0, 1, 0), L: snapLen(rng.range(R + 0.5, top), V(0, 1, 0)), skip: r + 0.05 };
  }
  if (sp.mode === 'wall') {
    if (rng.chance(0.6)) {
      const y = Math.round(rng.range(r + 0.4, reg.y1 - r - 0.4) * 4) / 4;
      const L = Math.max(R, r + 0.08) + Math.round(rng.range(0, 0.2 + sp.c * 0.6) * 4) / 4;
      return { p: V(rx(), y, room.z0), d: V(0, 0, 1), L, skip: r + 0.05 };
    }
    const z = room.z0 + r + 0.1 + Math.round(rng.range(0, 0.6) * 4) / 4;
    return { p: V(rx(), 0, z), d: V(0, 1, 0), L: snapLen(rng.range(R + 0.5, reg.y1 - r), V(0, 1, 0)), skip: r + 0.05 };
  }
  // ceiling
  const span = room.y1 - reg.y0 - r;
  if (span < R + 0.4) return null;
  return { p: V(rx(), room.y1, rz()), d: V(0, -1, 0), L: snapLen(rng.range(R + 0.4, span), V(0, -1, 0)), skip: r + 0.05 };
}

function pickDir(prev, sp, cur, reg) {
  const cands = [], w = [];
  const list = sp.diagP > 0 ? AXES.concat(DIAGS) : AXES;
  for (const nd of list) {
    const dot = prev.dot(nd);
    if (dot > 0.999) continue;
    if (Math.acos(clamp(dot, -1, 1)) > sp.maxTurn + 1e-3) continue;
    const isDiag = Math.abs(nd.x) + Math.abs(nd.y) + Math.abs(nd.z) > 1.01;
    let wt = isDiag ? sp.diagP : 1;
    if (!isDiag && Math.abs(nd.y) > 0.9) wt *= sp.vertW;
    if (isDiag && Math.abs(nd.y) > 0.1) wt *= 0.7;
    if (sp.mode === 'wall' && Math.abs(nd.z) > 0.1) wt *= 0.18;
    wt *= Math.min(1, distToBounds(cur, nd, sp.r, reg) / 3) + 0.02;
    cands.push(nd); w.push(wt);
  }
  return cands.length ? rng.weighted(cands, w) : null;
}

function genRigid(sp) {
  const { r, id } = sp;
  const reg = regionFor(sp.mode, sp.c);
  let st = null;
  for (let a = 0; a < 40 && !st; a++) {
    const s = pickStart(sp, reg);
    if (s && s.L > 0.3 && segmentFree(s.p, s.d, s.L, r, id, 0, reg, s.skip)) st = s;
  }
  if (!st) return null;
  register(st.p, st.d, st.L, r, id, 0, 'rigid');
  const pts = [st.p.clone(), st.p.clone().addScaledVector(st.d, st.L)];
  const Rs = [];
  let dir = st.d.clone(), lastL = st.L, lastT = 0, seg = 1;

  const cornerR = () => sp.R * (sp.c > 0.5 ? rng.range(0.9, 1.6) : 1);

  for (let turn = 0; turn < sp.N; turn++) {
    const cur = pts[pts.length - 1];
    let ok = false;
    for (let a = 0; a < 30 && !ok; a++) {
      const nd = pickDir(dir, sp, cur, reg); if (!nd) break;
      const th = dir.angleTo(nd), Rk = cornerR(), T = Rk * Math.tan(th / 2);
      if (lastL - lastT < T - 1e-6) continue;
      const minL = T + sp.R + 0.05;
      const avail = distToBounds(cur, nd, r, reg);
      if (avail < minL) continue;
      let L;
      if (nd.y < -0.9 && rng.chance(0.3) && cur.y - r >= minL) L = cur.y - r;   // drop down to lie on the floor
      else {
        L = snapLen(rng.range(minL, Math.max(minL, Math.min(avail, sp.maxL))), nd);
        if (L < minL) L += 0.25 / Math.max(Math.abs(nd.x), Math.abs(nd.y), Math.abs(nd.z));
        L = Math.min(L, avail);
      }
      for (const tryL of [L, Math.max(minL, L * 0.6), minL]) {
        if (tryL < minL - 1e-6) continue;
        if (segmentFree(cur, nd, tryL, r, id, seg, reg)) {
          register(cur, nd, tryL, r, id, seg, 'rigid');
          Rs[pts.length - 1] = Rk;
          pts.push(cur.clone().addScaledVector(nd, tryL));
          dir = nd.clone(); lastL = tryL; lastT = T; seg++; ok = true; break;
        }
      }
    }
    if (!ok) break;
  }

  // terminate: connect into a surface (floor / wall / ceiling) or stay as an open mouth
  if (rng.chance(0.65)) {
    const cur = pts[pts.length - 1];
    const opts = [];
    if (sp.mode === 'wall') opts.push([V(0, 0, -1), cur.z - room.z0]);
    if (sp.mode === 'ceiling') opts.push([V(0, 1, 0), room.y1 - cur.y]);
    if (cur.y - r > 0.05) opts.push([V(0, -1, 0), cur.y]);
    const full = { x0: room.x0, x1: room.x1, y0: 0, y1: room.y1, z0: room.z0, z1: room.z1 };
    for (const [nd, L] of opts) {
      const th = dir.angleTo(nd);
      if (th < 1e-3 || th > Math.PI / 2 + 1e-3) continue;
      const Rk = cornerR(), T = Rk * Math.tan(th / 2);
      if (lastL - lastT < T - 1e-6 || L < T + 0.1) continue;
      if (segmentFree(cur, nd, L, r, id, seg, full, 0, r + 0.05)) {
        register(cur, nd, L, r, id, seg, 'rigid');
        Rs[pts.length - 1] = Rk;
        pts.push(cur.clone().addScaledVector(nd, L));
        break;
      }
    }
  }
  return { pts, Rs };
}

// ---------------------------------------------------------------- flexible duct: steering walk, piled on the floor
function genFlex(sp) {
  const { r, c, id } = sp, ds = 0.1;
  const W = room.x1 - room.x0, D = room.z1 - room.z0;
  const hx = Math.min(lerp(3.4, 1.5, c) + r * 2 + rng.range(-0.3, 0.5), W / 2 - 0.5);
  const hz = Math.min(hx * 0.8, D / 2 - 0.5);
  if (hx <= 0.3 || hz <= 0.3) return null;
  const cx = rng.range(room.x0 + hx + 0.3, room.x1 - hx - 0.3);
  const cz = rng.range(room.z0 + hz + 0.3, room.z1 - hz - 0.3);
  const maxK = 1 / (r * lerp(4.5, 1.25, c));
  const steps = Math.round(sp.length / ds);

  // Rigid ducts and placed objects are both solid for a hose lying on the floor.
  const blocked = (x, z) => hash.queryColumn(x, z, r + maxR + 0.05, o => {
    if ((o.kind !== 'rigid' && o.kind !== 'obstacle') || o.p.y - o.r > 2 * r + 0.15) return false;
    const lim = r + o.r + 0.04, dx = o.p.x - x, dz = o.p.z - z;
    return dx * dx + dz * dz < lim * lim;
  });

  let x, z, ok = false;
  for (let a = 0; a < 40 && !ok; a++) {
    x = cx + rng.range(-hx, hx) * 0.7; z = cz + rng.range(-hz, hz) * 0.7;
    ok = !blocked(x, z);
  }
  if (!ok) return null;
  let th = rng.range(0, Math.PI * 2), om = 0;
  const P = [[x, z]];
  for (let i = 0; i < steps; i++) {
    om += rng.gauss() * maxK * 0.25;
    if (rng.chance(lerp(0.004, 0.03, c))) om = -om * rng.range(0.5, 1);
    const ex = (x - cx) / hx, ez = (z - cz) / hz, e = Math.hypot(ex, ez);
    if (e > 0.75) {
      let dt = Math.atan2(cz - z, cx - x) - th;
      dt = Math.atan2(Math.sin(dt), Math.cos(dt));
      om += Math.sign(dt) * maxK * (e - 0.75) * 1.2;
    }
    om = clamp(om, -maxK, maxK);
    let moved = false;
    for (let t = 0; t < 9 && !moved; t++) {
      const off = t === 0 ? 0 : (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.22;
      const nt = th + om * ds + off;
      const nx = x + Math.cos(nt) * ds, nz = z + Math.sin(nt) * ds;
      if (nx - r < room.x0 || nx + r > room.x1 || nz - r < room.z0 || nz + r > room.z1) continue;
      if (blocked(nx, nz)) continue;
      th = nt; x = nx; z = nz; moved = true;
    }
    if (!moved) break;
    P.push([x, z]);
  }
  const n = P.length;
  if (n < 25) return null;

  // heights: rest on the floor, drape over earlier hoses, occasional lifted arches at high complexity
  const base = new Float64Array(n).fill(r);
  const arches = Math.floor(rng.next() * c * 3.2);
  for (let a = 0; a < arches; a++) {
    const ci = Math.floor(rng.range(0.15, 0.85) * n), hw = Math.round(rng.range(0.8, 1.7) / ds), h = rng.range(0.5, 1.3);
    for (let i = Math.max(0, ci - hw); i < Math.min(n, ci + hw); i++) base[i] = Math.max(base[i], r + h * Math.sin(Math.PI * (i - ci + hw) / (2 * hw)) ** 2);
  }
  let ys = Float64Array.from(base);
  const win = Math.ceil((2 * r + 0.25) / ds), drop = lerp(0.7, 1.0, c) * ds;
  for (let iter = 0; iter < 3; iter++) {
    const own = new SpatialHash(1);
    for (let j = 0; j < n; j++) own.add({ p: V(P[j][0], ys[j], P[j][1]), r, j });
    const sup = Float64Array.from(base);
    for (let i = 0; i < n; i++) {
      const [px, pz] = P[i];
      const lift = o => {
        const lim = r + o.r, dx = o.p.x - px, dz = o.p.z - pz, hd2 = dx * dx + dz * dz;
        if (hd2 < lim * lim) sup[i] = Math.max(sup[i], o.p.y + Math.sqrt(lim * lim - hd2) * 0.94);
        return false;
      };
      hash.queryColumn(px, pz, r + maxR, o => o.kind === 'flex' && lift(o));
      own.queryColumn(px, pz, 2 * r, o => o.j < i - win && lift(o));
    }
    const y = Float64Array.from(sup);
    for (let i = 1; i < n; i++) y[i] = Math.max(y[i], y[i - 1] - drop);
    for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - drop);
    for (let pass = 0; pass < 3; pass++) {
      const t = Float64Array.from(y);
      for (let i = 1; i < n - 1; i++) y[i] = Math.max(sup[i] * 0.995, 0.25 * t[i - 1] + 0.5 * t[i] + 0.25 * t[i + 1]);
    }
    ys = y;
  }
  for (let i = 0; i < n; i += 2) hash.add({ p: V(P[i][0], ys[i], P[i][1]), r, duct: id, seg: -1, kind: 'flex' });
  const pts = [];
  for (let i = 0; i < n; i += 3) pts.push(V(P[i][0], ys[i], P[i][1]));
  if ((n - 1) % 3) pts.push(V(P[n - 1][0], ys[n - 1], P[n - 1][1]));
  return pts;
}

function buildFlex(pts, r, buf) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const len = curve.getLength();
  const pitch = 0.03 + r * 0.12, amp = 0.05;
  const rings = Math.ceil(len / (pitch / 6)), S = 36;
  const fr = curve.computeFrenetFrames(rings, false);
  const base = buf.n, P = V(), u = V();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, s = t * len;
    curve.getPointAt(t, P);
    const N = fr.normals[i], B = fr.binormals[i];
    const corr = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * s / pitch), 1.6);
    for (let k = 0; k < S; k++) {
      const phi = k / S * Math.PI * 2;
      u.set(0, 0, 0).addScaledVector(N, Math.cos(phi)).addScaledVector(B, Math.sin(phi));
      const h = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      const crinkle = (h - Math.floor(h) - 0.5) * 0.018;
      const rr = r * (1 + amp * (corr - 0.5) + crinkle);
      buf.pos.push(P.x + u.x * rr, P.y + u.y * rr, P.z + u.z * rr);
      buf.nor.push(0, 0, 0);
    }
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < S; k++) {
    const a = base + i * S + k, b = base + i * S + (k + 1) % S;
    buf.idx.push(a, b, a + S, b, b + S, a + S);
  }
  buf.n += (rings + 1) * S;
  return len;
}

function flexGeometry(buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.idx, 1) : new THREE.Uint16BufferAttribute(buf.idx, 1));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- supports (recorded, meshed in buildDuct)
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
function box(g, x, y, z, sx, sy, sz, rotY = 0) { g.push({ t: 'box', x, y, z, sx, sy, sz, rotY }); }
function rod(g, a, b, rad) { g.push({ t: 'rod', a, b, rad }); }
function strap(g, p, d, r) { g.push({ t: 'strap', p, d, r }); }

function addSupports(Q, T, sp, g, counter) {
  const r = sp.r;
  for (let i = 0; i < T.length; i++) {
    if (T[i] !== 'straight') continue;
    const a = Q[i], b = Q[i + 1], L = a.distanceTo(b);
    if (L < 1.1) continue;
    const d = b.clone().sub(a).normalize();
    const nearWall = sp.mode === 'wall' && Math.min(a.z, b.z) - r - room.z0 < 0.9 && Math.abs(d.z) < 0.1;
    if (nearWall) {
      const n = Math.max(1, Math.round(L / 2.2));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(b, (k + 0.5) / n);
        if (p.y - r < 0.05) continue;
        rod(g, V(p.x, p.y, room.z0), V(p.x, p.y, p.z - r), 0.014);
        strap(g, p, d, r); counter.n++;
      }
      continue;
    }
    if (Math.abs(d.y) > 0.05) continue;
    const y = a.y, bottom = y - r;
    if (bottom < 0.04 || !rng.chance(0.75)) continue;
    const n = Math.max(1, Math.round(L / 3.2));
    for (let k = 0; k < n; k++) {
      const p = a.clone().lerp(b, (k + 0.5) / n);
      const below = hash.queryColumn(p.x, p.z, maxR + 0.1, o => {
        if (o.kind === 'obstacle' || o.p.y + o.r > bottom - 0.02) return false;
        const lim = o.r + 0.08, dx = o.p.x - p.x, dz = o.p.z - p.z; return dx * dx + dz * dz < lim * lim;
      });
      const above = hash.queryColumn(p.x, p.z, maxR + 0.1, o => {
        if (o.kind === 'obstacle' || o.p.y - o.r < y + r + 0.02) return false;
        const lim = o.r + 0.08, dx = o.p.x - p.x, dz = o.p.z - p.z; return dx * dx + dz * dz < lim * lim;
      });
      if (bottom < 3.4 && !below) {
        // floor stand with U cradle, as in the reference photos
        const px = -d.z, pz = d.x, rotY = Math.atan2(-pz, px);
        box(g, p.x, (bottom - 0.03) / 2, p.z, 0.035, bottom - 0.03, 0.035);
        box(g, p.x, 0.006, p.z, 0.2, 0.012, 0.2);
        box(g, p.x, bottom - 0.015, p.z, 2 * r + 0.1, 0.03, 0.03, rotY);
        for (const s of [-1, 1]) {
          const o = r + 0.035;
          box(g, p.x + px * o * s, bottom - 0.03 + (r + 0.03) / 2, p.z + pz * o * s, 0.03, r + 0.03, 0.03, rotY);
        }
        counter.n++;
      } else if (!above && room.y1 - (y + r) > 0.05) {
        rod(g, V(p.x, y + r, p.z), V(p.x, room.y1, p.z), 0.006);
        strap(g, p, d, r); counter.n++;
      }
    }
  }
}

// ---------------------------------------------------------------- generation
export function normalizeDuctParams(p) {
  const out = {...DUCT_DEFAULTS, ...p};
  for (const [k, [lo, hi]] of Object.entries(DUCT_LIMITS)) out[k] = clamp(Number.isFinite(+out[k]) ? +out[k] : DUCT_DEFAULTS[k], lo, hi);
  out.count = Math.round(out.count);
  if (!['auto', 'rigid', 'flex', 'mix'].includes(out.type)) out.type = 'auto';
  if (!['auto', 'floor', 'wall', 'ceiling', 'mixed'].includes(out.mode)) out.mode = 'auto';
  out.seed = (parseInt(out.seed, 10) >>> 0) || 1;
  for (const k of ['supports', 'plinth', 'avoid']) out[k] = !!out[k];
  return out;
}

// obstacles: boxes in the generator's own Y-up frame {x0,x1,y0,y1,z0,z1}; filled
// with samples so ducts route around objects placed inside the region.
export function planDuct(params, obstacles = []) {
  const P = normalizeDuctParams(params);
  rng = new RNG(P.seed);
  hash = new SpatialHash(1);
  const ph = P.plinth ? 0.15 : 0;
  room = { x0: -P.W / 2, x1: P.W / 2, z0: -P.D / 2, z1: P.D / 2, y0: 0, y1: P.H - ph };
  const c = (P.complexity - 1) / 9;

  const sceneMode = P.mode === 'auto' ? rng.weighted(['floor', 'wall', 'ceiling', 'mixed'], [0.45, 0.25, 0.15, 0.15]) : P.mode;
  const typeMode = P.type === 'auto' ? rng.weighted(['rigid', 'flex', 'mix'], [0.6, 0.15, 0.25]) : P.type;
  const count = P.count || 1 + Math.floor(rng.next() * lerp(1.6, 4.6, c));

  const turnsBase = lerp(3, 26, c), Rratio = lerp(3.0, 1.1, c);
  const goresPer90 = Math.round(lerp(5, 4, c));
  const specs = [];
  for (let i = 0; i < count; i++) {
    let kind = typeMode;
    if (typeMode === 'mix') kind = count >= 2 && i < 2 ? ['rigid', 'flex'][i] : (rng.chance(0.4) ? 'flex' : 'rigid');
    let r = P.diameter / 2 * rng.range(0.78, 1.22);
    if (kind === 'flex') r *= 0.8;
    const mode = sceneMode === 'mixed' ? rng.pick(['floor', 'wall', 'ceiling']) : sceneMode;
    specs.push({
      id: i, kind, r, c, mode,
      R: Math.max(r * 1.08, r * Rratio * rng.range(0.9, 1.1)),
      N: Math.max(2, Math.round(turnsBase * rng.range(0.75, 1.25))),
      maxL: lerp(6.5, 1.6, c),
      diagP: c < 0.4 ? 0 : (c - 0.4) / 0.6 * 0.8,
      maxTurn: (c > 0.7 ? 135 : 90) * DEG,
      vertW: mode === 'floor' ? 0.7 : mode === 'wall' ? 1 : 0.5,
      length: lerp(10, 40, c) * rng.range(0.8, 1.2),
    });
  }
  maxR = Math.max(0.16, ...specs.map(s => s.r)) * 1.03;

  if (P.avoid) for (const o of obstacles) {
    const x0 = Math.max(room.x0, o.x0), x1 = Math.min(room.x1, o.x1), z0 = Math.max(room.z0, o.z0), z1 = Math.min(room.z1, o.z1);
    const y0 = Math.max(0, o.y0 - ph), y1 = Math.min(room.y1, o.y1 - ph);
    if (x0 >= x1 || z0 >= z1 || y0 >= y1) continue;
    const step = 0.2, nx = Math.ceil((x1 - x0) / step), ny = Math.ceil((y1 - y0) / step), nz = Math.ceil((z1 - z0) / step);
    if (nx * ny * nz > 6000) continue;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++)
      hash.add({ p: V(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny, z0 + (z1 - z0) * k / nz), r: 0.15, duct: -1, seg: 0, kind: 'obstacle' });
  }

  const bufs = { straight: newBuf(), gore: newBuf(), flex: newBuf() };
  const supports = [];
  const st = { ducts: 0, length: 0, elbows: 0, gores: 0, flex: 0, supports: { n: 0 } };

  for (const sp of specs.filter(s => s.kind === 'rigid')) {
    const res = genRigid(sp);
    if (!res || res.pts.length < 2) continue;
    const { Q, T, elbows, gores } = roundCorners(res.pts, res.Rs, goresPer90);
    st.length += buildMitered(Q, T, sp.r, bufs);
    st.ducts++; st.elbows += elbows; st.gores += gores;
    if (P.supports) addSupports(Q, T, sp, supports, st.supports);
  }
  for (const sp of specs.filter(s => s.kind === 'flex')) {
    const pts = genFlex(sp);
    if (!pts) continue;
    const L = buildFlex(pts, sp.r, bufs.flex);
    st.length += L; st.flex += L; st.ducts++;
  }
  const samples = [];
  for (const list of hash.map.values()) for (const s of list) if (s.kind !== 'obstacle') samples.push([s.p.x, s.p.y + ph, s.p.z, s.r]);

  return {
    params: P, ph, bufs, supports, samples, sceneMode, typeMode, count,
    rules: [
      ['굽힘 수 (덕트당)', `≈ ${Math.round(turnsBase)}`],
      ['굽힘 반경 R / 직경', (Rratio / 2).toFixed(2)],
      ['직관 최대 길이', `${lerp(6.5, 1.6, c).toFixed(1)} m`],
      ['최대 꺾임각', `${c > 0.7 ? 135 : 90}°`],
      ['사선(45°) 비율', `${Math.round((c < 0.4 ? 0 : (c - 0.4) / 0.6 * 0.8) * 100)}%`],
      ['엘보 조각 / 90°', goresPer90],
    ],
    stats: [
      ['설치 방식', MODE_KO[sceneMode]],
      ['덕트 종류', TYPE_KO[typeMode]],
      ['덕트 수', `${st.ducts} / ${count}`],
      ['총 길이', `${st.length.toFixed(1)} m`],
      ['엘보', `${st.elbows} 개 (${st.gores} 조각)`],
      ['플렉시블', `${st.flex.toFixed(1)} m`],
      ['지지대', `${st.supports.n} 개`],
    ],
    totals: { ducts: st.ducts, length: st.length },
  };
}

// Y-up group in the generator frame (floor at y=0, region centred on the origin).
export function buildDuct(plan) {
  const M = materials(), install = new THREE.Group();
  for (const [k, mat] of [['straight', M.spiral], ['gore', M.gore]]) {
    if (!plan.bufs[k].n) continue;
    const m = new THREE.Mesh(bufToGeo(plan.bufs[k]), mat);
    m.castShadow = m.receiveShadow = true; m.name = k === 'straight' ? 'spiral-duct' : 'elbows';
    install.add(m);
  }
  if (plan.bufs.flex.n) {
    const m = new THREE.Mesh(flexGeometry(plan.bufs.flex), M.flex);
    m.castShadow = m.receiveShadow = true; m.name = 'flex-duct'; install.add(m);
  }
  const supports = new THREE.Group(); supports.name = 'supports';
  for (const s of plan.supports) {
    let m;
    if (s.t === 'box') { m = new THREE.Mesh(BOX, M.steel); m.position.set(s.x, s.y, s.z); m.scale.set(s.sx, s.sy, s.sz); m.rotation.y = s.rotY; }
    else if (s.t === 'rod') { const d = s.b.clone().sub(s.a), L = d.length(); m = new THREE.Mesh(CYL, M.steel); m.position.copy(s.a).addScaledVector(d, 0.5); m.scale.set(s.rad, L, s.rad); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); }
    else { m = new THREE.Mesh(new THREE.TorusGeometry(s.r + 0.012, 0.012, 6, 48), M.steel); m.position.copy(s.p); m.quaternion.setFromUnitVectors(V(0, 0, 1), s.d); }
    m.castShadow = true; supports.add(m);
  }
  install.add(supports);
  install.position.y = plan.ph;
  const root = new THREE.Group(); root.add(install);
  // plinth under the installation footprint
  if (plan.ph && install.children.length) {
    const bb = new THREE.Box3().setFromObject(install), W = plan.params.W / 2, D = plan.params.D / 2;
    if (!bb.isEmpty()) {
      const x0 = Math.max(-W, bb.min.x - 0.5), x1 = Math.min(W, bb.max.x + 0.5), z0 = Math.max(-D, bb.min.z - 0.5), z1 = Math.min(D, bb.max.z + 0.5);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, plan.ph, z1 - z0), M.plinth);
      pl.position.set((x0 + x1) / 2, plan.ph / 2, (z0 + z1) / 2);
      pl.castShadow = pl.receiveShadow = true; pl.name = 'plinth';
      root.add(pl);
    }
  }
  return root;
}

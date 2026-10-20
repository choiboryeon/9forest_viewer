import test from 'node:test';
import assert from 'node:assert/strict';
import {canPlace, canWalk, fitPlacement, floorAt} from '../src/spatial.js';
import {planWalk} from '../src/walk_path.js';

const rect = (id, bounds, z = 0) => ({id, bounds, z});
const room = (floorRegions, obstacles = [], entrance = [1, 1]) => ({bounds: {min: [-1, -2], max: [8, 5]}, floorRegions, obstacles, entrance});
const item = (id, x, y) => ({id, x, y, hx: .2, hy: .2, blocks: true, focusZ: 1});

test('legacy Nightshift rectangle accepts inner footprints and rejects oversized objects', () => {
  const meta = {width_m: 6, depth_m: 4.6};
  assert.equal(canPlace(meta, 3, 2, .5, .5), true);
  assert.equal(canPlace(meta, .5, 2, .5, .5), false);
  assert.equal(floorAt(meta, 3, 2), 0);
  assert.equal(fitPlacement(meta, 3, 2, 4, 3), null);
  assert.deepEqual(fitPlacement(meta, -3, 2, .5, .5), {x: .54, y: 2});
});

test('floor union permits seam-spanning footprints and catches internal gaps', () => {
  const union = room([rect('left', [0, 0, 2, 4]), rect('right', [2, 0, 4, 4])]);
  assert.equal(canPlace(union, 2, 2, 1, 1), true);
  const l = room([rect('base', [0, 0, 4, 1]), rect('upright', [0, 1, 1, 4])]);
  assert.equal(canPlace(l, 1, 1, .5, .5), false);
  const hole = room([rect('left', [0, 0, 1, 4]), rect('right', [3, 0, 4, 4]), rect('bottom', [1, 0, 3, 1]), rect('top', [1, 3, 3, 4])]);
  assert.equal(canPlace(hole, 2, 2, 1.7, 1.7), false, 'all four corners are supported but the center is not');
  const fit = fitPlacement(l, 2, 2, .2, .2);
  assert.ok(fit && canPlace(l, fit.x, fit.y, .2, .2));
  assert.ok(Math.abs(Math.hypot(fit.x - 2, fit.y - 2) - 1.24) < 1e-8);
});

test('raised floors, stairs, thin partitions, glass, and overhead lintels', () => {
  const meta = room([rect('lobby', [-1, -2, 4, 4]), rect('raised', [4, -2, 8, 4], .03), rect('stairs', [0, 4, 1, 5], -.2)], [
    {bounds: [2, 0, 2.01, 4], minZ: 0, maxZ: 2.7, kind: 'partition'},
    {bounds: [4.8, -2, 4.9, 4], minZ: .03, maxZ: 2.5, kind: 'window'},
    {bounds: [6, 0, 7, 1], minZ: 2.1, maxZ: 2.7, kind: 'wall'},
    {bounds: [6, 2, 7, 3], minZ: 1, maxZ: 1.3, kind: 'window'},
  ]);
  assert.equal(floorAt(meta, 5, -1), .03);
  assert.equal(canPlace(meta, .5, 4.5, .1, .1), false);
  assert.equal(canPlace(meta, 2.005, 2, .2, .2), false);
  assert.equal(canWalk(meta, 4.85, 2), false);
  assert.equal(canWalk(meta, 6.5, .5), true);
  assert.equal(canPlace(meta, 6.5, .5, .1, .1, .04, {bottom: .03, top: 2.5}), false);
  assert.equal(canWalk(meta, 6.5, 2.5), false);
  assert.equal(canPlace(meta, 6.5, 2.5, .1, .1), true);
});

test('hanging objects move clear of lintels, using each candidate floor height', () => {
  const meta = room([rect('main', [0, 0, 8, 4], .03)], [
    {bounds: [3.9, 0, 4.1, 4], minZ: 2.1, maxZ: 2.7, kind: 'wall'}
  ]);
  assert.deepEqual(fitPlacement(meta, 4, 2, .2, .2), {x: 4, y: 2});
  const vertical = {bottom: 1.95, top: 2.5};
  const fit = fitPlacement(meta, 4, 2, .2, .2, vertical);
  assert.ok(fit);
  assert.ok(Math.abs(fit.x - 4) >= .34 - 1e-8);
  assert.ok(canPlace(meta, fit.x, fit.y, .2, .2, .04, {bottom: 1.98, top: 2.53}));
});

test('walking never pretends to visit an artwork in a disconnected room', () => {
  const meta = room([rect('lobby', [0, 0, 4, 4]), rect('side', [4, 0, 8, 4])], [{bounds: [3.95, 0, 4.05, 4], minZ: 0, maxZ: 2.7}], [1, 1]);
  const plan = planWalk({metadata: meta, objects: [item('near', 2, 2), item('unreachable', 4.5, 2)]});
  assert.equal(plan.noWalk, false);
  assert.equal(plan.visits, 1);
  assert.equal(plan.skipped, 1);
  assert.deepEqual(plan.skippedIds, ['unreachable']);
  assert.ok(plan.segments.every(s => s.id !== 'unreachable'));
});

test('route samples stay on native negative-Y floors and clear a partition doorway', () => {
  const meta = room([rect('main', [0, -2, 8, 4])], [{bounds: [3.9, -2, 4.1, 1], minZ: 0, maxZ: 2.7}], [1, -1]);
  const objects = [item('target', 6.5, -.8)];
  const plan = planWalk({metadata: meta, objects});
  assert.equal(plan.visits, 1);
  assert.ok(plan.start[1] < 0);
  const paths = plan.segments.filter(s => s.kind === 'move').flatMap(s => s.path.slice(1).map((p, i) => [s.path[i], p]));
  assert.ok(paths.length > 1);
  for (const [a, b] of paths) for (let t = 0; t <= 1; t += .01) {
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    assert.ok(canWalk(meta, x, y), `unsafe route at ${x},${y}`);
    assert.ok(Math.abs(x - objects[0].x) >= .44 - 1e-8 || Math.abs(y - objects[0].y) >= .44 - 1e-8);
  }
});

test('no safe cells returns an explicit empty route', () => {
  const meta = room([rect('tiny', [0, 0, .2, .2])]);
  const plan = planWalk({metadata: meta, objects: [item('target', .1, .1)]});
  assert.equal(plan.noWalk, true);
  assert.equal(plan.start, null);
  assert.deepEqual(plan.segments, []);
  assert.equal(plan.visits, 0);
  assert.equal(plan.skipped, 1);
});

test('original Nightshift walk signature still produces usable tours', () => {
  const plan = planWalk({width: 6, depth: 4.6, door: {x_m: 4.55, width_m: .9}, objects: [item('a', 2, 2)]});
  assert.equal(plan.noWalk, false);
  assert.equal(plan.visits, 1);
  assert.ok(plan.start[0] > 4.7 && plan.start[1] > 4);
});

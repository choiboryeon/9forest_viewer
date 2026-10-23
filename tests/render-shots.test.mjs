import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canWalk} from '../src/spatial.js';
import {planShots, stageFov, cropFov, cropRect} from '../src/render-shots.js';

const read = id => JSON.parse(fs.readFileSync(new URL(`../data/${id}-room.json`, import.meta.url), 'utf8')).metadata;
const box = (x, y, w, d, z0, z1) => ({x0: x - w / 2, x1: x + w / 2, y0: y - d / 2, y1: y + d / 2, z0, z1});

test('an empty layout has no suggested cuts', () => {
  assert.deepEqual(planShots({meta: {width_m: 6, depth_m: 4.6}, targets: []}), []);
});

test('Night Shift cuts stand inside the room, look down, and frame every object', () => {
  const meta = read('nightshift');
  const targets = [box(1.6, 1.2, .4, .4, 0, .6), box(3.2, 2.4, .5, .5, .18, .9), box(4.4, 1.4, .3, .3, 1.2, 1.7)].map((b, i) => ({id: `T${i}`, box: b}));
  const shots = planShots({meta, targets, aspect: 1.5, count: 4});
  assert.equal(shots.length, 4);
  for (const s of shots) {
    assert.ok(canWalk(meta, s.position[0], s.position[1]), `${s.label} stands on the floor`);
    assert.ok(s.target[2] < s.position[2], `${s.label} never looks upward`);
    assert.ok(s.fov >= 30 && s.fov <= 62);
    assert.equal(s.visible, 3, `${s.label} frames all objects`);
  }
  const keys = new Set(shots.map(s => `${s.position.join()}|${s.target.join()}`));
  assert.equal(keys.size, shots.length, 'suggestions are distinct');
  assert.ok(shots[0].score >= shots.at(-1).score);
});

test('a blocked object lowers that cut below an unobstructed one', () => {
  const meta = {width_m: 8, depth_m: 6};
  const targets = [{id: 'A', box: box(4, 3, .5, .5, 0, .8)}];
  const blockedWest = (pos) => pos[0] < 4 ? 0 : 1;
  const shots = planShots({meta, targets, count: 3, visibility: blockedWest});
  assert.ok(shots[0].position[0] > 4, 'the best cut sees the object from the open side');
});

test('multi-room WESS and the sunken hall keep cameras on walkable floor', () => {
  for (const [id, spot] of [['wess', [3.4, 1]], ['sunken', [3, -2.5]]]) {
    const meta = read(id);
    const shots = planShots({meta, targets: [{id: 'A', box: box(...spot, .5, .5, 0, .8)}, {id: 'B', box: box(spot[0] + 1.6, spot[1] + .8, .4, .4, 0, 1.2)}], count: 3});
    assert.ok(shots.length >= 2, id);
    for (const s of shots) assert.ok(canWalk(meta, s.position[0], s.position[1]), `${id}: ${s.label}`);
  }
});

test('crop framing converts between stage and render fields of view', () => {
  assert.equal(Math.round(stageFov(40, 1.5, 2)), 40, 'narrower crop keeps the vertical FOV');
  const wide = stageFov(40, 16 / 9, 1.2);
  assert.ok(wide > 40);
  assert.ok(Math.abs(cropFov(wide, 16 / 9, 1.2) - 40) < 1e-9);
  assert.deepEqual(cropRect(1000, 500, 1), {x: 250, y: 0, width: 500, height: 500});
  assert.deepEqual(cropRect(1000, 500, 4), {x: 0, y: 125, width: 1000, height: 250});
});

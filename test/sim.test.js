import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScene } from './helpers.js';
import { plan, jumpEdge, motionParams } from '../src/shared/sim/nav.js';
import { IconField } from '../src/shared/sim/icons.js';
import { World } from '../src/shared/sim/world.js';

test('planner: floor -> window top by jumping, and by climbing when too high', () => {
  const { world, brain } = makeScene({ icons: false });
  const mp = brain.mp;
  const p1 = plan(world, 'floor', 'win:b:top:0', mp, 500);   // window b is low enough to jump to
  assert.ok(p1 && p1.length >= 1, 'path to low window');
  const p2 = plan(world, 'floor', 'win:a:top:0', mp, 500);   // window a is high: needs a hop chain or a climb
  assert.ok(p2 && p2.length >= 1, 'path to high window');
  for (const st of p2) assert.ok(st.type === 'jump' || st.type === 'climb');
});

test('planner: unreachable surfaces give null', () => {
  const world = new World({ width: 1920, height: 1080, floorY: 1040, catH: 100 });
  world.setWindows([{ id: 'hi', x: 800, y: 130, w: 300, h: 100 }]);   // top 130px, floor 1040: far too high, wall too short to grab
  const mp = motionParams(300);
  const p = plan(world, 'floor', 'win:hi:top:0', mp, 400);
  // the wall (y 130..230) can't be reached from the floor 800px below
  assert.equal(p, null);
});

test('jumpEdge respects max rise', () => {
  const mp = motionParams(300);
  const A = { id: 'A', kind: 'top', y: 800, x1: 0, x2: 400 }, B = { id: 'B', kind: 'top', y: 800 - mp.maxRise - 50, x1: 0, x2: 400 };
  assert.equal(jumpEdge(A, B, mp), null);
  B.y = 800 - mp.maxRise * 0.5;
  assert.ok(jumpEdge(A, B, mp));
});

test('icons fall, bounce and come to rest on the floor', () => {
  const world = new World({ width: 1000, height: 700, floorY: 650, catH: 100 });
  const mp = motionParams(300);
  const f = new IconField(world, mp);
  const b = f.activate({ name: 'x', x: 100, y: 100, w: 48, h: 48 });
  f.swat('x', 1, -0.3, 900);
  for (let i = 0; i < 60 * 12; i++) f.step(1 / 60);
  assert.ok(Math.abs(b.y + b.r - 650) < 1.5, `rest y ${b.y}`);
  assert.ok(f.settled);
  assert.ok(b.x > 100 && b.x < 1000);
});

test('icons never sink through the floor when they collide', () => {
  const world = new World({ width: 1000, height: 700, floorY: 650, catH: 100 });
  const f = new IconField(world, motionParams(300));
  for (let i = 0; i < 5; i++) { f.activate({ name: 'i' + i, x: 400 + i * 10, y: 500 - i * 20, w: 48, h: 48 }); f.swat('i' + i, 0.3 * i - 0.5, -0.2, 300); }
  for (let t = 0; t < 60 * 15; t++) f.step(1 / 60);
  for (const b of f.bodies.values()) assert.ok(b.y + b.r <= 650.5, `${b.name} y=${b.y}`);
});

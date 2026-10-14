import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScene, run } from './helpers.js';
import { subtractIntervals } from '../src/shared/sim/geometry.js';

test('interval subtraction', () => {
  assert.deepEqual(subtractIntervals(0, 100, [[20, 40], [60, 80]]), [[0, 20], [40, 60], [80, 100]]);
  assert.deepEqual(subtractIntervals(0, 100, [[-10, 110]]), []);
});

test('occluded window tops are cut into visible pieces', () => {
  const { world } = makeScene({ icons: false });
  // window c (x 100-520, y 450) is partly covered by window a (x 500..)? only tops visible count
  const tops = world.horizontals().filter((s) => s.kind === 'top');
  assert.ok(tops.length >= 3);
  for (const t of tops) assert.ok(t.x2 > t.x1);
});

test('cat stays on screen, finite, and on valid support for 10 minutes', () => {
  const { world, brain } = makeScene({ seed: 7 });
  let airTime = 0, maxAir = 0;
  run(brain, 600, {
    each: () => {
      assert.ok(Number.isFinite(brain.x) && Number.isFinite(brain.y));
      assert.ok(brain.x >= 0 && brain.x <= world.width);
      assert.ok(brain.y <= world.floorY + 1 && brain.y >= -200, `y=${brain.y}`);
      if (brain.mode === 'air') { airTime += 1 / 60; maxAir = Math.max(maxAir, airTime); } else airTime = 0;
    },
  });
  assert.ok(maxAir < 6, `stuck in air ${maxAir}`);
});

test('cat eventually perches on a window, plays with icons and makes a puddle', () => {
  const seen = new Set();
  const { brain } = makeScene({ seed: 3 });
  brain.cool.icons = 2; brain.cool.mud = 4; brain.cool.perch = 1;
  run(brain, 900, {
    each: () => {
      for (const e of brain.events) seen.add(e.type);
      if (brain.support && brain.support.kind) seen.add('on:' + brain.support.kind);
    },
  });
  assert.ok(seen.has('on:top') || seen.has('on:field'), [...seen].join());
  assert.ok(seen.has('iconSession'), [...seen].join());
  assert.ok(seen.has('swat'), [...seen].join());
});

test('perched cat follows a moving window', () => {
  const { world, brain } = makeScene({ seed: 5, icons: false });
  brain.settings.chase = false; brain.settings.mud = false;
  // put the cat on window a's top
  brain.x = 800; brain.y = 300; brain.attachTo('a'); brain.mode = 'ground';
  brain.task = (function* () { while (true) yield; })();   // keep the cat still
  run(brain, 0.5);
  const x0 = brain.x;
  const w = world.windows.map((q) => ({ ...q }));
  w.find((q) => q.id === 'a').x += 120; w.find((q) => q.id === 'a').y -= 40;
  world.setWindows(w);
  run(brain, 0.2);
  assert.ok(Math.abs(brain.y - 260) < 2, `y ${brain.y}`);
  assert.ok(brain.x - x0 > 100);
});

test('cat falls when its window disappears and lands on the floor', () => {
  const { world, brain } = makeScene({ seed: 6, icons: false });
  brain.x = 800; brain.y = 300; brain.attachTo('a'); brain.mode = 'ground';
  run(brain, 0.3);
  world.setWindows(world.windows.filter((w) => w.id !== 'a'));
  run(brain, 3);
  assert.equal(brain.mode, 'ground');
  assert.ok(brain.y >= 440 || brain.y === world.floorY, `y=${brain.y}`);
});

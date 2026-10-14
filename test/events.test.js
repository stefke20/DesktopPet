import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScene, run } from './helpers.js';
import { EventDirector, Butterfly } from '../src/shared/sim/events.js';
import { makeRng } from '../src/shared/sim/geometry.js';

function withDirector(opts = {}) {
  const scene = makeScene({ icons: false, ...opts });
  const director = new EventDirector({ world: scene.world, brain: scene.brain, rng: makeRng(opts.seed || 3) });
  scene.brain.settings.mud = false; scene.brain.settings.playWithIcons = false;
  return { ...scene, director };
}

function drive(s, seconds, each) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    s.director.update(dt); s.brain.update(dt);
    if (each) each(t);
    s.brain.events.length = 0;
  }
}

test('a butterfly flutters across the screen and eventually leaves', () => {
  const s = withDirector({ seed: 2 });
  const bf = s.director.trigger('butterfly');
  assert.ok(bf);
  let inside = false;
  drive(s, 120, () => { if (bf.x > 0 && bf.x < s.world.width && bf.y > 0 && bf.y < s.world.floorY) inside = true; assert.ok(Number.isFinite(bf.x + bf.y)); });
  assert.ok(inside, 'butterfly was visible at some point');
  assert.ok(bf.done, 'butterfly eventually left');
  assert.equal(s.director.active.length, 0);
});

test('the pet chases the butterfly, pounces and always misses', () => {
  let totalMisses = 0, totalPounces = 0, noticed = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = withDirector({ seed });
    const bf = s.director.trigger('butterfly');
    drive(s, 90, () => {
      for (const e of s.brain.events) { if (e.type === 'miss') totalMisses++; if (e.type === 'notice') noticed++; }
      if (s.brain.anim.state === 'swat') totalPounces++;
      assert.ok(s.brain.y <= s.world.floorY + 5 && s.brain.x >= 0 && s.brain.x <= s.world.width);
    });
    assert.ok(bf.done);
    assert.ok(bf.dodges <= 4, 'it only ever dodged, never got caught');
  }
  assert.ok(noticed >= 5, `noticed ${noticed}`);
  assert.ok(totalMisses >= 6, `misses ${totalMisses}`);
  assert.ok(totalPounces > 0);
});

test('butterfly dodge flings it away from the paw', () => {
  const s = withDirector();
  const bf = new Butterfly({ world: s.world, rng: makeRng(1), U: s.brain.U });
  bf.x = 500; bf.y = 600;
  bf.dodge(450, 650);
  assert.equal(bf.state, 'dodge');
  assert.ok(bf.vx > 0 && bf.vy < 0);
});

test('yarn ball rolls in, gets batted around and is cleaned up', () => {
  const s = withDirector({ seed: 4 });
  const ev = s.director.trigger('yarn');
  s.director.timer = 1e9;   // no further visitors in this test
  assert.ok(ev && s.brain.toys.has('yarn'));
  let swats = 0, maxX = 0;
  drive(s, 150, () => {
    for (const e of s.brain.events) if (e.type === 'swat') swats++;
    maxX = Math.max(maxX, ev.body.x);
    assert.ok(ev.body.y + ev.body.r <= s.world.floorY + 2);
  });
  assert.ok(swats >= 1, `swats ${swats}`);
  assert.ok(maxX > 100);
  assert.equal(s.director.active.length, 0);
  assert.ok(!s.brain.toys.has('yarn'));
});

test('events are scheduled randomly and can be disabled', () => {
  const s = withDirector({ seed: 8 });
  let spawned = 0;
  const orig = s.director.trigger.bind(s.director);
  s.director.trigger = (t) => { spawned++; return orig(t); };
  drive(s, 900);
  assert.ok(spawned >= 2, `spawned ${spawned}`);
  const d = withDirector({ seed: 8 });
  d.director.enabled = false;
  let n = 0; const o = d.director.trigger.bind(d.director); d.director.trigger = (t) => { n++; return o(t); };
  drive(d, 900);
  assert.equal(n, 0);
});

test('dog: chases butterflies too, never climbs and soaks cleanly', () => {
  const s = withDirector({ seed: 5 });
  s.brain.setSpecies('dog', s.brain.U);
  let climbing = false, bark = 0;
  s.director.trigger('butterfly');
  drive(s, 600, () => {
    if (s.brain.mode === 'wall') climbing = true;
    for (const e of s.brain.events) if (e.type === 'bark') bark++;
    assert.ok(s.brain.y <= s.world.floorY + 5 && s.brain.x >= 0 && s.brain.x <= s.world.width, `pos ${s.brain.x},${s.brain.y}`);
  });
  assert.equal(climbing, false);
  assert.ok(bark >= 1);
});

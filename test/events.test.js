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
  drive(s, 1.5);
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

function validPet(s) { assert.ok(s.brain.y <= s.world.floorY + 5 && s.brain.x >= 0 && s.brain.x <= s.world.width && Number.isFinite(s.brain.x + s.brain.y), `pos ${s.brain.x},${s.brain.y}`); }

test('laser dot: pet chases it, pounces, and never catches it', () => {
  let misses = 0, pounces = 0;
  for (const seed of [1, 2, 3, 4]) {
    const s = withDirector({ seed });
    const l = s.director.trigger('laser');
    s.director.timer = 1e9;
    drive(s, 60, () => { for (const e of s.brain.events) if (e.type === 'miss') misses++; if (s.brain.anim.state === 'swat') pounces++; validPet(s); assert.ok(l.y <= s.world.floorY); });
    assert.ok(l.done, 'laser switched off');
  }
  assert.ok(misses >= 4, `misses ${misses}`);
  assert.ok(pounces > 0);
});

test('toy mouse: runs the floor, is stalked, escapes, leaves', () => {
  let misses = 0;
  for (const seed of [1, 2, 3]) {
    const s = withDirector({ seed });
    const m = s.director.trigger('mouse');
    s.director.timer = 1e9;
    let seenOnScreen = false;
    drive(s, 90, () => { for (const e of s.brain.events) if (e.type === 'miss') misses++; if (m.x > 0 && m.x < s.world.width) seenOnScreen = true; validPet(s); });
    assert.ok(seenOnScreen); assert.ok(m.done, 'mouse left the screen');
  }
  assert.ok(misses >= 3, `misses ${misses}`);
});

test('bird: flies over, may land on a window top, flushed by the pet, leaves', () => {
  let landed = 0, flushed = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = withDirector({ seed });
    const b = s.director.trigger('bird');
    s.director.timer = 1e9;
    drive(s, 80, () => { if (b.state === 'perched') landed++; if (b.flushed) flushed++; validPet(s); });
    assert.ok(b.done, `bird gone (seed ${seed})`);
  }
  assert.ok(landed > 0, 'at least one bird landed');
  assert.ok(flushed > 0);
});

test('doorbell: dog runs to the door and barks, cat eyes it warily', () => {
  const d = withDirector({ seed: 6 });
  d.brain.setSpecies('dog', d.brain.U);
  drive(d, 1.5);   // let it land first
  d.director.trigger('visitor'); d.director.timer = 1e9;
  let barks = 0, dingDog = 0;
  drive(d, 25, () => { for (const e of d.brain.events) { if (e.type === 'bark') barks++; if (e.type === 'ding') dingDog++; } validPet(d); });
  assert.ok(barks >= 3 && dingDog >= 1, `barks ${barks}`);
  const c = withDirector({ seed: 6 });
  c.director.trigger('visitor'); c.director.timer = 1e9;
  let barksCat = 0, states = new Set();
  drive(c, 25, () => { for (const e of c.brain.events) if (e.type === 'bark') barksCat++; states.add(c.brain.anim.state); validPet(c); });
  assert.equal(barksCat, 0);
});

test('toys: dogs get a tennis ball, cats get yarn, and both are head-sized', () => {
  const cat = withDirector({ seed: 2 });
  const ev = cat.director.trigger('toy');
  assert.equal(ev.kind, 'yarn');
  assert.ok(ev.body.r < 0.1 * cat.brain.U, 'ball radius is small next to the pet');
  const dog = withDirector({ seed: 2 });
  dog.brain.setSpecies('dog', dog.brain.U);
  assert.equal(dog.director.trigger('toy').kind, 'ball');
});

test('every event type can be triggered and finishes (cat and dog)', () => {
  for (const sp of ['cat', 'dog']) for (const type of ['butterfly', 'toy', 'laser', 'mouse', 'bird', 'visitor']) {
    const s = withDirector({ seed: 9 });
    if (sp === 'dog') { s.brain.setSpecies('dog', s.brain.U); drive(s, 1.5); }
    const ev = s.director.trigger(type);
    assert.ok(ev, type);
    s.director.timer = 1e9;
    drive(s, 160, () => validPet(s));
    assert.equal(s.director.active.length, 0, `${sp}/${type} finished`);
  }
});

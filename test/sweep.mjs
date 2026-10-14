// Child process for hang.test.js: runs every species x event type x seed for 15 simulated minutes.
import { World } from '../src/shared/sim/world.js';
import { CatBrain } from '../src/shared/sim/brain.js';
import { EventDirector } from '../src/shared/sim/events.js';
import { makeRng } from '../src/shared/sim/geometry.js';

const TYPES = ['butterfly', 'toy', 'laser', 'mouse', 'bird', 'visitor'];
let runs = 0;
for (const sp of ['cat', 'dog']) for (const type of TYPES) for (const seed of [1, 2, 3, 4]) {
  const U = 0.55 * 480 * (sp === 'dog' ? 1.12 : 1);
  const world = new World({ width: 1280, height: 720, floorY: 680, catH: 0.32 * U });
  world.setWindows([{ id: 'a', x: 300, y: 150, w: 560, h: 390 }, { id: 'b', x: 900, y: 330, w: 320, h: 260 }, { id: 'c', x: 60, y: 300, w: 300, h: 290 }]);
  world.setFields([{ winId: 'a', rx: 90, ry: 130, w: 380, h: 40 }]);
  world.setIcons([0, 1, 2, 3].map((i) => ({ name: 'I' + i, x: 14, y: 14 + i * 96, w: 72, h: 90, ix: 26, iy: 14 + i * 96, iw: 48, ih: 48 })));
  const brain = new CatBrain({ world, rng: makeRng(seed), U, species: sp });
  const d = new EventDirector({ world, brain, rng: makeRng(seed + 99) });
  d.timer = 1e9;
  for (let t = 0; t < 900; t += 1 / 30) {
    if (d.active.length === 0 && t % 25 < 1 / 30) d.trigger(type);
    d.update(1 / 30); brain.update(1 / 30); brain.events.length = 0;
    if (!(brain.y <= world.floorY + 5 && brain.x >= 0 && brain.x <= world.width)) { console.log(`BAD position ${sp}/${type}/${seed} t=${t.toFixed(1)} ${brain.x},${brain.y}`); process.exit(2); }
  }
  runs++;
}
console.log('swept', runs);

// Phase 2: random events + species swaps + a wandering cursor for 30 simulated minutes.
for (const seed of [12, 13, 14, 15, 16]) {
  let species = 'cat';
  const U = () => 0.55 * 480 * (species === 'dog' ? 1.12 : 1);
  const world = new World({ width: 1280, height: 720, floorY: 680, catH: 0.32 * U() });
  world.setWindows([{ id: 'a', x: 300, y: 150, w: 560, h: 390 }, { id: 'b', x: 900, y: 330, w: 320, h: 260 }, { id: 'c', x: 60, y: 300, w: 300, h: 290 }]);
  world.setFields([{ winId: 'a', rx: 90, ry: 130, w: 380, h: 40 }, { winId: 'a', rx: 90, ry: 260, w: 380, h: 40 }]);
  world.setIcons([0, 1, 2, 3, 4, 5].map((i) => ({ name: 'Icon ' + i, x: 14, y: 14 + i * 96, w: 72, h: 90, ix: 26, iy: 14 + i * 96, iw: 48, ih: 48 })));
  const brain = new CatBrain({ world, rng: makeRng(seed), U: U(), species });
  const d = new EventDirector({ world, brain, rng: makeRng(seed + 99) });
  d.timer = 1e9;
  for (let t = 0; t < 1800; t += 1 / 30) {
    if (Math.abs(t % 70) < 1 / 30) { species = species === 'cat' ? 'dog' : 'cat'; brain.setSpecies(species, U()); }
    if (d.active.length === 0 && t % 25 < 1 / 30) d.trigger();
    const k = t * 0.7;
    world.setCursor(640 + Math.sin(k) * 500 + Math.sin(k * 3.1) * 90, 360 + Math.cos(k * 0.8) * 250, 1 / 30);
    d.update(1 / 30); brain.update(1 / 30); brain.events.length = 0;
    if (!(brain.y <= world.floorY + 5 && brain.x >= 0 && brain.x <= world.width)) { console.log(`BAD position phase2 seed ${seed} t=${t.toFixed(1)} ${brain.x},${brain.y}`); process.exit(2); }
  }
  runs++;
}
console.log('phase2 ok');

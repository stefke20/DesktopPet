import { World } from '../src/shared/sim/world.js';
import { CatBrain } from '../src/shared/sim/brain.js';
import { makeRng } from '../src/shared/sim/geometry.js';

export function makeScene({ seed = 1, U = 336, windows = true, icons = true } = {}) {
  const world = new World({ width: 1920, height: 1080, floorY: 1040, catH: 0.32 * U });
  if (windows) {
    world.setWindows([
      { id: 'a', x: 500, y: 300, w: 800, h: 600, title: 'browser' },
      { id: 'b', x: 1250, y: 560, w: 500, h: 420, title: 'notes' },
      { id: 'c', x: 100, y: 450, w: 420, h: 380, title: 'term' },
    ]);
    world.setFields([{ winId: 'a', rx: 120, ry: 220, w: 520, h: 44 }]);
  }
  if (icons) {
    const list = [];
    for (let i = 0; i < 6; i++) list.push({ name: `icon${i}`, x: 20, y: 20 + i * 110, w: 80, h: 90, ix: 36, iy: 20 + i * 110, iw: 48, ih: 48 });
    world.setIcons(list);
  }
  const brain = new CatBrain({ world, rng: makeRng(seed), U });
  return { world, brain };
}

export function run(brain, seconds, { dt = 1 / 60, each } = {}) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { brain.update(dt); if (each) each(i * dt); brain.events.length = 0; }
}

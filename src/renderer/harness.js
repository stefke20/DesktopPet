// Visual test harness (driven by tools/*.mjs through Playwright).
import { PetView } from './cat/PetView.js';
import { CatAnimator } from './cat/animator.js';
import catBin from '../../dist/cat.bin';
import dogBin from '../../dist/dog.bin';

const buf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const canvas = document.getElementById('c');
const view = new PetView(canvas, { cat: buf(catBin), dog: buf(dogBin) }, { pixelRatio: 2, size: 640 });
const anims = { cat: new CatAnimator(view.characters.cat), dog: new CatAnimator(view.characters.dog) };
for (const ch of Object.values(view.characters)) ch.orient.position.set(0, -0.15, 0);

window.harness = {
  view, anims,
  get anim() { return anims[view.species]; },
  get char() { return view.active; },
  setSpecies(name) { view.setSpecies(name); },
  // Run the animator for `seconds` in `state`, then render.
  run(state, params = {}, seconds = 1, ctx = {}) {
    const anim = anims[view.species];
    anim.setState(state, params);
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) anim.update(dt, ctx);
    view.render(dt);
  },
  render() { view.render(1 / 60); },
};
view.render();
window.harness.ready = true;

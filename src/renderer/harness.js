// Visual test harness (driven by tools/*.mjs through Playwright).
import { CatView } from './cat/CatView.js';
import { CatAnimator } from './cat/animator.js';
import catBin from '../../dist/cat.bin';

const canvas = document.getElementById('c');
const view = new CatView(canvas, catBin.buffer.slice(catBin.byteOffset, catBin.byteOffset + catBin.byteLength), { pixelRatio: 2, size: 640 });
const anim = new CatAnimator(view);
view.orient.position.set(0, -0.15, 0);

window.harness = {
  view, anim,
  // Run the animator for `seconds` in `state`, then render.
  run(state, params = {}, seconds = 1, ctx = {}, camYaw) {
    anim.setState(state, params);
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) anim.update(dt, ctx);
    if (camYaw !== undefined) anim.yawCam = camYaw;
    view.render(dt);
  },
  render() { view.render(1 / 60); },
};
view.render();
window.harness.ready = true;

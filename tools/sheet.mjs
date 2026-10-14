// Renders a contact sheet of animator poses: node tools/sheet.mjs out.png '<json list>'
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { serve, launch } from './lib/browser.mjs';

const outFile = path.resolve(process.argv[2] || 'shots/sheet.png');
const items = JSON.parse(process.argv[3]);
const cols = Number(process.argv[4] || 3);
const dist = path.resolve('dist');
const tmp = path.resolve('shots/.cells');
fs.mkdirSync(tmp, { recursive: true });
const srv = await serve(dist);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${srv.port}/harness.html`);
await page.waitForFunction(() => window.harness && window.harness.ready, null, { timeout: 60000 });
const files = [];
let i = 0;
for (const it of items) {
  await page.evaluate((it) => {
    const h = window.harness;
    h.anim.cur = h.anim.cur; // keep continuity unless reset requested
    if (it.reset) { h.anim.state = 'stand'; }
    if (it.coat) h.view.setCoat(it.coat);
    h.anim.yawCam = it.yaw === undefined ? 0.35 : it.yaw; h.anim.yawCur = h.anim.yawCam;
    if (it.facing !== undefined) h.anim.facing = it.facing;
    h.view.orient.rotation.z = it.rotZ || 0;
    h.run(it.state, it.params || {}, it.seconds ?? 1.2, it.ctx || {});
  }, it);
  const f = path.join(tmp, `c${String(i++).padStart(2, '0')}.png`);
  await page.screenshot({ path: f, clip: it.clip || { x: 80, y: 130, width: 480, height: 300 } });
  files.push(f);
  process.stdout.write('.');
}
await browser.close();
srv.close();
const py = `
import sys
from PIL import Image, ImageDraw
files=sys.argv[2:]; cols=int(sys.argv[1]); ims=[Image.open(f).convert('RGB') for f in files]
w,h=ims[0].size; rows=(len(ims)+cols-1)//cols
sheet=Image.new('RGB',(w*cols,h*rows),(255,255,255))
for n,im in enumerate(ims): sheet.paste(im,((n%cols)*w,(n//cols)*h))
sheet.save('${outFile}')
`;
execFileSync('python3', ['-c', py, String(cols), ...files]);
console.log('\nwrote', outFile);

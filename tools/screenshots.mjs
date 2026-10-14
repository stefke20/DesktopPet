import path from 'node:path';
import fs from 'node:fs';
import { serve, launch } from './lib/browser.mjs';

const dist = path.resolve('dist');
const out = path.resolve('shots');
fs.mkdirSync(out, { recursive: true });
const srv = await serve(dist);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 2 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${srv.port}/harness.html`);
await page.waitForFunction(() => window.harness && window.harness.ready, null, { timeout: 60000 });
const poses = JSON.parse(process.argv[2] || '[{"name":"side","yaw":0},{"name":"three-quarter","yaw":-0.6},{"name":"front","yaw":-1.5}]');
for (const p of poses) {
  await page.evaluate((p) => { const h = window.harness; h.view.orient.rotation.y = p.yaw; if (p.layers) h.view.setFurQuality(p.layers); else h.view.setFurQuality(20); h.view.render(); }, p);
  await page.screenshot({ path: path.join(out, `cat-${p.name}.png`), clip: p.clip || undefined });
  console.log('shot', p.name);
}
await browser.close();
srv.close();

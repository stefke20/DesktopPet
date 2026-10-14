// Runs the real renderer bundle in headless Chromium against a fake host and
// captures screenshots + a behaviour log.
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch } from './lib/browser.mjs';

const seconds = Number(process.argv[2] || 20);
const every = Number(process.argv[3] || 2);
const script = process.argv[4] || '';
const outDir = path.resolve('shots/app');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const srv = await serve(path.resolve('dist'));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { const t = m.text(); if (!t.includes('Failed to load resource')) console.log('[page]', t); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript({ path: path.resolve('tools/lib/fakehost.js') });
await page.goto(`http://127.0.0.1:${srv.port}/index.html`);
await page.waitForFunction(() => window.app, null, { timeout: 60000 });
if (script) await page.evaluate(script);
const t0 = Date.now();
let i = 0;
while ((Date.now() - t0) / 1000 < seconds) {
  await page.waitForTimeout(every * 1000);
  const info = await page.evaluate(() => {
    const b = window.app.brain;
    return { t: +b.time.toFixed(1), x: Math.round(b.x), y: Math.round(b.y), mode: b.mode, anim: b.anim.state, sup: b.support ? b.support.id : null, mud: +b.mud.toFixed(2), prints: window.app.mudLayer.count, icons: b.icons.bodies.size };
  });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: path.join(outDir, `f${String(i++).padStart(3, '0')}.png`) });
}
console.log('log', await page.evaluate(() => window.__fake.log.slice(-20)));
await browser.close();
srv.close();

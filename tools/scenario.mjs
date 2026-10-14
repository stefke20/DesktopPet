// Fast-forward scenarios against the real app: node tools/scenario.mjs <name>
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch } from './lib/browser.mjs';

const name = process.argv[2] || 'mud';
const outDir = path.resolve('shots/scn-' + name);
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
await page.evaluate(() => { window.app.running = false; });

const shot = async (label) => { await page.evaluate(() => window.app.tick(0.001, true)); await page.screenshot({ path: path.join(outDir, `${label}.png`) }); };
const adv = (sec, step = 1 / 60) => page.evaluate(([s, st]) => { for (let t = 0; t < s; t += st) window.app.tick(st, false); }, [sec, step]);
const info = () => page.evaluate(() => { const b = window.app.brain; return { t: +b.time.toFixed(1), x: Math.round(b.x), y: Math.round(b.y), mode: b.mode, anim: b.anim.state, sup: b.support && b.support.id, mud: +b.mud.toFixed(2), prints: window.app.mudLayer.count, icons: b.icons.bodies.size, act: b.lastActivity }; });

const scenarios = {
  async mud() {
    await page.evaluate(() => { const b = window.app.brain; b.settings.perch = false; b.settings.playWithIcons = false; b.settings.chase = false; b.cool.mud = 0; b.cool.perch = 999; });
    for (let i = 0; i < 40; i++) { await adv(2); const f = await info(); if (i % 4 === 0) console.log(JSON.stringify(f)); if (f.prints > 6) { await adv(3); break; } }
    console.log(JSON.stringify(await info()));
    await shot('1-prints');
    // rub the cursor over the prints
    await page.evaluate(() => {
      const a = window.app, y = a.brain.y;
      for (let k = 0; k < 60; k++) { const x = 100 + (k % 30) * 40; window.__fake.cursor(x, y - 4 + (k % 2) * 8); a.tick(0.016, false); }
    });
    await shot('2-after-rub');
    console.log('prints counter (stamped, not erased-aware):', (await info()).prints);
  },
  async icons() {
    await page.evaluate(() => { const b = window.app.brain; b.settings.perch = false; b.settings.mud = false; b.settings.chase = false; b.cool.icons = 0; });
    let n = 0;
    for (let i = 0; i < 80; i++) { await adv(1); const f = await info(); if (i % 3 === 0) console.log(JSON.stringify(f)); if (i % 4 === 0) await shot(String(n++).padStart(2, '0') + '-' + f.anim); if (f.t > 70) break; }
    console.log('log', await page.evaluate(() => window.__fake.log.slice(-30)));
  },
};
await scenarios[name]();
await browser.close();
srv.close();

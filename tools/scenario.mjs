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
if (process.env.SEED) await page.addInitScript(`(() => { let a = ${Number(process.env.SEED)}; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`);
await page.goto(`http://127.0.0.1:${srv.port}/index.html`);
await page.waitForFunction(() => window.app, null, { timeout: 60000 });
await page.evaluate(() => { window.app.running = false; });
if (process.env.SPECIES) await page.evaluate((sp) => window.app.applySettings({ species: sp }), process.env.SPECIES);

const shot = async (label) => { await page.evaluate(() => window.app.tick(0.001, true)); await page.screenshot({ path: path.join(outDir, `${label}.png`) }); };
const adv = (sec, step = 1 / 60) => page.evaluate(([s, st]) => { for (let t = 0; t < s; t += st) window.app.tick(st, false); }, [sec, step]);
const info = () => page.evaluate(() => { const b = window.app.brain; return { t: +b.time.toFixed(1), x: Math.round(b.x), y: Math.round(b.y), mode: b.mode, anim: b.anim.state, sup: b.support && b.support.id, mud: +b.mud.toFixed(2), prints: window.app.mudLayer.count, icons: b.icons.bodies.size, act: b.lastActivity }; });

const scenarios = {
  async butterfly() {
    await page.evaluate(() => { const b = window.app.brain; b.settings.perch = false; b.settings.playWithIcons = false; b.settings.mud = false; b.cool.chase = 999; window.app.director.timer = 1e9; });
    await page.evaluate(() => window.app.director.trigger('butterfly'));
    const want = ['stand', 'walk', 'crouch', 'swat', 'jump', 'sit'];
    const got = {}; let n = 0;
    for (let i = 0; i < 400; i++) {
      await adv(0.1);
      const f = await page.evaluate(() => { const a = window.app, b = a.brain, bf = a.director.butterfly; return { t: +b.time.toFixed(1), anim: b.anim.state, x: Math.round(b.x), y: Math.round(b.y), bf: bf ? [Math.round(bf.x), Math.round(bf.y), bf.state, bf.dodges] : null }; });
      if (i % 20 === 0) console.log(JSON.stringify(f));
      if (f.bf && want.includes(f.anim) && (got[f.anim] || 0) < 2 && (f.anim !== 'stand' || (got.stand || 0) < 1)) { got[f.anim] = (got[f.anim] || 0) + 1; await shot(String(n++).padStart(2, '0') + '-' + f.anim); }
      if (!f.bf) break;
    }
    console.log('captured', JSON.stringify(got));
  },
  async yarn() {
    await page.evaluate(() => { const b = window.app.brain; b.settings.perch = false; b.settings.playWithIcons = false; b.settings.mud = false; window.app.director.timer = 1e9; });
    await page.evaluate(() => window.app.director.trigger('yarn'));
    let n = 0;
    for (let i = 0; i < 60; i++) { await adv(0.5); if (i % 4 === 3) await shot(String(n++).padStart(2, '0')); }
  },
  async soak() {
    const res = await page.evaluate((swapEvery) => {
      const a = window.app, b = a.brain, seen = {}, modes = {}, bad = [];
      let maxAir = 0, air = 0;
      for (let t = 0; t < 1800; t += 1 / 30) {
        // a wandering cursor, sometimes fast
        if (swapEvery && Math.abs(t % swapEvery) < 1 / 30) a.applySettings({ species: a.settings.species === 'cat' ? 'dog' : 'cat' });
        const k = t * 0.7;
        window.__fake.cursor(640 + Math.sin(k) * 500 + Math.sin(k * 3.1) * 90, 360 + Math.cos(k * 0.8) * 250);
        a.tick(1 / 30, false);
        for (const e of b.events) seen[e.type] = (seen[e.type] || 0) + 1;
        seen['anim:' + b.anim.state] = (seen['anim:' + b.anim.state] || 0) + 1;
        modes[b.mode] = (modes[b.mode] || 0) + 1;
        if (b.mode === 'air') { air += 1 / 30; maxAir = Math.max(maxAir, air); } else air = 0;
        for (const n of ['head', 'pelvis', 'fpL', 'hmR', 'tail5']) {
          const q = a.char.bones[n].quaternion, p = a.char.bones[n].position;
          if (![q.x, q.y, q.z, q.w, p.x, p.y, p.z].every(Number.isFinite)) bad.push(`${n}@${t.toFixed(1)}`);
        }
        if (!Number.isFinite(b.x) || b.y > 700 || b.x < -5 || b.x > 1285) bad.push(`pos ${b.x.toFixed(0)},${b.y.toFixed(0)}@${t.toFixed(1)} mode=${b.mode} anim=${b.anim.state} act=${b.lastActivity} owner=${b.attach.owner} wall=${b.wall && b.wall.id} rotZ=${b.rotZ.toFixed(2)}`);
      }
      return { seen, modes, bad: bad.slice(0, 10), maxAir: +maxAir.toFixed(1), prints: a.mudLayer.count, parked: a.parked.size, bodies: b.icons.bodies.size };
    }, Number(process.env.SWAP_EVERY || 0));
    console.log(JSON.stringify(res, null, 1));
  },
  async interact() {
    // keep the cat still on the floor so we can poke at it
    await page.evaluate(() => { const b = window.app.brain; b.x = 640; b.y = 680; b.mode = 'ground'; b.attachTo('floor'); b.task = (function* () { while (true) { b.setAnim('stand'); yield; } })(); });
    await adv(0.5);
    const head = await page.evaluate(() => { const a = window.app; const v = a.char.bones.chest.getWorldPosition(new a._tmp.constructor()); return { x: a.brain.x + v.x * a.S, y: a.brain.y - v.y * a.S }; });
    console.log('chest at', JSON.stringify(head));
    // 1) hover slowly -> petting
    for (let k = 0; k < 90; k++) { await page.evaluate(([x, y, k]) => { window.__fake.cursor(x + Math.sin(k / 8) * 6, y); window.app.tick(1 / 60, false); }, [head.x, head.y, k]); }
    console.log('hover:', JSON.stringify(await info()), 'interactive=', await page.evaluate(() => window.__interactive));
    await shot('1-petting');
    // 2) press + drag -> picked up by the scruff
    await page.mouse.move(head.x, head.y);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) { await page.mouse.move(head.x + k * 6, head.y - k * 12); await page.evaluate(([x, y]) => { window.__fake.cursor(x, y); window.app.tick(1 / 60, false); }, [head.x + k * 6, head.y - k * 12]); }
    await adv(0.5);
    console.log('dragging:', JSON.stringify(await info()));
    await shot('2-held');
    await page.mouse.up();
    await adv(0.2);
    console.log('released:', JSON.stringify(await info()));
    await adv(1.5);
    console.log('landed:', JSON.stringify(await info()));
    // 3) quick click -> meow
    await page.evaluate(() => { const b = window.app.brain; b.task = (function* () { while (true) { b.setAnim('stand'); yield; } })(); });
    const p2 = await page.evaluate(() => { const a = window.app; const v = a.char.bones.chest.getWorldPosition(new a._tmp.constructor()); return { x: a.brain.x + v.x * a.S, y: a.brain.y - v.y * a.S }; });
    await page.evaluate(([x, y]) => { window.__fake.cursor(x, y); window.app.tick(1 / 60, false); }, [p2.x, p2.y]);
    await page.mouse.move(p2.x, p2.y); await page.mouse.down(); await page.mouse.up();
    await adv(0.3);
    console.log('clicked:', JSON.stringify(await info()));
  },
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

#!/usr/bin/env node
'use strict';
// Emergency "put my desktop icons back" tool. Works without the app running:
//   node tools/reset-icons.cjs
// It reads the baseline DesktopPet saved before it first moved an icon and restores every position.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { WinBridge } = require('../src/main/bridge/win.cjs');

(async () => {
  if (process.platform !== 'win32') { console.error('This tool is for Windows.'); process.exit(1); }
  const userData = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'DesktopPet');
  const file = path.join(userData, 'icon-baseline.json');
  if (!fs.existsSync(file)) { console.log('Nothing to restore: no saved icon layout found at', file); return; }
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bridge = new WinBridge({ sourcePath: path.join(__dirname, '..', 'src', 'main', 'bridge', 'PetBridge.cs'), cacheDir: path.join(userData, 'bridge'), log: console.log });
  await bridge.start();
  let ok = 0;
  for (const ic of base.icons) { try { await bridge.moveIcon(ic.name, ic.ix, ic.iy); ok++; } catch (e) { console.log('could not move', ic.name, e.message); } }
  bridge.stop();
  fs.unlinkSync(file);
  console.log(`Restored ${ok}/${base.icons.length} icons.`);
})().catch((e) => { console.error(e.message); process.exit(1); });

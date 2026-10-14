'use strict';
// DesktopPet main process: transparent click-through overlay, tray, native
// bridge polling (windows / text boxes / desktop icons) and icon bookkeeping.
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Settings } = require('./settings.cjs');
const { IconStore } = require('./icons-store.cjs');
const { catIcon } = require('./png.cjs');

const argv = process.argv;
const MOCK = argv.includes('--mock') || process.platform !== 'win32';
const selftestArg = argv.find((a) => a.startsWith('--selftest='));
const SELFTEST = selftestArg ? Number(selftestArg.split('=')[1]) || 8000 : 0;

if (process.platform !== 'win32' && SELFTEST) {
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
app.setName('DesktopPet');
app.setPath('userData', path.join(app.getPath('appData'), 'DesktopPet'));
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, tray = null, bridge = null, settings = null, store = null;
let display = null, conv = null;
let quitting = false;
const timers = {};
const parked = new Set();
const state = { windows: [], fields: [], icons: [], dirty: false };
let lastWinKey = '', lastFieldKey = '', lastIconKey = '';
let iconBounds = null;
let iconsMovable = true;
let iconQueue = Promise.resolve();
let logFile = null;

function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`;
  console.log(line);
  try { if (logFile) fs.appendFileSync(logFile, line + '\n'); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- geometry
function makeConverter(d) {
  const sf = d.scaleFactor || 1;
  let origin = { x: d.bounds.x * sf, y: d.bounds.y * sf };
  try { if (process.platform === 'win32') origin = screen.dipToScreenPoint({ x: d.bounds.x, y: d.bounds.y }); } catch { /* ignore */ }
  return {
    sf, origin,
    dip: (px, py) => ({ x: (px - origin.x) / sf, y: (py - origin.y) / sf }),
    phys: (x, y) => ({ x: Math.round(origin.x + x * sf), y: Math.round(origin.y + y * sf) }),
  };
}

function displayInfo() {
  const d = display;
  return { width: d.bounds.width, height: d.bounds.height, floorY: d.workArea.y + d.workArea.height - d.bounds.y, dpr: d.scaleFactor };
}

const rectDip = (x, y, w, h) => { const a = conv.dip(x, y); return { x: a.x, y: a.y, w: w / conv.sf, h: h / conv.sf }; };

// ---------------------------------------------------------------- overlay window
function createOverlay() {
  display = screen.getPrimaryDisplay();
  conv = makeConverter(display);
  const b = display.bounds;
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, fullscreenable: false,
    title: 'DesktopPetOverlay', backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.on('render-process-gone', (_e, d) => log('renderer gone', JSON.stringify(d)));
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2 || SELFTEST) log('[renderer]', msg); });
}

function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

// ---------------------------------------------------------------- polling
function loop(name, fn, delay) {
  const tick = async () => {
    if (quitting) return;
    try { await fn(); } catch (e) { if (timers[name + 'Err'] !== e.message) { timers[name + 'Err'] = e.message; log(`${name}:`, e.message); } }
    timers[name] = setTimeout(tick, delay);
  };
  tick();
}

async function pollWindows() {
  const raw = await bridge.windows(process.pid);
  const b = display.bounds;
  const wins = [];
  for (const w of raw) {
    const r = rectDip(w.x, w.y, w.w, w.h);
    if (r.x + r.w < 0 || r.y + r.h < 0 || r.x > b.width || r.y > b.height) continue;
    wins.push({ id: w.id, hwnd: w.hwnd, title: w.title, x: r.x, y: r.y, w: r.w, h: r.h, focused: w.focused, fullscreen: w.fullscreen, maximized: w.maximized });
  }
  const key = JSON.stringify(wins);
  if (key !== lastWinKey) { lastWinKey = key; state.windows = wins; send('state', { windows: wins }); }
}

async function pollFields() {
  let defs = [];
  if (bridge.uia && settings.get('perch') && !settings.get('paused')) {
    const fg = state.windows.find((w) => w.focused && !w.fullscreen);
    if (fg) {
      const fields = await bridge.fields(fg.hwnd);
      defs = fields.map((f) => { const r = rectDip(f.x, f.y, f.w, f.h); return { winId: fg.id, rx: Math.round(r.x - fg.x), ry: Math.round(r.y - fg.y), w: Math.round(r.w), h: Math.round(r.h) }; })
        .filter((d) => d.ry > 24);
    }
  }
  const key = JSON.stringify(defs);
  if (key !== lastFieldKey) { lastFieldKey = key; state.fields = defs; send('state', { fields: defs }); }
}

async function pollIcons() {
  if (!settings.get('playWithIcons') || settings.get('paused')) {
    if (state.icons.length) { state.icons = []; lastIconKey = ''; send('state', { icons: [] }); }
    return;
  }
  const res = await bridge.icons();
  iconBounds = res.bounds;
  iconsMovable = !res.auto;
  const icons = [];
  if (iconsMovable) {
    for (const i of res.list) {
      if (i.ix < -1000 || parked.has(i.name)) continue;
      const bnd = rectDip(i.bx, i.by, i.bw, i.bh), ic = rectDip(i.ix, i.iy, i.iw, i.ih);
      icons.push({ name: i.name, x: bnd.x, y: bnd.y, w: bnd.w, h: bnd.h, ix: ic.x, iy: ic.y, iw: ic.w, ih: ic.h });
    }
  } else if (lastIconKey !== 'auto') { log('desktop "Auto arrange icons" is on: the cat will leave the icons alone'); }
  const key = iconsMovable ? JSON.stringify(icons) : 'auto';
  if (key !== lastIconKey) { lastIconKey = key; state.icons = icons; send('state', { icons }); }
}

function startCursorLoop() {
  let last = '';
  timers.cursor = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = display.bounds;
    const c = { x: p.x - b.x, y: p.y - b.y };
    const key = c.x + ',' + c.y;
    if (key !== last) { last = key; send('cursor', c); }
  }, 16);
}

// ---------------------------------------------------------------- desktop icons
function queueIcons(fn) {
  iconQueue = iconQueue.then(fn).catch((e) => log('icon op failed:', e.message));
  return iconQueue;
}

function pushDirty() { state.dirty = store.dirty || parked.size > 0; send('state', { dirty: state.dirty }); }

async function parkIcon(name) {
  if (!store.dirty) {
    const res = await bridge.icons();
    store.save(res.list.filter((i) => i.ix > -1000));
  }
  await bridge.parkIcon(name);
  parked.add(name);
  pushDirty();
}

async function moveIconTo(name, cx, cy) {
  const base = store.find(name);
  if (!base) throw new Error('no baseline for ' + name);
  const p = conv.phys(cx, cy);
  let left = p.x - base.iw / 2, top = p.y - base.ih / 2;
  if (iconBounds) {
    left = Math.max(iconBounds.x, Math.min(iconBounds.x + iconBounds.w - base.iw, left));
    top = Math.max(iconBounds.y, Math.min(iconBounds.y + iconBounds.h - base.ih, top));
  }
  await bridge.moveIcon(name, left, top);
  parked.delete(name);
  pushDirty();
}

async function restoreIcon(name) {
  const base = store.find(name);
  if (base) await bridge.moveIcon(name, base.ix, base.iy);
  parked.delete(name);
  pushDirty();
}

async function resetIcons(notifyRenderer = true) {
  await queueIcons(async () => {
    for (const ic of store.icons) { try { await bridge.moveIcon(ic.name, ic.ix, ic.iy); } catch (e) { log('reset', ic.name, e.message); } }
    store.clear(); parked.clear(); pushDirty();
  });
  if (notifyRenderer) send('command', { type: 'reset-icons' });
}

async function recoverIcons() {
  if (!store.dirty) return;
  pushDirty();
  try {
    const res = await bridge.icons();
    for (const i of res.list) if (i.ix < -1000) await restoreIcon(i.name);
  } catch (e) { log('recover failed', e.message); }
}

// ---------------------------------------------------------------- tray
const COATS = [['ginger', 'Ginger tabby'], ['tabby', 'Brown tabby'], ['grey', 'Grey tabby'], ['black', 'Black cat'], ['tuxedo', 'Tuxedo'], ['cream', 'Cream']];
const SIZES = [['Small', 0.5], ['Medium', 0.7], ['Large', 0.95]];

function applySettings(patch) {
  settings.set(patch);
  if ('autostart' in patch) { try { app.setLoginItemSettings({ openAtLogin: !!patch.autostart }); } catch { /* ignore */ } }
  send('command', { type: 'settings', settings: patch });
  buildMenu();
}

function buildMenu() {
  const s = settings.all();
  const toggle = (label, key) => ({ label, type: 'checkbox', checked: !!s[key], click: (i) => applySettings({ [key]: i.checked }) });
  const menu = Menu.buildFromTemplate([
    { label: 'DesktopPet', enabled: false },
    { label: 'Call the cat here', click: () => send('command', { type: 'summon' }) },
    { label: s.paused ? 'Wake the cat up' : 'Let the cat sleep (pause)', click: () => applySettings({ paused: !s.paused }) },
    { type: 'separator' },
    { label: '↺ Reset desktop icons   (Ctrl+Alt+R)', click: () => resetIcons(true) },
    { label: 'Clean muddy paw prints', click: () => send('command', { type: 'clear-prints' }) },
    { type: 'separator' },
    { label: 'Coat', submenu: COATS.map(([id, label]) => ({ label, type: 'radio', checked: s.coat === id, click: () => applySettings({ coat: id }) })) },
    { label: 'Size', submenu: SIZES.map(([label, v]) => ({ label, type: 'radio', checked: Math.abs(s.size - v) < 0.01, click: () => applySettings({ size: v }) })) },
    {
      label: 'What the cat may do',
      submenu: [
        toggle('Play with desktop icons', 'playWithIcons'),
        toggle('Jump on windows and text boxes', 'perch'),
        toggle('Chase the mouse cursor', 'chase'),
        toggle('Walk in mud (paw prints)', 'mud'),
        toggle('Take naps', 'sleep'),
      ],
    },
    { type: 'separator' },
    toggle('Meow and purr sounds', 'sound'),
    toggle('Start with Windows', 'autostart'),
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  tray = new Tray(nativeImage.createFromBuffer(catIcon(32)));
  tray.setToolTip('DesktopPet');
  buildMenu();
}

// ---------------------------------------------------------------- app lifecycle
async function startBridge() {
  if (MOCK) {
    const { MockBridge } = require('./bridge/mock.cjs');
    bridge = new MockBridge({ display, log });
    log('using the mock bridge (fake windows and icons)');
    return;
  }
  const { WinBridge } = require('./bridge/win.cjs');
  bridge = new WinBridge({ sourcePath: path.join(__dirname, 'bridge', 'PetBridge.cs'), cacheDir: path.join(app.getPath('userData'), 'bridge'), log });
  try { await bridge.start(); } catch (e) {
    log('native bridge unavailable:', e.message, '- the cat will stay on the taskbar');
    const { MockBridge } = require('./bridge/mock.cjs');
    bridge = Object.assign(new MockBridge({ display, log }), { windows: async () => [], fields: async () => [], icons: async () => ({ auto: true, list: [], bounds: { x: 0, y: 0, w: 0, h: 0 } }) });
  }
}

function wireIpc() {
  ipcMain.handle('get-display', () => displayInfo());
  ipcMain.handle('get-settings', () => settings.all());
  ipcMain.on('state-request', (e) => e.sender.send('state', { ...state, dirty: store.dirty || parked.size > 0, display: displayInfo() }));
  ipcMain.on('set-interactive', (_e, on) => { if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!on, { forward: true }); });
  ipcMain.handle('icon-image', async (_e, name) => {
    const b64 = await bridge.iconImage(name, 128);
    if (!b64) throw new Error('no image');
    return 'data:image/png;base64,' + b64;
  });
  ipcMain.on('park-icon', (_e, name) => queueIcons(() => parkIcon(name)));
  ipcMain.on('move-icon', (_e, name, cx, cy) => queueIcons(() => moveIconTo(name, cx, cy)));
  ipcMain.on('restore-icon', (_e, name) => queueIcons(() => restoreIcon(name)));
  ipcMain.on('reset-icons', () => resetIcons(false));
  ipcMain.on('log', (_e, msg) => log('[renderer]', msg));
}

async function selftest() {
  await new Promise((r) => setTimeout(r, SELFTEST));
  const info = await win.webContents.executeJavaScript(`(() => { const a = window.app; if (!a) return { error: 'app missing' }; const b = a.brain; return { t: b.time, x: b.x, y: b.y, mode: b.mode, anim: b.anim.state, windows: a.world.windows.length, icons: a.world.icons.length, fields: a.world.fieldDefs.length }; })()`);
  log('SELFTEST', JSON.stringify(info));
  const img = await win.webContents.capturePage();
  const out = process.env.PET_SHOT || path.join(process.cwd(), 'shots', 'electron.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.toPNG());
  log('SELFTEST screenshot', out);
  app.exit(info && !info.error ? 0 : 1);
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  logFile = path.join(userData, 'desktoppet.log');
  settings = new Settings(userData);
  store = new IconStore(userData);
  createOverlay();
  createTray();
  wireIpc();
  await startBridge();
  startCursorLoop();
  loop('windows', pollWindows, 33);
  loop('fields', pollFields, 700);
  loop('icons', pollIcons, 1200);
  recoverIcons();
  globalShortcut.register('CommandOrControl+Alt+R', () => resetIcons(true));
  if (settings.get('autostart')) { try { app.setLoginItemSettings({ openAtLogin: true }); } catch { /* ignore */ } }
  screen.on('display-metrics-changed', () => {
    display = screen.getPrimaryDisplay(); conv = makeConverter(display);
    win.setBounds(display.bounds);
    send('state', { display: displayInfo() });
  });
  if (SELFTEST) selftest();
});

app.on('window-all-closed', () => { /* keep running in the tray */ });
app.on('second-instance', () => { send('command', { type: 'poke' }); });

app.on('will-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  globalShortcut.unregisterAll();
  Object.values(timers).forEach((t) => { try { clearTimeout(t); clearInterval(t); } catch { /* ignore */ } });
  // never leave an icon hidden off-screen
  const finish = () => { try { bridge && bridge.stop(); } catch { /* ignore */ } app.exit(0); };
  const names = [...parked];
  iconQueue.then(async () => { for (const n of names) { try { await restoreIcon(n); } catch { /* ignore */ } } }).then(finish, finish);
  setTimeout(finish, 4000);
});

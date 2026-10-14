// Injected into the page before the app boots: a stand-in for the Electron preload API
// plus DOM "windows" so screenshots look like a desktop.
(() => {
  const W = 1280, H = 720, FLOOR = 680;
  const st = { windows: [
    { id: 'a', x: 300, y: 150, w: 560, h: 390, title: 'Browser - Google', focused: true },
    { id: 'b', x: 900, y: 330, w: 320, h: 260, title: 'Notes' },
    { id: 'c', x: 60, y: 300, w: 300, h: 290, title: 'Terminal' },
  ], fields: [{ winId: 'a', rx: 90, ry: 130, w: 380, h: 40 }, { winId: 'a', rx: 90, ry: 260, w: 380, h: 40 }], icons: [] };
  for (let i = 0; i < 6; i++) st.icons.push({ name: `Icon ${i}`, x: 14, y: 14 + i * 96, w: 72, h: 90, ix: 26, iy: 14 + i * 96, iw: 48, ih: 48, ox: 0, oy: 0 });
  const listeners = { state: [], cursor: [], command: [] };
  const log = [];
  const hidden = new Set();
  const host = {
    log: (m) => { log.push(m); console.log('[host]', m); },
    getDisplay: async () => ({ width: W, height: H, floorY: FLOOR, dpr: 1 }),
    getSettings: async () => (window.__settings || { size: 0.55, coat: 'ginger' }),
    onState: (cb) => { listeners.state.push(cb); cb({ windows: st.windows, fields: st.fields, icons: st.icons.filter((i) => !hidden.has(i.name)), dirty: false }); },
    onCursor: (cb) => listeners.cursor.push(cb),
    onCommand: (cb) => listeners.command.push(cb),
    setInteractive: (b) => { window.__interactive = b; },
    iconImage: async (name) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const hue = (parseInt(name.replace(/\D/g, ''), 10) * 57) % 360;
      g.fillStyle = `hsl(${hue},70%,55%)`; g.beginPath(); g.roundRect(6, 6, 52, 52, 12); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.fillText(name.slice(-1), 32, 44);
      return c.toDataURL();
    },
    parkIcon: (n) => { hidden.add(n); window.__log('park ' + n); push(); },
    moveIcon: (n, x, y) => { hidden.delete(n); const i = st.icons.find((q) => q.name === n); if (i) { i.ix = x - i.iw / 2; i.iy = y - i.ih / 2; i.x = i.ix - 12; i.y = i.iy - 8; } window.__log(`move ${n} ${x},${y}`); push(); },
    restoreIcon: (n) => { hidden.delete(n); window.__log('restore ' + n); push(); },
    resetIcons: () => { window.__log('reset icons'); hidden.clear(); push(); },
  };
  function push() { for (const cb of listeners.state) cb({ windows: st.windows, fields: st.fields, icons: st.icons.filter((i) => !hidden.has(i.name)), dirty: hidden.size > 0 }); }
  window.__log = (m) => { log.push(m); };
  window.pet = host;
  window.__fake = { st, listeners, log, push, hidden,
    cursor(x, y) { for (const cb of listeners.cursor) cb({ x, y }); },
    command(c) { for (const cb of listeners.command) cb(c); },
    setWindows(w) { st.windows = w; push(); },
  };
  // desktop backdrop so screenshots are legible
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.background = 'linear-gradient(160deg,#3b6aa0,#7fb0d8 60%,#a8c9e4)';
    const layer = document.createElement('div'); layer.style.cssText = 'position:fixed;inset:0;z-index:-1';
    document.body.prepend(layer);
    const draw = () => {
      layer.innerHTML = '';
      const tb = document.createElement('div'); tb.style.cssText = `position:absolute;left:0;top:${FLOOR}px;width:${W}px;height:${H - FLOOR}px;background:#1d2230`; layer.appendChild(tb);
      for (const w of [...st.windows].reverse()) {
        const d = document.createElement('div');
        d.style.cssText = `position:absolute;left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;background:#f4f5f7;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.35);overflow:hidden;font:12px sans-serif`;
        d.innerHTML = `<div style="height:28px;background:#2b2f3a;color:#fff;line-height:28px;padding-left:10px">${w.title}</div>`;
        for (const f of st.fields.filter((q) => q.winId === w.id)) d.innerHTML += `<div style="position:absolute;left:${f.rx}px;top:${f.ry - 0}px;width:${f.w}px;height:${f.h}px;border:2px solid #9aa4b5;border-radius:20px;background:#fff"></div>`;
        layer.appendChild(d);
      }
      for (const i of st.icons) if (!hidden.has(i.name)) {
        const d = document.createElement('div');
        const hue = (parseInt(i.name.replace(/\D/g, ''), 10) * 57) % 360;
        d.style.cssText = `position:absolute;left:${i.ix}px;top:${i.iy}px;width:${i.iw}px;height:${i.ih}px;background:hsl(${hue},70%,55%);border-radius:11px`;
        layer.appendChild(d);
      }
    };
    setInterval(draw, 100);
  });
})();

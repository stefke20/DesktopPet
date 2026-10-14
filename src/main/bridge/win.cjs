'use strict';
// Client for the native helper (PetBridge.cs). Compiles it on first run with the
// csc.exe that ships with .NET Framework 4.x, then talks to it over stdin/stdout.
const { spawn, execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function findCsc() {
  const win = process.env.windir || 'C:\\Windows';
  const cands = [
    path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319'),
    path.join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319'),
  ];
  for (const dir of cands) if (fs.existsSync(path.join(dir, 'csc.exe'))) return { csc: path.join(dir, 'csc.exe'), dir };
  return null;
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 60000 }, (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stdout}\n${stderr}`)) : resolve(stdout)));
  });
}

class WinBridge {
  constructor({ sourcePath, cacheDir, log = () => {} }) {
    this.sourcePath = sourcePath;
    this.cacheDir = cacheDir;
    this.log = log;
    this.pending = new Map();
    this.nextId = 1;
    this.buf = '';
    this.uia = false;
    this.ready = false;
  }

  async compile() {
    const found = findCsc();
    if (!found) throw new Error('csc.exe not found (is .NET Framework 4 installed?)');
    const src = fs.readFileSync(this.sourcePath);
    const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 12);
    fs.mkdirSync(this.cacheDir, { recursive: true });
    // csc.exe can't read from inside app.asar, so compile a plain copy of the source
    const srcCopy = path.join(this.cacheDir, `PetBridge-${hash}.cs`);
    if (!fs.existsSync(srcCopy)) fs.writeFileSync(srcCopy, src);
    const wpf = path.join(found.dir, 'WPF');
    const attempts = [
      { tag: 'uia', args: ['/define:UIA', `/lib:${wpf}`, '/r:UIAutomationClient.dll', '/r:UIAutomationTypes.dll', '/r:WindowsBase.dll'] },
      { tag: 'nouia', args: ['/define:NO_UIA'] },
    ];
    let lastErr;
    for (const a of attempts) {
      const out = path.join(this.cacheDir, `PetBridge-${hash}-${a.tag}.exe`);
      if (fs.existsSync(out)) return out;
      try {
        await run(found.csc, ['/nologo', '/optimize+', '/target:exe', `/out:${out}`, '/r:System.Drawing.dll', ...a.args, srcCopy]);
        return out;
      } catch (e) { lastErr = e; this.log(`bridge compile (${a.tag}) failed: ${e.message.split('\n')[0]}`); }
    }
    throw lastErr;
  }

  async start() {
    const exe = await this.compile();
    this.proc = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => this._onData(d));
    this.proc.stderr.on('data', (d) => this.log('bridge stderr: ' + d));
    this.proc.stdin.on('error', () => { /* helper exited; requests will time out */ });
    this.proc.on('exit', (code) => { this.ready = false; this.log('bridge exited ' + code); for (const p of this.pending.values()) p.reject(new Error('bridge exited')); this.pending.clear(); });
    const ping = await this.request('ping', [], 15000);
    this.uia = !!ping.uia;
    this.ready = true;
    this.log(`native bridge ready (uia=${this.uia})`);
  }

  _onData(d) {
    this.buf += d;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      const t = line.indexOf('\t');
      if (t < 0) continue;
      const id = Number(line.slice(0, t));
      const p = this.pending.get(id);
      if (!p) continue;
      this.pending.delete(id);
      clearTimeout(p.timer);
      try {
        const data = JSON.parse(line.slice(t + 1));
        if (data && data.error) p.reject(new Error(data.error)); else p.resolve(data);
      } catch (e) { p.reject(e); }
    }
  }

  request(cmd, args = [], timeout = 3000) {
    if (!this.proc || this.proc.killed) return Promise.reject(new Error('bridge not running'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`bridge timeout: ${cmd}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      const clean = args.map((a) => String(a).replace(/[\t\r\n]/g, ' '));
      this.proc.stdin.write([id, cmd, ...clean].join('\t') + '\n');
    });
  }

  async windows(excludePid) {
    const list = await this.request('windows', [excludePid], 2000);
    return list.map((w) => ({ id: String(w.h), hwnd: w.h, title: w.title, cls: w.cls, pid: w.pid, x: w.x, y: w.y, w: w.w, h: w.hh, focused: w.fg, maximized: w.max, fullscreen: w.full }));
  }

  async fields(hwnd) {
    const list = await this.request('fields', [hwnd], 6000);
    return list.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.hh }));
  }

  icons() { return this.request('icons', [], 5000); }
  async iconImage(name, size = 128) { return this.request('iconimg', [name, size], 8000); }
  moveIcon(name, left, top) { return this.request('moveicon', [name, Math.round(left), Math.round(top)], 4000); }
  parkIcon(name) { return this.request('park', [name], 4000); }

  stop() { try { this.proc && this.proc.stdin.end(); this.proc && this.proc.kill(); } catch { /* ignore */ } }
}

module.exports = { WinBridge };

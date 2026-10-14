'use strict';
// Remembers where every desktop icon was before the cat touched it, so "Reset"
// can always put things back (even after a crash or a restart).
const fs = require('node:fs');
const path = require('node:path');

class IconStore {
  constructor(dir) {
    this.file = path.join(dir, 'icon-baseline.json');
    this.data = null;
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = null; }
  }
  get dirty() { return !!this.data; }
  get icons() { return this.data ? this.data.icons : []; }
  find(name) { return this.icons.find((i) => i.name === name) || null; }
  save(icons) {
    this.data = { savedAt: new Date().toISOString(), icons: icons.map((i) => ({ name: i.name, ix: i.ix, iy: i.iy, iw: i.iw, ih: i.ih })) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
  clear() {
    this.data = null;
    try { fs.unlinkSync(this.file); } catch { /* already gone */ }
  }
}
module.exports = { IconStore };

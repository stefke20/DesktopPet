'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  size: 0.7, coat: 'ginger',
  playWithIcons: true, mud: true, perch: true, chase: true, sleep: true,
  paused: false, autostart: false, sound: false,
};

class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.values = { ...DEFAULTS };
    try { Object.assign(this.values, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { /* first run */ }
  }
  get(k) { return this.values[k]; }
  all() { return { ...this.values }; }
  set(patch) {
    Object.assign(this.values, patch);
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2)); } catch { /* ignore */ }
    return this.all();
  }
}
module.exports = { Settings, DEFAULTS };

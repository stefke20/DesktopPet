import { PetApp } from './app.js';
import catBin from '../../dist/cat.bin';

async function boot() {
  const host = window.pet;
  const display = await host.getDisplay();
  const settings = await host.getSettings();
  const buffer = catBin.buffer.slice(catBin.byteOffset, catBin.byteOffset + catBin.byteLength);
  window.app = new PetApp({ host, catBuffer: buffer, display, settings, seed: (Math.random() * 1e9) >>> 0 });
}
boot().catch((e) => { console.error(e); window.pet?.log?.(String(e && e.stack || e)); });

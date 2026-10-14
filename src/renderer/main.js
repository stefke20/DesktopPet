import { PetApp } from './app.js';
import catBin from '../../dist/cat.bin';
import dogBin from '../../dist/dog.bin';

const buf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

async function boot() {
  const host = window.pet;
  const display = await host.getDisplay();
  const settings = await host.getSettings();
  window.app = new PetApp({ host, models: { cat: buf(catBin), dog: buf(dogBin) }, display, settings, seed: (Math.random() * 1e9) >>> 0 });
}
boot().catch((e) => { console.error(e); window.pet?.log?.(String(e && e.stack || e)); });

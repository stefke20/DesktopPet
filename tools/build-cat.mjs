// Generates dist/cat.bin (skinned cat mesh) from the SDF description.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCat, packCat } from '../src/shared/cat/generate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'cat.bin');
const quiet = process.argv.includes('--quiet');
const m = generateCat({ log: quiet ? () => {} : (s) => console.log('[cat]', s) });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, packCat(m));
console.log(`[cat] wrote ${path.relative(root, out)} (${m.positions.length / 3} verts, ${m.indices.length / 3} tris)`);

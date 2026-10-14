// Generates dist/cat.bin and dist/dog.bin (skinned meshes) from the SDF descriptions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCat, packCat } from '../src/shared/cat/generate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const species of ['cat', 'dog']) {
  const out = path.join(root, 'dist', `${species}.bin`);
  const m = generateCat({ species, log: quiet ? () => {} : (s) => console.log(`[${species}]`, s) });
  fs.writeFileSync(out, packCat(m));
  console.log(`[${species}] wrote ${path.relative(root, out)} (${m.positions.length / 3} verts, ${m.indices.length / 3} tris)`);
}

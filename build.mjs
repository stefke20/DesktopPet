// Bundles the renderer and generates the cat mesh.
import { build } from 'esbuild';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

fs.mkdirSync('dist', { recursive: true });
if (!fs.existsSync('dist/cat.bin') || process.argv.includes('--force') || newer('src/shared/cat', 'dist/cat.bin')) {
  execFileSync(process.execPath, ['tools/build-cat.mjs', '--quiet'], { stdio: 'inherit' });
}

function newer(dir, file) {
  const t = fs.statSync(file).mtimeMs;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).some((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : fs.statSync(`${d}/${e.name}`).mtimeMs > t);
  return walk(dir);
}

const common = {
  bundle: true, format: 'iife', target: 'chrome120', sourcemap: true, loader: { '.bin': 'binary' },
  logLevel: 'info', define: { 'process.env.NODE_ENV': '"production"' },
};
const entries = [{ in: 'src/renderer/main.js', out: 'dist/renderer.js' }, { in: 'src/renderer/harness.js', out: 'dist/harness.js' }];
for (const e of entries) {
  if (!fs.existsSync(e.in)) continue;
  await build({ ...common, entryPoints: [e.in], outfile: e.out });
}
for (const f of ['index.html', 'harness.html']) {
  if (fs.existsSync(`src/renderer/${f}`)) fs.copyFileSync(`src/renderer/${f}`, `dist/${f}`);
}

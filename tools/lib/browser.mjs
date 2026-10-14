// Headless Chromium helper for visual checks (WebGL via SwiftShader).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png' };

export function serve(dir) {
  const server = http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port, close: () => server.close(),
  })));
}

export async function launch() {
  const exe = fs.readdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers')
    .filter((d) => d.startsWith('chromium-'))
    .map((d) => path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', d, 'chrome-linux', 'chrome'))
    .find((p) => fs.existsSync(p));
  return chromium.launch({
    executablePath: exe,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-webgl'],
  });
}

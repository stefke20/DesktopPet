import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { WinBridge } = require('../src/main/bridge/win.cjs');
const hasMono = spawnSync('which', ['mcs']).status === 0 && spawnSync('which', ['mono']).status === 0;

// Compile the real helper with Mono (UI Automation excluded) and drive it through WinBridge's own
// request/response code. Win32 calls fail on Linux, so we test framing, errors and unknown commands.
test('bridge client talks to the C# helper (framing, errors, concurrency)', { skip: !hasMono }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petbridge-'));
  const exe = path.join(dir, 'PetBridge.exe');
  const r = spawnSync('mcs', ['-define:NO_UIA', '-r:System.Drawing.dll', `-out:${exe}`, path.resolve('src/main/bridge/PetBridge.cs')]);
  assert.equal(r.status, 0, String(r.stderr || r.stdout));
  const b = new WinBridge({ sourcePath: 'unused', cacheDir: dir });
  b.proc = spawn('mono', [exe], { stdio: ['pipe', 'pipe', 'pipe'] });
  b.proc.stdout.setEncoding('utf8');
  b.proc.stdout.on('data', (d) => b._onData(d));
  try {
    const ping = await b.request('ping');
    assert.equal(ping.ok, true);
    assert.equal(ping.uia, false);
    await assert.rejects(b.request('nonsense'), /unknown command/);
    await assert.rejects(b.windows(0), /EntryPointNotFound|DllNotFound|Exception/);   // Win32 isn't available here
    const many = await Promise.all(Array.from({ length: 25 }, () => b.request('ping')));
    assert.equal(many.length, 25);
    // tabs/newlines in arguments are sanitised instead of corrupting the protocol
    await assert.rejects(b.request('moveicon', ['a\tb\nc', 1, 2]), /Exception|icon|found|EntryPoint|DllNotFound/);
    assert.equal((await b.request('ping')).ok, true, 'helper still alive and in sync');
  } finally { b.proc.kill(); }
});

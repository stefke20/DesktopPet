import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// A behaviour routine that loops without yielding would freeze the whole app, and a synchronous
// freeze can't be caught in-process -- so the sweep runs in a child with a hard timeout.
test('no event/species/seed combination can freeze or push the pet off-screen', () => {
  const r = spawnSync(process.execPath, ['test/sweep.mjs'], { timeout: 120000, encoding: 'utf8' });
  assert.equal(r.error, undefined, 'sweep timed out (a routine is spinning without yielding?)');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /phase2 ok/);
});

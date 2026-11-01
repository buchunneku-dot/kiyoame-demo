'use strict';
const assert = require('node:assert/strict');
const { unlock } = require('../trackless-audio.js');
function context(resume) {
  const trace = [];
  return { trace, state: 'suspended', currentTime: 0, sampleRate: 44100, destination: {},
    resume() { trace.push('resume'); return resume(this); },
    createBuffer() { return {}; },
    createBufferSource() { return { connect() {}, disconnect() {}, start() { trace.push('start'); } }; } };
}
(async () => {
  const slow = context(ctx => new Promise(resolve => setTimeout(() => { ctx.state = 'running'; ctx.currentTime = 0.03; resolve(); }, 45)));
  let resolved = false;
  const ready = unlock(slow, 300).then(() => { resolved = true; });
  assert.deepEqual(slow.trace, ['resume', 'start'], 'the tap unlocks audio synchronously, without waiting for fullscreen or a timer');
  assert.equal(resolved, false, 'play does not start before the clock moves');
  await ready;
  assert.equal(resolved, true);

  const pending = context(ctx => { setTimeout(() => { ctx.state = 'running'; ctx.currentTime = 0.02; }, 10); return new Promise(() => {}); });
  await unlock(pending, 150);
  await assert.rejects(unlock(context(() => new Promise(() => {})), 50), /Audio did not start/);
  const frozen = context(ctx => { ctx.state = 'running'; return Promise.resolve(); });
  await assert.rejects(unlock(frozen, 50), /Audio did not start/, 'state=running still needs the clock to move');
  await assert.rejects(unlock(context(() => Promise.reject(new Error('NotAllowedError'))), 100), /blocked audio/);
  console.log('PASS: sync unlock, delayed start, pending resume, suspended timeout, frozen clock, denied audio');
})().catch(error => { console.error(error); process.exitCode = 1; });

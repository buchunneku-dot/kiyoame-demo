(function (root) {
  'use strict';
  function unlock(ctx, timeoutMs = 2500) {

    const resumed = ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination); source.onended = () => source.disconnect(); source.start(0);
    return new Promise((resolve, reject) => {
      const initialTime = ctx.currentTime, began = Date.now();
      let timer, finished = false;
      function finish(error) {
        if (finished) return;
        finished = true; clearTimeout(timer);
        if (error) reject(error); else resolve();
      }
      function check() {
        if (ctx.state === 'running' && ctx.currentTime > initialTime) { finish(); return; }
        if (Date.now() - began >= timeoutMs) { finish(new Error('Audio did not start. Press Start again.')); return; }
        timer = setTimeout(check, 25);
      }
      Promise.resolve(resumed).catch(() => finish(new Error('The browser blocked audio. Press Start again.')));
      check();
    });
  }
  const api = { unlock };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KiyoameTracklessAudio = api;
})(typeof window === 'object' ? window : globalThis);

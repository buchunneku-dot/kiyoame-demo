(function (root) {
  'use strict';
  let buffer = null, loading = null;

  const CHARTS = { standard: 'KiyoameChartStandard', showcase: 'KiyoameChartShowcase' };

  function buildChart(name) { return JSON.parse(JSON.stringify(root[CHARTS[name] || CHARTS.standard])); }

  function bytesOf(base64) {
    const text = atob(base64), out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
    return out.buffer;
  }

  function prepare(ctx) {
    if (buffer) return Promise.resolve(buffer);
    if (!loading) {
      const bytes = root.KIYOAME_THEME_AUDIO ? Promise.resolve(bytesOf(root.KIYOAME_THEME_AUDIO))
        : fetch('song/kiyoame-theme.mp3').then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); });
      loading = bytes.catch(() => { throw new Error('Song audio not found.'); })
        .then(data => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
        .then(b => (buffer = b), e => { loading = null; throw e; });
    }
    return loading;
  }

  function scheduleBacking(ctx, out, t0) {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.connect(out); source.start(t0);
  }

  function hitSound(ctx, out, xCells, layer, when) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const step = Math.max(0, Math.min(7, Math.floor(xCells / 3)));
    o.type = 'sine';
    o.frequency.value = (layer === 'upper' ? 2093 : 1046.5) * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16][step] / 12);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(layer === 'upper' ? 0.06 : 0.08, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    o.connect(g); g.connect(out); o.start(when); o.stop(when + 0.09);
  }

  root.KiyoameSong = { charts: Object.keys(CHARTS), buildChart, prepare, scheduleBacking, hitSound, LEAD: 0 };
})(typeof window === 'object' ? window : globalThis);

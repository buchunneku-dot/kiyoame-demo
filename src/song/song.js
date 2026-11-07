(function (root) {
  'use strict';

  const SONGS = [
    { id: 'theme', title: 'Kiyoame Theme', embedded: 'KIYOAME_THEME_AUDIO', file: 'song/kiyoame-theme.mp3',
      charts: { standard: 'KiyoameChartStandard', showcase: 'KiyoameChartShowcase' } },
    { id: 'ams', title: 'Ams', file: 'song/ams.mp3',
      charts: { standard: 'KiyoameChartAmsStandard', showcase: 'KiyoameChartAmsShowcase' } },
  ];
  const buffers = new Map(), loading = new Map();
  let current = SONGS[0];

  function select(id) { current = SONGS.find(s => s.id === id) || SONGS[0]; return current.id; }
  function chartOf(song, name) { return root[song.charts[name] || song.charts.standard]; }
  function buildChart(name, songId) {
    const song = songId ? SONGS.find(s => s.id === songId) || current : current;
    return JSON.parse(JSON.stringify(chartOf(song, name)));
  }
  function info(id) {
    const song = SONGS.find(s => s.id === id);
    const base = chartOf(song, 'standard');
    const counts = {};
    for (const name of Object.keys(song.charts)) counts[name] = chartOf(song, name).notes.length;
    return { id: song.id, title: song.title, bpm: base.bpm, duration: base.duration, counts };
  }

  function bytesOf(base64) {
    const text = atob(base64), out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
    return out.buffer;
  }

  function prepare(ctx) {
    const song = current;
    if (buffers.has(song.id)) return Promise.resolve(buffers.get(song.id));
    if (!loading.has(song.id)) {
      const data = song.embedded && root[song.embedded] ? Promise.resolve(bytesOf(root[song.embedded]))
        : fetch(song.file).then(r => { if (!r.ok) throw new Error(); return r.arrayBuffer(); });
      loading.set(song.id, data.catch(() => { throw new Error('Song audio not found.'); })
        .then(d => new Promise((resolve, reject) => ctx.decodeAudioData(d, resolve, reject)))
        .then(b => { buffers.set(song.id, b); loading.delete(song.id); return b; }, e => { loading.delete(song.id); throw e; }));
    }
    return loading.get(song.id);
  }

  function scheduleBacking(ctx, out, t0) {
    const buffer = buffers.get(current.id);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer; source.connect(out);
    const at = Math.max(t0, ctx.currentTime);
    source.start(at, at - t0);
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

  root.KiyoameSong = {
    songs: SONGS.map(s => s.id), charts: ['standard', 'showcase'],
    get selected() { return current.id; },
    select, info, buildChart, prepare, scheduleBacking, hitSound, LEAD: 0,
  };
})(typeof window === 'object' ? window : globalThis);

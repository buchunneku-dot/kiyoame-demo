(function (root) {
  'use strict';

  const T = typeof module === 'object' && module.exports ? require('./trackless-core.js') : root.KiyoameTrackless;
  const GRADES = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
  const BASES = ['Tap', 'Hold', 'Slide', 'Flow', 'Drag'];
  const zero = () => ({ PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 });
  const total = c => GRADES.reduce((s, g) => s + c[g], 0);
  const accuracy = c => { const n = total(c); return n ? GRADES.reduce((s, g) => s + c[g] * T.WEIGHTS[g], 0) / n : null; };

  function partTime(n, part, bpm) {
    if (part === 'head') return n.time;
    const i = Number(part.replace(/\D+/g, ''));
    if (part.startsWith('check')) return T.checksOf(n, bpm)[i];
    if (part.startsWith('tick')) return T.ticksOf(n)[i];
    return n.time;
  }

  function sectionsOf(chart) {
    const beat = 60 / chart.bpm, list = (chart.sections || []).slice().sort((a, b) => a.bar - b.bar);
    return list.map((s, i) => ({ name: s.name, start: s.bar * 4 * beat, end: i + 1 < list.length ? list[i + 1].bar * 4 * beat : chart.duration }));
  }

  function analyse(results, chart, options) {
    const o = Object.assign({ binMs: 10, rangeMs: 100, timelineBins: 32 }, options || {});
    const p = T.DEFAULTS, byId = new Map(chart.notes.map(n => [n.id, n]));
    const rows = results.map(r => {
      const n = byId.get(r.noteId);
      return Object.assign({}, r, { base: T.baseOf({ type: r.type }), at: n ? partTime(n, r.part, chart.bpm) : r.time, kind: r.part === 'head' ? 'head' : r.part.startsWith('check') ? 'checkpoint' : 'tick' });
    });

    const dts = rows.filter(r => r.kind === 'head' && r.base !== 'Drag' && !T.isEx(r) && r.dt !== null && r.grade !== 'MISS').map(r => r.dt * 1000);
    const nBins = Math.round(2 * o.rangeMs / o.binMs), bins = Array.from({ length: nBins }, (_, i) => ({ from: -o.rangeMs + i * o.binMs, to: -o.rangeMs + (i + 1) * o.binMs, count: 0 }));
    for (const d of dts) bins[Math.max(0, Math.min(nBins - 1, Math.floor((d + o.rangeMs) / o.binMs)))].count++;
    const mean = dts.length ? dts.reduce((s, d) => s + d, 0) / dts.length : 0;
    const sd = dts.length > 1 ? Math.sqrt(dts.reduce((s, d) => s + (d - mean) ** 2, 0) / (dts.length - 1)) : 0;
    const sorted = dts.slice().sort((a, b) => a - b);
    const timing = {
      count: dts.length, mean, sd,
      median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
      fast: dts.filter(d => d < -p.perfect * 1000 - 1e-6).length,
      slow: dts.filter(d => d > p.perfect * 1000 + 1e-6).length,
      bins,
    };

    const byType = BASES.map(base => {
      const heads = zero(), body = zero(), ex = zero();
      for (const r of rows) if (r.base === base) { (r.kind === 'head' ? heads : body)[r.grade]++; if (r.type !== base) ex[r.grade]++; }
      return { type: base, heads, body, all: GRADES.reduce((c, g) => (c[g] = heads[g] + body[g], c), zero()) };
    }).filter(t => total(t.all));
    for (const t of byType) { t.accuracy = accuracy(t.all); t.count = total(t.all); }

    const byLayer = { upper: zero(), lower: zero() };
    for (const r of rows) byLayer[r.layer][r.grade]++;

    const sections = sectionsOf(chart).map(s => {
      const c = zero();
      for (const r of rows) if (r.at >= s.start - 1e-6 && r.at < s.end - 1e-6) c[r.grade]++;
      return Object.assign(s, { counts: c, slots: total(c), accuracy: accuracy(c) });
    }).filter(s => s.slots);

    const span = chart.duration / o.timelineBins;
    const timeline = Array.from({ length: o.timelineBins }, (_, i) => ({ t0: i * span, t1: (i + 1) * span, counts: zero() }));
    for (const r of rows) timeline[Math.max(0, Math.min(o.timelineBins - 1, Math.floor(r.at / span)))].counts[r.grade]++;
    for (const b of timeline) { b.slots = total(b.counts); b.accuracy = accuracy(b.counts); }

    const misses = rows.filter(r => r.grade === 'MISS').map(r => ({ noteId: r.noteId, type: r.type, layer: r.layer, kind: r.kind, at: r.at }));

    return { timing, byType, byLayer, sections, timeline, misses, insights: insights({ timing, byType, byLayer, sections, misses }) };
  }

  function insights(a) {
    const out = [];
    if (a.timing.count >= 20 && Math.abs(a.timing.mean) >= 10) out.push(`Hits land ${Math.round(Math.abs(a.timing.mean))} ms ${a.timing.mean > 0 ? 'late' : 'early'} on average.`);
    if (a.timing.count >= 20 && a.timing.fast + a.timing.slow > 0) {
      const f = a.timing.fast, s = a.timing.slow;
      if (f >= 2 * s && f >= 5) out.push(`Most non-PERFECT hits are early (${f} FAST, ${s} SLOW).`);
      else if (s >= 2 * f && s >= 5) out.push(`Most non-PERFECT hits are late (${s} SLOW, ${f} FAST).`);
    }
    if (a.misses.length) {
      const groups = new Map();
      for (const m of a.misses) { const key = `${T.baseOf(m)} ${m.kind === 'head' ? 'notes' : m.kind === 'checkpoint' ? 'checkpoints' : 'ticks'}`; groups.set(key, (groups.get(key) || 0) + 1); }
      const [key, n] = [...groups].sort((x, y) => y[1] - x[1])[0];
      if (n >= 3 && n >= a.misses.length * 0.4) out.push(`${Math.round(n / a.misses.length * 100)}% of misses are ${key} (${n}).`);
    }
    if (a.sections.length >= 2) {
      const ranked = a.sections.filter(s => s.slots >= 10).sort((x, y) => x.accuracy - y.accuracy);
      if (ranked.length >= 2 && ranked[ranked.length - 1].accuracy - ranked[0].accuracy >= 0.05) out.push(`Weakest section: ${ranked[0].name} (${(ranked[0].accuracy * 100).toFixed(1)}%).`);
    }
    const up = accuracy(a.byLayer.upper), low = accuracy(a.byLayer.lower);
    if (up !== null && low !== null && Math.abs(up - low) >= 0.05) out.push(`The ${up < low ? 'upper' : 'lower'} layer is weaker: ${(Math.min(up, low) * 100).toFixed(1)}% against ${(Math.max(up, low) * 100).toFixed(1)}%.`);
    return out.slice(0, 3);
  }

  const api = { analyse, accuracy, total, sectionsOf, partTime };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KiyoameResultAnalysis = api;
})(typeof window === 'object' ? window : globalThis);

(function (root) {
  'use strict';

  const C = { ink: '#2a2f52', muted: '#6a7196', line: 'rgba(42,47,82,0.14)', zone: 'rgba(42,47,82,0.06)', early: '#4fbdb6', late: '#e7799f', perfect: '#5a63a6', miss: '#d9536a', mean: '#e8a53a' };
  const FONT = '500 10px Montserrat, system-ui, sans-serif';

  function setup(canvas) {
    const dpr = Math.min(2, root.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
    const w = Math.max(10, r.width), h = Math.max(10, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h };
  }

  function drawHistogram(canvas, timing, perfectMs) {
    const { g, w, h } = setup(canvas), pad = 14, base = h - pad, top = 6;
    const bins = timing.bins, lo = bins[0].from, hi = bins[bins.length - 1].to;
    const xOf = ms => (ms - lo) / (hi - lo) * w;
    g.fillStyle = C.zone; g.fillRect(xOf(-perfectMs), top, xOf(perfectMs) - xOf(-perfectMs), base - top);
    const max = Math.max(1, ...bins.map(b => b.count));
    for (const b of bins) {
      if (!b.count) continue;
      const mid = (b.from + b.to) / 2, bh = (base - top) * b.count / max;
      g.fillStyle = Math.abs(mid) <= perfectMs ? C.perfect : mid < 0 ? C.early : C.late;
      g.fillRect(xOf(b.from) + 1, base - bh, xOf(b.to) - xOf(b.from) - 2, bh);
    }
    g.fillStyle = C.line; g.fillRect(0, base, w, 1); g.fillRect(xOf(0), top, 1, base - top);
    if (timing.count) { g.fillStyle = C.mean; g.fillRect(Math.round(xOf(Math.max(lo, Math.min(hi, timing.mean)))) - 1, top, 2, base - top); }
    g.fillStyle = C.muted; g.font = FONT;
    g.textAlign = 'left'; g.fillText(`${lo} ms`, 0, h - 2);
    g.textAlign = 'center'; g.fillText('0', xOf(0), h - 2);
    g.textAlign = 'right'; g.fillText(`+${hi} ms`, w, h - 2);
  }

  function drawTimeline(canvas, analysis, duration) {
    const { g, w, h } = setup(canvas), labels = 12, base = h - 8, top = labels + 2;
    const xOf = t => t / duration * w;
    for (const b of analysis.timeline) {
      if (!b.slots) continue;
      const bh = (base - top) * Math.max(0.04, (b.accuracy - 0.5) / 0.5);
      g.fillStyle = b.counts.MISS ? C.late : C.perfect;
      g.globalAlpha = b.counts.MISS ? 0.9 : 0.55;
      g.fillRect(xOf(b.t0) + 1, base - Math.max(1, bh), xOf(b.t1) - xOf(b.t0) - 2, Math.max(1, bh));
    }
    g.globalAlpha = 1;
    g.fillStyle = C.line; g.fillRect(0, base, w, 1);
    g.fillStyle = C.miss;
    for (const m of analysis.misses) g.fillRect(Math.round(xOf(m.at)), base + 2, 1, 5);
    g.font = FONT; g.textAlign = 'left';
    let lastEnd = -Infinity;
    for (const s of analysis.sections) {
      const x = xOf(s.start);
      g.fillStyle = C.line; g.fillRect(Math.round(x), top - 2, 1, base - top + 2);
      const label = s.name.toUpperCase();
      if (x < lastEnd + 6) continue;
      g.fillStyle = C.muted; g.fillText(label, x + 3, labels - 2);
      lastEnd = x + 3 + g.measureText(label).width;
    }
  }

  const pct = v => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  const sign = v => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`;

  function render(doc, analysis, chart, perfectMs) {
    const $ = id => doc.getElementById(id), t = analysis.timing;
    $('r-timing').textContent = t.count
      ? `Average ${sign(t.mean)} ms (${Math.abs(t.mean) < 5 ? 'centred' : t.mean > 0 ? 'late' : 'early'}) · spread ±${Math.round(t.sd)} ms · FAST ${t.fast} · SLOW ${t.slow}`
      : 'No timed hits.';
    $('r-types').innerHTML = '<tr class="head"><td>Type</td><td>PERFECT · GREAT · GOOD · MISS</td><td>Accuracy</td></tr>' + analysis.byType.map(x => `<tr><td>${x.type}</td><td>${x.all.PERFECT} · ${x.all.GREAT} · ${x.all.GOOD} · ${x.all.MISS}</td><td>${pct(x.accuracy)}</td></tr>`).join('');
    $('r-insights').innerHTML = (analysis.insights.length ? analysis.insights : ['Nothing stands out: timing and sections are even.']).map(s => `<li>${s}</li>`).join('');
    drawHistogram($('r-hist'), t, perfectMs);
    drawTimeline($('r-timeline'), analysis, chart.duration);
  }

  root.KiyoameResultView = { render, drawHistogram, drawTimeline };
})(typeof window === 'object' ? window : globalThis);

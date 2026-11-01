(function (root) {
  'use strict';
  const Tap = typeof module === 'object' && module.exports ? require('./trackless-tap.js') : root.KiyoameTracklessTap;
  const COLORS = { upper: '#6fd3cd', lower: '#f293ba' };
  const u = cell => cell / 3 + 0.25;
  const depth = (L, d) => Math.max(L.dMin, Math.min(L.dMax, d));
  function line(g, pts, color, width) {
    if (pts.length < 2) return;
    g.beginPath(); pts.forEach((p, i) => { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
    g.strokeStyle = color; g.lineWidth = width; g.stroke();
  }
  function polygon(g, pts, color) {
    if (pts.length < 3) return;
    g.beginPath(); pts.forEach((p, i) => { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
    g.closePath(); g.fillStyle = color; g.fill();
  }

  function head(g, L, x, width, d, layer, alpha, ex, kind) {
    Tap.draw(g, L, x, width, d, layer, alpha, ex, kind === 'Flow' || kind === 'scrub');

  }

  function ribbon(g, L, samples, layer, alpha, kind, active = false, broken = false, tailVisible = true) {
    if (samples.length < 2 || alpha <= 0) return;

    const flow = kind === 'Flow';
    const dense = [samples[0]];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      const count = Math.max(1, Math.ceil(Math.abs(L.yAt(depth(L, b.d)) - L.yAt(depth(L, a.d))) / (flow ? 1.5 : 7)),
        flow ? Math.ceil(Math.abs((b.time ?? b.d) - (a.time ?? a.d)) * 128) : 1);
      for (let k = 1; k <= count; k++) {
        const t = k / count;
        dense.push({ x: a.x + (b.x - a.x) * t, width: a.width + (b.width - a.width) * t, d: a.d + (b.d - a.d) * t, time: (a.time ?? a.d) + ((b.time ?? b.d) - (a.time ?? a.d)) * t });
      }
    }
    const firstY = L.yAt(depth(L, dense[0].d)), tailY = L.yAt(depth(L, dense[dense.length - 1].d));
    const soften = Math.min(54, Math.max(1, (firstY - tailY) * 0.32));
    const sc = L.scale(depth(L, dense[0].d));
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const base = rgb(broken ? '#637487' : COLORS[layer]);
    function shade(f) {

      const light = 0.07 + 0.12 * Math.exp(-Math.pow((f - 0.32) / 0.28, 2));
      return '#' + base.map(v => Math.round(v + (255 - v) * light).toString(16).padStart(2, '0')).join('');
    }
    function paint(hex) {
      if (!tailVisible) return hex;
      const c = rgb(hex), grad = g.createLinearGradient(0, tailY, 0, tailY + soften);
      const rgba = a => `rgba(${c.join(',')},${a})`;
      grad.addColorStop(0, rgba(0.5)); grad.addColorStop(0.25, rgba(0.58));
      grad.addColorStop(0.62, rgba(0.82)); grad.addColorStop(1, rgba(1));
      return grad;
    }
    const band = f => dense.map(s => L.P(u(s.x + s.width * f), depth(L, s.d)));
    const left = band(0.025), right = band(0.975);
    const contour = left.concat(right.slice().reverse());
    const deep = layer === 'upper' ? '#246b76' : '#944366';
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    g.globalAlpha = alpha * (broken ? 0.22 : flow ? 0.15 : 0.6);
    polygon(g, contour.map(p => ({ x: p.x, y: p.y + 3 * sc })), paint(deep));
    g.globalAlpha = alpha * (broken ? 0.12 : flow ? 0.14 : active ? 0.83 : 0.67);

    polygon(g, contour, paint(shade(0.3)));
    if (flow) {

      const waveLeft = [], waveRight = [];
      for (const s of dense) {
        const t = s.time ?? s.d;
        const amplitude = 0.025 + 0.34 * Math.abs(0.62 * Math.sin(t * Math.PI * 18.6) + 0.38 * Math.sin(t * Math.PI * 43.4 + 0.8));
        const d = depth(L, s.d);
        waveLeft.push(L.P(u(s.x + s.width * (0.5 - amplitude)), d));
        waveRight.push(L.P(u(s.x + s.width * (0.5 + amplitude)), d));
      }
      g.globalAlpha = alpha * (broken ? 0.2 : active ? 0.9 : 0.78);
      polygon(g, waveLeft.concat(waveRight.slice().reverse()), paint(shade(0.3)));
      g.globalAlpha = alpha * (broken ? 0.08 : 0.44);
      for (const edge of [waveLeft, waveRight])
        line(g, edge, paint(layer === 'upper' ? '#d2f8f3' : '#fce0ed'), Math.max(0.6, 0.95 * sc));
    }
    g.globalAlpha = alpha * (broken ? 0.3 : flow ? 0.3 : 0.85);
    for (const edge of [left, right]) {
      line(g, edge, paint(deep), Math.max(1, 5 * sc));
      line(g, edge, paint(shade(0.35)), Math.max(0.8, 2.5 * sc));
    }
    g.globalAlpha = alpha * (broken ? 0.1 : flow ? 0.14 : 0.36);
    line(g, band(0.07), paint(layer === 'upper' ? '#b9eee9' : '#f7d1e2'), Math.max(0.7, 1.2 * sc));

    if (tailVisible) {
      const end = [left[left.length - 1], right[right.length - 1]];
      g.lineCap = 'butt';
      g.globalAlpha = alpha * (broken ? 0.3 : 0.8);
      line(g, end, deep, Math.max(1, 4 * sc));
      line(g, end, layer === 'upper' ? '#a4d6d2' : '#dcb0c5', Math.max(0.9, 2.2 * sc));
    }
    g.restore();
  }

  function drag(g, L, x, width, d, alpha = 1) {
    const h = L.thick(22, d);
    if (d + h / 2 < L.dMin || d - h / 2 > L.dMax) return;
    const P = (s, t) => L.P(u(x + width * s), depth(L, d + h * t));
    const shell = [P(0, -0.5), P(1, -0.5), P(1, 0.5), P(0, 0.5)];
    g.save(); g.globalAlpha = alpha; g.lineJoin = 'miter';
    polygon(g, shell, '#805117');
    g.strokeStyle = '#ffdd70'; g.lineWidth = Math.max(0.7, L.scale(d)); g.stroke();
    polygon(g, [P(0.015, -0.25), P(0.985, -0.25), P(0.985, 0.45), P(0.015, 0.45)], '#ffd96d');
    line(g, [P(0.08, 0.25), P(0.92, 0.25)], '#fff2c0', Math.max(0.7, 1.7 * L.scale(d)));
    g.restore();
  }
  const api = { head, ribbon, drag };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KiyoameTracklessNotes = api;
})(typeof window === 'object' ? window : globalThis);

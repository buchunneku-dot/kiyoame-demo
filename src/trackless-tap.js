(function (root) {
  'use strict';

  const PALETTES = {
    upper: { face: '#7fd9d3', light: '#dcf8f5', side: '#3a9aa3', bottom: '#1f5c68', outline: '#2f8690' },
    lower: { face: '#f4a2c3', light: '#ffeaf3', side: '#c4648f', bottom: '#7d3a5a', outline: '#b2547f' },
  };
  function draw(g, L, cellX, cellW, d, layer, alpha = 1, ex = false, hollow = false) {
    const p = PALETTES[layer], scale = L.scale(d), h = L.thick(ex ? 38 : 28, d);
    const lo = d - h / 2, hi = d + h / 2;
    if (hi <= L.dMin || lo >= L.dMax || alpha <= 0) return;
    const u0 = cellX / 3 + 0.27, u1 = (cellX + cellW) / 3 + 0.23;
    const width = Math.max(1, (u1 - u0) * L.slot * scale);
    const inset = ex ? Math.min(0.16, 3.5 * scale / width) : Math.min(0.06, scale / width);
    const P = (s, t) => L.P(u0 + (u1 - u0) * s, Math.max(L.dMin, Math.min(L.dMax, lo + h * t)));
    function plate(a, b, c, e, color) {
      const pts = [P(a, c), P(b, c), P(b, e), P(a, e)];
      g.beginPath(); pts.forEach((q, i) => { if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
      g.closePath(); g.fillStyle = color; g.fill();
    }
    g.save(); g.globalAlpha = alpha; g.lineJoin = 'miter'; g.lineCap = 'butt';

    plate(0, 1, 0, 1, ex ? '#9766d9' : p.bottom);
    if (ex) {
      g.strokeStyle = '#d1adff'; g.lineWidth = Math.max(0.8, scale); g.stroke();
      plate(inset * 0.65, 1 - inset * 0.65, 0.13, 0.87, '#50376d');
    }
    const c = ex ? 0.2 : 0.04, e = ex ? 0.8 : 0.96;
    const T = t => c + (e - c) * t;
    if (hollow) {

      plate(inset, 1 - inset, c, e, p.face);
      const rim = Math.min(0.22, 2.5 * scale / width);
      plate(inset + rim, 1 - inset - rim, c + (e - c) * 0.16, e - (e - c) * 0.16,
        layer === 'upper' ? '#183439' : '#39232f');
      plate(inset, 1 - inset, c, c + (e - c) * 0.08, p.side);
      g.restore();
      return;
    }

    plate(inset, 1 - inset, T(0), T(0.25), p.side);
    plate(inset, 1 - inset, T(0), T(0.07), p.bottom);
    const far = P(0.5, T(1)), near = P(0.5, T(0.24));
    const face = g.createLinearGradient(0, far.y, 0, Math.max(far.y + 0.01, near.y));
    face.addColorStop(0, p.light); face.addColorStop(0.45, p.face); face.addColorStop(1, p.face);
    plate(inset, 1 - inset, T(0.24), T(1), face);
    g.globalAlpha = alpha * 0.65;
    plate(inset, 1 - inset, T(0.93), T(1), p.light);

    g.globalAlpha = alpha;
    const rim = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
    g.beginPath(); rim.forEach((q, i) => { if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.closePath();
    g.strokeStyle = p.outline; g.lineWidth = Math.max(0.8, scale); g.stroke();
    g.restore();
  }
  const api = { draw };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KiyoameTracklessTap = api;
})(typeof window === 'object' ? window : globalThis);

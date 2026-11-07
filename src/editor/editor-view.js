(function (root) {
  'use strict';

  const CELLS = 24;
  const RULER = 56, GAP = 18, BOTTOM = 28, TOP = 26;
  const COLORS = { bg: '#eef1f7', ink: '#2a2f52', muted: '#6a7196', line: 'rgba(42,47,82,', upper: '#6fd3cd', lower: '#f293ba', accent: '#e8a53a', miss: '#d9536a', play: '#5a63a6' };
  const LAYERS = ['upper', 'lower'];

  class EditorView {
    constructor(canvas) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.scroll = 0;
      this.pps = 160;
      this.W = 0; this.H = 0; this.dpr = 1;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = r.width; this.H = r.height;
      this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
    }

    get colW() { return (this.W - RULER - GAP * 3) / 2; }
    get cellW() { return this.colW / CELLS; }
    colLeft(layer) { return RULER + GAP + (layer === 'upper' ? 0 : this.colW + GAP); }
    xOf(layer, cell) { return this.colLeft(layer) + cell * this.cellW; }
    yOf(t) { return this.H - BOTTOM - (t - this.scroll) * this.pps; }
    tOf(y) { return this.scroll + (this.H - BOTTOM - y) / this.pps; }
    visible() { return [this.tOf(this.H), this.tOf(0)]; }

    at(x, y) {
      for (const layer of LAYERS) {
        const l = this.colLeft(layer);
        if (x >= l - GAP / 2 && x <= l + this.colW + GAP / 2) return { layer, cell: Math.max(0, Math.min(CELLS - 0.001, (x - l) / this.cellW)), t: this.tOf(y) };
      }
      return { layer: null, cell: null, t: this.tOf(y), ruler: x < RULER + GAP / 2 };
    }

    zoomAt(y, factor) {
      const t = this.tOf(y);
      this.pps = Math.max(30, Math.min(1200, this.pps * factor));
      this.scroll = t - (this.H - BOTTOM - y) / this.pps;
    }

    reveal(t) {
      const [a, b] = this.visible();
      if (t < a + 0.3 || t > b - 0.3) this.scroll = t - (this.H - BOTTOM - TOP) / this.pps * 0.3;
    }

    hit(notes, x, y) {
      const p = this.at(x, y);
      if (!p.layer) return null;
      let best = null;
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        if (n.layer !== p.layer) continue;
        const y0 = this.yOf(n.time), y1 = n.end === undefined ? y0 : this.yOf(n.end);
        if (y > y0 + 7 || y < y1 - 7) continue;
        const t = Math.max(n.time, Math.min(n.end === undefined ? n.time : n.end, p.t));
        const r = rangeAt(n, t);
        if (p.cell < r.x - 0.3 || p.cell > r.x + r.width + 0.3) continue;
        const part = n.end !== undefined && Math.abs(y - y1) <= 7 ? (n.path ? 'slideEnd' : 'end') : 'body';
        if (!best || part !== 'body') best = { id: n.id, part };
        if (part !== 'body') break;
      }
      return best;
    }

    draw(s) {
      const g = this.g, W = this.W, H = this.H, chart = s.chart;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = COLORS.bg; g.fillRect(0, 0, W, H);
      const [t0, t1] = this.visible();

      for (const layer of LAYERS) {
        const l = this.colLeft(layer);
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(l, 0, this.colW, H);
        for (let c = 0; c <= CELLS; c++) {
          g.fillStyle = COLORS.line + (c % 3 === 0 ? '0.14)' : '0.05)');
          g.fillRect(Math.round(l + c * this.cellW), 0, 1, H);
        }
        g.fillStyle = layer === 'upper' ? COLORS.upper : COLORS.lower;
        g.fillRect(l, H - BOTTOM + 6, this.colW, 3);
        g.fillStyle = COLORS.muted; g.font = '600 11px Montserrat, system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText(layer === 'upper' ? 'UPPER' : 'LOWER', l + this.colW / 2, H - 8);
      }

      const beat = 60 / chart.bpm, step = beat * 4 / (s.division || 4), off = s.offset || 0;
      const k0 = Math.floor((t0 - off) / step), k1 = Math.ceil((t1 - off) / step);
      const perBeat = (s.division || 4) / 4;
      g.textAlign = 'right'; g.font = '500 11px Montserrat, system-ui, sans-serif';
      for (let k = k0; k <= k1; k++) {
        const t = off + k * step, y = Math.round(this.yOf(t));
        const onBeat = Math.abs(k / perBeat - Math.round(k / perBeat)) < 1e-6;
        const b = Math.round(k / perBeat), bar = onBeat && b % 4 === 0;
        if (step * this.pps < 5 && !onBeat) continue;
        g.fillStyle = COLORS.line + (bar ? '0.42)' : onBeat ? '0.2)' : '0.08)');
        g.fillRect(RULER + GAP, y, W - RULER - GAP * 2, bar ? 2 : 1);
        if (bar && t >= 0) { g.fillStyle = COLORS.muted; g.fillText(String(b / 4 + 1), RULER - 6, y + 4); }
      }
      g.textAlign = 'left';
      for (const sec of chart.sections || []) {
        const y = this.yOf(off + sec.bar * 4 * beat);
        if (y < -20 || y > H) continue;
        g.fillStyle = COLORS.ink; g.font = '600 11px Montserrat, system-ui, sans-serif';
        g.fillText(sec.name.toUpperCase(), RULER + GAP + 4, y - 5);
      }
      g.fillStyle = COLORS.line + '0.5)';
      g.fillRect(RULER + GAP, Math.round(this.yOf(chart.duration)), W - RULER - GAP * 2, 2);

      const byId = new Map(chart.notes.map(n => [n.id, n]));
      for (const n of chart.notes) {
        if ((n.end === undefined ? n.time : n.end) < t0 - 0.1 || n.time > t1 + 0.1) continue;
        if (n.link !== undefined && n.layer === 'upper') {
          const o = byId.get(n.link);
          if (o) {
            g.strokeStyle = COLORS.ink; g.globalAlpha = 0.35; g.setLineDash([4, 4]); g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(this.xOf('upper', n.x + n.width), this.yOf(n.time)); g.lineTo(this.xOf('lower', o.x), this.yOf(o.time)); g.stroke();
            g.setLineDash([]); g.globalAlpha = 1;
          }
        }
      }
      for (const n of chart.notes) {
        if ((n.end === undefined ? n.time : n.end) < t0 - 0.1 || n.time > t1 + 0.1) continue;
        this.drawNote(n, { selected: s.selected.has(n.id), flagged: s.flagged.has(n.id), error: s.errored.has(n.id) });
      }
      if (s.ghost) this.drawNote(s.ghost, { ghost: true });

      if (s.box) {
        g.fillStyle = 'rgba(90,99,166,0.1)'; g.strokeStyle = COLORS.play; g.lineWidth = 1;
        const { x0, y0, x1, y1 } = s.box;
        g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        g.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
      }

      const py = Math.round(this.yOf(s.playhead));
      g.fillStyle = COLORS.play; g.fillRect(RULER - 2, py - 1, W - RULER, 2);
      g.beginPath(); g.moveTo(RULER - 2, py - 6); g.lineTo(RULER + 6, py); g.lineTo(RULER - 2, py + 6); g.fill();
      g.textAlign = 'left'; g.font = '600 11px Montserrat, system-ui, sans-serif';
      g.fillText(formatTime(s.playhead), 6, py - 6);
    }

    drawNote(n, o) {
      const g = this.g, color = n.layer === 'upper' ? COLORS.upper : COLORS.lower;
      const base = n.type.startsWith('Ex') && n.type.length > 2 ? n.type.slice(2) : n.type, ex = base !== n.type;
      const y0 = this.yOf(n.time), x0 = this.xOf(n.layer, n.x), x1 = this.xOf(n.layer, n.x + n.width);
      g.globalAlpha = o.ghost ? 0.5 : 1;
      if (n.end !== undefined) {
        const y1 = this.yOf(n.end);
        g.beginPath();
        if (n.path) {
          n.path.forEach((p, i) => { const y = this.yOf(p.t), x = this.xOf(n.layer, p.x); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
          for (let i = n.path.length - 1; i >= 0; i--) { const p = n.path[i]; g.lineTo(this.xOf(n.layer, p.x + p.width), this.yOf(p.t)); }
          g.closePath();
        } else g.rect(x0, y1, x1 - x0, y0 - y1);
        g.fillStyle = color; g.globalAlpha = (o.ghost ? 0.5 : 1) * 0.32; g.fill();
        g.globalAlpha = o.ghost ? 0.5 : 1;
        if (base === 'Flow') {
          g.save(); g.clip();
          g.strokeStyle = color; g.lineWidth = 2;
          for (let x = x0 - (y0 - y1); x < x1; x += n.mode === 'scrub' ? 8 : 14) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (y0 - y1), y1); g.stroke(); }
          g.restore();
        }
        g.fillStyle = color; g.fillRect(x0, y1 - 2, x1 - x0, 3);
        if (n.path) { const e = n.path[n.path.length - 1]; g.fillRect(this.xOf(n.layer, e.x), y1 - 2, e.width * this.cellW, 3); }
      }
      const h = base === 'Drag' ? 6 : 10;
      if (base === 'Drag') {
        g.strokeStyle = color; g.lineWidth = 2; g.strokeRect(x0 + 1, y0 - h / 2, x1 - x0 - 2, h);
      } else {
        g.fillStyle = color; roundRect(g, x0 + 1, y0 - h / 2, x1 - x0 - 2, h, 3); g.fill();
      }
      if (ex) { g.strokeStyle = COLORS.accent; g.lineWidth = 2; roundRect(g, x0, y0 - h / 2 - 1, x1 - x0, h + 2, 3); g.stroke(); }
      if (o.error || o.flagged) { g.strokeStyle = COLORS.miss; g.lineWidth = 2; g.setLineDash(o.error ? [] : [3, 3]); roundRect(g, x0 - 2, y0 - h / 2 - 3, x1 - x0 + 4, h + 6, 4); g.stroke(); g.setLineDash([]); }
      if (o.selected) { g.strokeStyle = COLORS.ink; g.lineWidth = 2; roundRect(g, x0 - 3, y0 - h / 2 - 4, x1 - x0 + 6, h + 8, 5); g.stroke(); }
      g.globalAlpha = 1;
    }
  }

  function rangeAt(n, t) {
    if (!n.path) return { x: n.x, width: n.width };
    const p = n.path;
    for (let i = 1; i < p.length; i++) if (t <= p[i].t) { const a = p[i - 1], b = p[i], k = (t - a.t) / (b.t - a.t || 1); return { x: a.x + (b.x - a.x) * k, width: a.width + (b.width - a.width) * k }; }
    return { x: p[p.length - 1].x, width: p[p.length - 1].width };
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function formatTime(t) { const s = Math.max(0, t); return `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`; }

  root.KiyoameEditorView = { EditorView, formatTime, RULER, GAP };
})(typeof window === 'object' ? window : globalThis);

(function (root) {
  'use strict';

  const T = typeof module === 'object' && module.exports ? require('../trackless-core.js') : root.KiyoameTrackless;
  const LONG = new Set(['Hold', 'Slide', 'Flow']);
  const round = t => Math.round(t * 1000) / 1000;
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const baseType = type => (type.length > 2 && type.startsWith('Ex') ? type.slice(2) : type);
  const exOf = type => type.startsWith('Ex') && type.length > 2;

  function typeName(base, ex) {
    if (base === 'Drag') return 'Drag';
    return (ex ? 'Ex' : '') + base;
  }

  function snap(t, bpm, offset, division) {
    if (!division) return round(t);
    const step = 60 / bpm / (division / 4);
    return round(offset + Math.round((t - offset) / step) * step);
  }

  function normalize(n, chart) {
    const base = baseType(n.type), out = { id: n.id, type: n.type, layer: n.layer, time: round(Math.max(0, n.time)) };
    const width = clamp(Math.round(n.width || 1), T.MIN_WIDTH, T.CELLS);
    if (LONG.has(base)) {
      const minLen = base === 'Flow' ? (n.tick || 0.25) : 0.05;
      out.end = round(Math.min(Math.max(n.end === undefined ? out.time + 0.5 : n.end, out.time + minLen), chart.duration - 0.001));
    }
    out.x = clamp(Math.round(n.x || 0), 0, T.CELLS - width);
    out.width = width;
    if (base === 'Flow') { out.mode = n.mode === 'scrub' ? 'scrub' : 'hold'; out.tick = n.tick || 0.25; }
    if (base === 'Slide') {
      const old = Array.isArray(n.path) && n.path.length >= 2 ? n.path : null;
      const last = old ? old[old.length - 1] : { x: out.x, width: out.width };
      const lw = clamp(Math.round(last.width), T.MIN_WIDTH, T.CELLS);
      const mids = old ? old.slice(1, -1).filter(p => p.t > out.time && p.t < out.end) : [];
      out.path = [{ t: out.time, x: out.x, width: out.width }, ...mids.map(p => ({ t: round(p.t), x: clamp(Math.round(p.x), 0, T.CELLS - p.width), width: p.width })),
        { t: out.end, x: clamp(Math.round(last.x), 0, T.CELLS - lw), width: lw }];
    }
    if (n.link !== undefined) out.link = n.link;
    return out;
  }

  class EditorDoc {
    constructor(chart) {
      this.chart = clone(chart);
      this.chart.notes = this.chart.notes.map(n => normalize(n, this.chart));
      this.sort();
      this.past = []; this.future = [];
      this.serial = 0;
      this.onChange = null;
    }

    static blank(meta) {
      return new EditorDoc({ version: 'trackless-v1', id: meta.id || 'custom', title: meta.title || 'Untitled', bpm: meta.bpm || 120, duration: meta.duration || 60, cells: T.CELLS, lead: 0, notes: [] });
    }

    get notes() { return this.chart.notes; }
    byId(id) { return this.chart.notes.find(n => n.id === id); }
    sort() { this.chart.notes.sort((a, b) => a.time - b.time); }

    newId() {
      const used = new Set(this.chart.notes.map(n => n.id));
      let id;
      do { id = 'e' + String(++this.serial).padStart(3, '0'); } while (used.has(id));
      return id;
    }

    commit(fn) {
      const before = JSON.stringify(this.chart.notes);
      const result = fn();
      this.sort();
      if (JSON.stringify(this.chart.notes) !== before) {
        this.past.push(before);
        if (this.past.length > 200) this.past.shift();
        this.future = [];
        if (this.onChange) this.onChange();
      }
      return result;
    }

    undo() { if (!this.past.length) return false; this.future.push(JSON.stringify(this.chart.notes)); this.chart.notes = JSON.parse(this.past.pop()); if (this.onChange) this.onChange(); return true; }
    redo() { if (!this.future.length) return false; this.past.push(JSON.stringify(this.chart.notes)); this.chart.notes = JSON.parse(this.future.pop()); if (this.onChange) this.onChange(); return true; }

    add(note) {
      return this.commit(() => {
        const n = normalize(Object.assign({ id: this.newId() }, note), this.chart);
        this.chart.notes.push(n);
        return n.id;
      });
    }

    update(id, patch) {
      return this.commit(() => {
        const i = this.chart.notes.findIndex(n => n.id === id);
        if (i < 0) return false;
        const old = this.chart.notes[i], next = Object.assign({}, old, patch);
        if (patch.type && baseType(patch.type) !== baseType(old.type)) { delete next.path; delete next.mode; delete next.tick; if (!LONG.has(baseType(patch.type))) delete next.end; }
        if (patch.time !== undefined && old.end !== undefined && patch.end === undefined) next.end = old.end + (next.time - old.time);
        if (patch.time !== undefined && old.path && patch.path === undefined) next.path = old.path.map(p => Object.assign({}, p, { t: p.t + (next.time - old.time) }));
        if (patch.x !== undefined && old.path && patch.path === undefined) next.path = old.path.map(p => Object.assign({}, p, { x: p.x + (next.x - old.x) }));
        if (patch.layer && patch.layer !== old.layer && old.link !== undefined) this.unlinkRaw(old);
        this.chart.notes[i] = normalize(next, this.chart);
        if (next.link === undefined) delete this.chart.notes[i].link;
        return true;
      });
    }

    setSlideEnd(id, x, width) {
      const n = this.byId(id);
      if (!n || !n.path) return false;
      const path = n.path.map(p => Object.assign({}, p));
      Object.assign(path[path.length - 1], { x, width: width || path[path.length - 1].width });
      return this.update(id, { path });
    }

    move(ids, dt, dx) {
      return this.commit(() => {
        for (const id of ids) {
          const n = this.byId(id);
          if (!n) continue;
          const span = (n.end === undefined ? 0 : n.end - n.time);
          const time = clamp(n.time + dt, 0, this.chart.duration - 0.001 - span);
          const xs = n.path ? n.path.flatMap(p => [p.x, p.x + p.width]) : [n.x, n.x + n.width];
          const shift = clamp(dx, -Math.min(...xs), T.CELLS - Math.max(...xs));
          const next = Object.assign({}, n, { time, x: n.x + shift });
          if (n.end !== undefined) next.end = n.end + (time - n.time);
          if (n.path) next.path = n.path.map(p => ({ t: p.t + (time - n.time), x: p.x + shift, width: p.width }));
          Object.assign(n, normalize(next, this.chart));
        }
        this.repairLinks();
      });
    }

    remove(ids) {
      return this.commit(() => {
        const gone = new Set(ids);
        for (const n of this.chart.notes) if (gone.has(n.link)) delete n.link;
        this.chart.notes = this.chart.notes.filter(n => !gone.has(n.id));
      });
    }

    unlinkRaw(n) { const o = this.byId(n.link); if (o) delete o.link; delete n.link; }

    link(a, b) {
      return this.commit(() => {
        const na = this.byId(a), nb = this.byId(b);
        if (!na || !nb || na === nb) return 'Select two notes';
        if (na.layer === nb.layer) return 'Linked notes must be one upper and one lower';
        if (!(na.x < nb.x + nb.width && nb.x < na.x + na.width)) return 'Linked notes must overlap';
        for (const n of [na, nb]) if (n.link !== undefined) this.unlinkRaw(n);
        nb.time = na.time;
        if (nb.end !== undefined) nb.end = Math.max(nb.end, nb.time + 0.05);
        Object.assign(nb, normalize(nb, this.chart));
        na.link = nb.id; nb.link = na.id;
        return '';
      });
    }

    unlink(id) { return this.commit(() => { const n = this.byId(id); if (n && n.link !== undefined) this.unlinkRaw(n); }); }

    repairLinks() {
      for (const n of this.chart.notes) {
        if (n.link === undefined) continue;
        const o = this.byId(n.link);
        if (!o || o.link !== n.id || Math.abs(o.time - n.time) > 1e-6) { delete n.link; if (o && o.link === n.id) delete o.link; }
      }
    }

    paste(notes, at) {
      if (!notes.length) return [];
      const t0 = Math.min(...notes.map(n => n.time)), map = new Map();
      return this.commit(() => {
        for (const n of notes) map.set(n.id, this.newId());
        const out = [];
        for (const n of notes) {
          const c = clone(n), shift = at - t0;
          c.id = map.get(n.id);
          c.time += shift;
          if (c.end !== undefined) c.end += shift;
          if (c.path) c.path.forEach(p => { p.t += shift; });
          if (c.link !== undefined) { if (map.has(c.link)) c.link = map.get(c.link); else delete c.link; }
          if (c.time < 0 || (c.end || c.time) >= this.chart.duration) continue;
          this.chart.notes.push(normalize(c, this.chart));
          out.push(c.id);
        }
        this.repairLinks();
        return out;
      });
    }

    check() {
      const chart = this.chart, errors = [], ids = new Set(chart.notes.map(n => n.id));
      const idsIn = text => text.split(/[^A-Za-z0-9_-]+/).filter(w => ids.has(w));
      for (const n of chart.notes) {
        const solo = clone(n); delete solo.link;
        try { T.validateChart(Object.assign({}, chart, { notes: [solo] })); }
        catch (e) { errors.push({ level: 'error', noteIds: [n.id], message: e.message }); }
      }
      if (!errors.length && chart.notes.length) {
        try { T.validateChart(clone(chart)); } catch (e) { errors.push({ level: 'error', noteIds: idsIn(e.message), message: e.message }); }
      }
      if (!chart.notes.length) errors.push({ level: 'error', noteIds: [], message: 'The chart has no notes' });
      let warnings = [], peak = 0, autoplay = null;
      if (chart.notes.length) {
        const lint = T.lint(chart);
        peak = lint.peakContacts;
        warnings = lint.warnings.map(w => ({ level: 'warning', noteIds: idsIn(w), message: w }));
      }
      if (!errors.length) autoplay = T.play(new T.Judge(clone(chart)), T.autoplayEvents(chart)).score;
      return { errors, warnings, peakContacts: peak, autoplayScore: autoplay, ok: !errors.length };
    }

    toJSON() { return clone(this.chart); }

    toScript(globalName) {
      return `(function (root) { root.${globalName} = ${JSON.stringify(this.chart)}; })(typeof window === 'object' ? window : globalThis);\n`;
    }
  }

  function parseChartText(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    const m = trimmed.match(/=\s*(\{[\s\S]*\})\s*;\s*\}\)\(/);
    if (!m) throw new Error('Not a chart file');
    return JSON.parse(m[1]);
  }

  const api = { EditorDoc, normalize, snap, baseType, exOf, typeName, parseChartText, LONG };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KiyoameEditorModel = api;
})(typeof window === 'object' ? window : globalThis);

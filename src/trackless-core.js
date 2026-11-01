(function (root) {
  'use strict';

  const CELLS = 24;
  const MIN_WIDTH = 1;
  const DEFAULTS = Object.freeze({
    perfect: 0.060, great: 0.100, good: 0.150,
    releaseTolerance: 0.060,
    chainGap: 0.300,
    dragWindow: 0.150,

    flowTolerance: 0.040,
    flowScrubFraction: 0.5,
    maxContacts: 2,
  });
  const WEIGHTS = Object.freeze({ PERFECT: 1, GREAT: 0.7, GOOD: 0.4, MISS: 0 });
  const TYPES = Object.freeze(['Tap', 'Hold', 'Slide', 'Drag', 'ExTap', 'ExHold', 'ExSlide', 'Flow', 'ExFlow']);
  const LAYERS = Object.freeze(['upper', 'lower']);

  const LAYER_HINT = Object.freeze({ Tap: 'lower', ExTap: 'lower', Hold: 'lower', ExHold: 'lower', ExSlide: 'upper', Slide: 'upper', Drag: 'upper' });
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const isInt = n => Number.isInteger(n);

  const isEx = n => n.type.length > 2 && n.type.startsWith('Ex');
  const baseOf = n => (isEx(n) ? n.type.slice(2) : n.type);

  function ticksOf(n) {
    const out = [];
    for (let i = 1; n.time + i * n.tick <= n.end + 1e-9; i++) out.push(n.time + i * n.tick);
    return out;
  }
  function slotCount(n) { const b = baseOf(n); return b === 'Hold' || b === 'Slide' ? 2 : b === 'Flow' ? 1 + ticksOf(n).length : 1; }
  const endOf = n => (n.end === undefined ? n.time : n.end);

  function validateChart(chart) {
    if (!chart || chart.version !== 'trackless-v1' || !chart.id || !Array.isArray(chart.notes) || !chart.notes.length) throw new Error('Invalid chart');
    if (chart.cells !== CELLS) throw new Error(`The field must be ${CELLS} cells wide`);
    if (!finite(chart.bpm) || chart.bpm <= 0 || !finite(chart.duration) || chart.duration <= 0) throw new Error('Invalid song timing');
    const ids = new Set(); let previous = -Infinity;
    for (const n of chart.notes) {
      if (!n.id || ids.has(n.id)) throw new Error('Note ID missing or duplicated');
      ids.add(n.id);
      if (!TYPES.includes(n.type)) throw new Error(`Unknown note type ${n.type}`);
      if (!LAYERS.includes(n.layer)) throw new Error(`${n.id}: layer must be upper or lower`);
      if (!finite(n.time) || n.time < previous || n.time < 0) throw new Error(`${n.id}: invalid time`);
      previous = n.time;
      const timed = baseOf(n) === 'Hold' || baseOf(n) === 'Slide' || baseOf(n) === 'Flow';
      if (timed && (!finite(n.end) || n.end <= n.time || n.end >= chart.duration)) throw new Error(`${n.id}: invalid end time`);
      if (!timed && n.end !== undefined) throw new Error(`${n.id}: ${n.type} cannot have an end`);
      if (!isInt(n.x) || !isInt(n.width)) throw new Error(`${n.id}: position and width must be whole cells`);
      if (n.width < MIN_WIDTH) throw new Error(`${n.id}: width must be at least ${MIN_WIDTH} cell (minimum key)`);
      if (n.x < 0 || n.x + n.width > CELLS) throw new Error(`${n.id}: range is outside the field`);
      if (baseOf(n) === 'Flow') {
        if (n.mode !== 'hold' && n.mode !== 'scrub') throw new Error(`${n.id}: Flow mode must be hold or scrub`);
        if (!finite(n.tick) || n.tick < 0.05 || n.tick > 1) throw new Error(`${n.id}: Flow tick must be between 0.05 and 1 s`);
        if (n.end - n.time < n.tick - 1e-9) throw new Error(`${n.id}: Flow needs at least one tick`);
      } else if (n.mode !== undefined || n.tick !== undefined) throw new Error(`${n.id}: only Flow notes have mode / tick`);
      if (baseOf(n) === 'Slide') {
        const path = n.path;
        if (!Array.isArray(path) || path.length < 2) throw new Error(`${n.id}: Slide needs at least two path points`);
        if (path[0].t !== n.time || path[path.length - 1].t !== n.end) throw new Error(`${n.id}: the path must run from time to end`);
        path.forEach((p, i) => {
          if (!isInt(p.x) || !isInt(p.width) || p.width < MIN_WIDTH || p.x < 0 || p.x + p.width > CELLS) throw new Error(`${n.id}: invalid path point range`);
          if (i && p.t <= path[i - 1].t) throw new Error(`${n.id}: path times must increase`);
        });
        if (path[0].x !== n.x || path[0].width !== n.width) throw new Error(`${n.id}: the path must start at the note's x / width`);
      }

    }

    const byId = new Map(chart.notes.map(n => [n.id, n]));
    for (const n of chart.notes) {
      if (n.link === undefined) continue;
      const o = byId.get(n.link);
      if (!o || o === n) throw new Error(`${n.id}: linked note ${n.link} does not exist`);
      if (o.link !== n.id) throw new Error(`${n.id}: links must point both ways (${o.id} does not link back to ${n.id})`);
      if (Math.abs(o.time - n.time) > 1e-6) throw new Error(`${n.id}: linked notes must be at the same time`);
      if (o.layer === n.layer) throw new Error(`${n.id}: linked notes must be one upper and one lower`);
      if (!(o.x < n.x + n.width && n.x < o.x + o.width)) throw new Error(`${n.id}: only notes whose ranges overlap can be linked`);
    }
    return chart;
  }

  function peakContacts(chart) {
    const ev = [];
    for (const n of chart.notes) {
      if (n.type === 'Drag') continue;
      const long = baseOf(n) === 'Hold' || baseOf(n) === 'Slide' || baseOf(n) === 'Flow';
      const a = long ? n.time : n.time - 0.05;
      const b = long ? n.end : n.time + 0.05;
      ev.push([a, 1], [b, -1]);
    }
    ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    let cur = 0, peak = 0;
    for (const [, d] of ev) { cur += d; peak = Math.max(peak, cur); }
    return peak;
  }

  function strokeOf(n, p) {
    if (baseOf(n) === 'Flow' && n.mode === 'scrub') return { t0: n.time - p.good, t1: n.end, l: n.x, r: n.x + n.width };
    if (baseOf(n) === 'Slide') {
      const xs = n.path.flatMap(q => [q.x, q.x + q.width]);
      return { t0: n.time - p.good, t1: n.end, l: Math.min(...xs), r: Math.max(...xs) };
    }
    return null;
  }
  function smears(a, b, params) {
    const p = Object.assign({}, DEFAULTS, params || {});

    if (a.type === 'Drag') {
      if (a === b || b.type === 'Drag') return false;
      const dt = Math.abs(a.time - b.time);
      return dt > p.perfect + 1e-9 && dt <= p.good + 1e-9 && b.x < a.x + a.width && a.x < b.x + b.width;
    }
    const s = strokeOf(a, p);
    if (!s || a === b || b.type === 'Drag') return false;
    const headStart = b.time - p.good, headEnd = b.time + p.good;
    if (headEnd < s.t0 || headStart > s.t1) return false;
    return b.x < s.r && s.l < b.x + b.width;
  }

  function lint(chart, params) {
    const p = Object.assign({}, DEFAULTS, params || {});
    const warnings = [];
    const peak = peakContacts(chart);
    if (peak > p.maxContacts) warnings.push(`needs ${peak} contacts at once, over the limit of ${p.maxContacts}`);
    for (const a of chart.notes) {
      if (!strokeOf(a, p) && a.type !== 'Drag') continue;
      for (const b of chart.notes) if (smears(a, b, p)) warnings.push(`${a.id} (${a.type}) may brush ${b.id} (${b.type}): their windows and ranges overlap`);
    }
    for (const n of chart.notes) {
      const hint = LAYER_HINT[n.type];
      if (hint && hint !== n.layer && baseOf(n) === 'Slide') warnings.push(`${n.id}: ${n.type} belongs on the ${hint} layer`);
    }
    return { peakContacts: peak, warnings };
  }

  function rangeAt(n, t) {
    if (baseOf(n) !== 'Slide') return { x: n.x, width: n.width };
    const path = n.path;
    if (t <= path[0].t) return { x: path[0].x, width: path[0].width };
    for (let i = 1; i < path.length; i++) {
      if (t <= path[i].t) {
        const a = path[i - 1], b = path[i], k = (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, width: a.width + (b.width - a.width) * k };
      }
    }
    const last = path[path.length - 1];
    return { x: last.x, width: last.width };
  }
  const inside = (r, x) => x >= r.x && x < r.x + r.width;

  function gradeFor(absDt, p) {
    if (absDt <= p.perfect + 1e-9) return 'PERFECT';
    if (absDt <= p.great + 1e-9) return 'GREAT';
    if (absDt <= p.good + 1e-9) return 'GOOD';
    return 'MISS';
  }

  class Judge {
    constructor(chart, params) {
      validateChart(chart);
      this.p = Object.assign({}, DEFAULTS, params || {});
      const p = this.p;
      if (![p.perfect, p.great, p.good, p.releaseTolerance].every(n => finite(n) && n > 0) || p.perfect > p.great || p.great > p.good) throw new Error('Invalid judgement windows');
      this.chart = chart;
      this.notes = chart.notes.map(n => Object.assign({}, n, { head: null, tail: null, broken: false }));
      this.contacts = new Map();
      this.results = [];
      this.time = -Infinity;
      this.combo = 0; this.maxCombo = 0; this.weight = 0;
      this.counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
      this.slots = this.notes.reduce((s, n) => s + slotCount(n), 0);
      this.byId = new Map(this.notes.map(n => [n.id, n]));
      this.flows = this.notes.filter(n => baseOf(n) === 'Flow');
      for (const n of this.flows) { n.tickTimes = ticksOf(n); n.nextTick = 0; n.pres = []; n.moves = []; n.tickRes = []; }
      this.rows = 5; this.rowTop = null; this.rowBottom = 1;
      this.protectWindows();
      this.onResult = null;
    }

    get accuracy() { return this.slots ? this.weight / this.slots : 0; }

    record(n, part, grade, dt, reason) {
      if (n[part] !== null) return;
      n[part] = grade;
      const r = { noteId: n.id, type: n.type, layer: n.layer, part, grade, dt: dt === undefined ? null : dt, reason: reason || '', time: this.time };
      this.results.push(r);
      this.counts[grade]++; this.weight += WEIGHTS[grade];
      this.combo = grade === 'MISS' ? 0 : this.combo + 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.onResult) this.onResult(r, n);
    }

    anyInside(r) { for (const c of this.contacts.values()) if (inside(r, c.x)) return true; return false; }

    down(id, x, t, y) {
      this.advance(t);
      const p = this.p;
      if (this.contacts.has(id)) return;
      this.contacts.set(id, { x, y, last: { x, t }, trail: [{ x, t }] });

      this.sweep(id, x, t, x, t, y, y);
    }

    protectWindows() {
      const p = this.p;
      const heads = this.notes.filter(n => n.type !== 'Drag');
      for (const n of heads) { n.early = p.good; n.late = p.good; }
      const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width;
      for (let i = 0; i < heads.length; i++) {
        const n = heads[i];
        for (let k = i - 1; k >= 0; k--) {
          const m = heads[k], gap = n.time - m.time;
          if (gap >= p.chainGap - 1e-9) break;
          if (gap < 1e-9 || !overlaps(n, m)) continue;
          n.early = Math.min(n.early, gap / 2); m.late = Math.min(m.late, gap / 2);
          break;
        }
      }
    }

    sweep(id, x0, t0, x1, t1, y0, y1) {
      const p = this.p, c = this.contacts.get(id);
      let claimed = false;

      if (x1 !== x0) {
        const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
        for (const n of this.flows) {
          if (n.mode !== 'scrub' || t1 < n.time - 0.1 || t1 > n.end + 0.1) continue;
          const len = Math.min(hi, n.x + n.width) - Math.max(lo, n.x);
          if (len > 0) n.moves.push([t1, len]);
        }
      }

      for (const n of this.notes) {
        if (n.type !== 'Drag' || n.head !== null) continue;
        if (n.time - p.dragWindow > t1 + 1e-9) break;
        const lo = Math.max(t0, n.time - p.dragWindow), hi = Math.min(t1, n.time + p.dragWindow);
        if (hi < lo - 1e-9) continue;
        let a = lo, b = hi;
        if (Math.abs(x1 - x0) < 1e-9 || t1 - t0 < 1e-9) { if (!(x1 >= n.x && x1 < n.x + n.width)) continue; }
        else {
          const at = x => t0 + (x - x0) / (x1 - x0) * (t1 - t0), ta = at(n.x), tb = at(n.x + n.width);
          a = Math.max(a, Math.min(ta, tb)); b = Math.min(b, Math.max(ta, tb));
          if (b < a - 1e-9) continue;
        }
        this.record(n, 'head', 'PERFECT', a - n.time);
        claimed = true;
      }

      if (!c) return claimed;
      const R = this.rows, rt = this.rowTop, hasY = R > 1 && rt !== null && rt !== undefined && y0 !== undefined && y1 !== undefined;
      const rowH = hasY ? ((this.rowBottom === undefined ? 1 : this.rowBottom) - rt) / R : 1;
      const rowOf = y => Math.max(0, Math.min(R - 1, Math.floor((y - rt) / rowH + 1e-9)));
      const dx = x1 - x0, cuts = [0, 1];
      if (dx !== 0) for (let k = Math.floor(Math.min(x0, x1)) + 1; k <= Math.floor(Math.max(x0, x1)); k++) { const sp = (k - x0) / dx; if (sp > 0 && sp < 1) cuts.push(sp); }
      if (hasY && y1 !== y0) for (let k = 0; k <= R; k++) { const sp = (rt + k * rowH - y0) / (y1 - y0); if (sp > 0 && sp < 1) cuts.push(sp); }
      cuts.sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const s0 = cuts[i], s1 = cuts[i + 1], mid = (s0 + s1) / 2;
        const col = Math.floor(x0 + dx * mid + 1e-9), row = hasY ? rowOf(y0 + (y1 - y0) * mid) : 0, key = col + ',' + row;
        const ta = t0 + (t1 - t0) * s0, tb = t0 + (t1 - t0) * s1;
        if (c.cell !== key) { c.cell = key; c.cellClaimed = false; }
        if (c.cellClaimed) continue;
        let best = null, bestA = Infinity;
        for (const n of this.notes) {
          if (n.head !== null || n.type === 'Drag') continue;
          if (n.time - n.early > tb + 1e-9) break;
          if (!(col >= n.x && col < n.x + n.width)) continue;
          const a = Math.max(ta, n.time - n.early), b = Math.min(tb, n.time + n.late);
          if (b < a - 1e-9) continue;
          if (a < bestA) { bestA = a; best = n; }
        }
        if (best) { this.claim(best, id, bestA - best.time); c.cellClaimed = true; claimed = true; }
      }
      return claimed;
    }
    claim(n, id, dt) {

      this.record(n, 'head', isEx(n) ? 'PERFECT' : gradeFor(Math.abs(dt), this.p), dt);
      if (baseOf(n) === 'Tap') n.tail = n.head; else n.pointer = id;
    }

    move(id, x, t, y) {
      this.advance(t, id);
      const c = this.contacts.get(id);
      if (!c) return;
      const last = c.last || { x: c.x, t };
      this.sweep(id, last.x, last.t, x, t, c.y, y !== undefined ? y : c.y);
      c.x = x; if (y !== undefined) c.y = y;
      c.last = { x, t }; c.trail.push({ x, t });
      while (c.trail.length > 1 && t - c.trail[0].t > 1) c.trail.shift();
    }

    up(id, t) { this.advance(t); this.contacts.delete(id); }

    advance(now, skipId) {
      if (!finite(now) || now < this.time - 1e-7) throw new Error('Judgement time must not go backwards');
      const prev = Number.isFinite(this.time) ? this.time : now;
      this.time = Math.max(now, this.time);
      const p = this.p;

      for (const [id, c] of this.contacts) {
        if (id === skipId) continue;
        const last = c.last || { x: c.x, t: prev };
        if (now > last.t) { this.sweep(id, c.x, last.t, c.x, now, c.y, c.y); c.last = { x: c.x, t: now }; }
      }

      for (const n of this.flows) {
        if (n.mode !== 'hold' || now <= prev || now < n.time - 0.1 || prev > n.end + 0.1) continue;
        if (this.anyInside({ x: n.x, width: n.width })) {
          const last = n.pres[n.pres.length - 1];
          if (last && prev <= last[1] + 1e-9) last[1] = now; else n.pres.push([prev, now]);
        }
      }
      for (const n of this.flows) this.evalTicks(n, now);
      for (const n of this.notes) {
        if (n.time - p.good > now) break;
        if (n.type === 'Drag') {
          if (n.head === null && now > n.time + p.dragWindow + 1e-7) this.record(n, 'head', 'MISS', null, 'miss');
          continue;
        }
        if (n.head === null && now > n.time + n.late + 1e-7) {
          this.record(n, 'head', 'MISS', null, 'miss');
          if (baseOf(n) === 'Tap') n.tail = 'MISS';
        }

        if ((baseOf(n) !== 'Hold' && baseOf(n) !== 'Slide') || n.tail !== null) continue;
        if (now > prev) {
          const at = Math.min(now, n.end);
          if (at > n.time - 0.05 && this.anyInside(rangeAt(n, at))) n.lastIn = at;
        }
        if (now >= n.end) {
          const ok = n.lastIn !== undefined && n.lastIn >= n.end - p.releaseTolerance * (isEx(n) ? 2 : 1) - 1e-9;
          this.record(n, 'tail', ok ? 'PERFECT' : 'MISS', null, ok ? '' : 'lost');
        }
      }
    }

    evalTicks(n, now) {
      const p = this.p, ex = isEx(n), tol = p.flowTolerance * (ex ? 2 : 1);
      while (n.nextTick < n.tickTimes.length && now >= n.tickTimes[n.nextTick] + tol - 1e-9) {
        const i = n.nextTick++, ti = n.tickTimes[i];
        let ok;
        if (n.mode === 'hold') ok = n.pres.some(([a, b]) => b >= ti - tol - 1e-9 && a <= ti + tol + 1e-9);
        else {
          const need = Math.max(1, p.flowScrubFraction * n.width * (ex ? 0.5 : 1));
          ok = n.moves.reduce((sum, [t, len]) => (t > ti - n.tick - 1e-9 && t <= ti + tol + 1e-9 ? sum + len : sum), 0) >= need - 1e-9;
        }
        n.tickRes[i] = ok ? 'PERFECT' : 'MISS';
        n['tick' + i] = null;
        this.record(n, 'tick' + i, ok ? 'PERFECT' : 'MISS', null, ok ? '' : 'lost');
      }
    }

    finish() {
      const last = this.chart.duration + 1;
      this.advance(Math.max(this.time, last));
      return this.summary();
    }

    summary() {
      return { counts: Object.assign({}, this.counts), accuracy: this.accuracy, score: Math.round(1e6 * this.accuracy), maxCombo: this.maxCombo, slots: this.slots, judged: this.results.length };
    }
  }

  function autoplayEvents(chart, offset) {
    const ev = [];
    let pid = 0;
    const off = n => (offset ? offset(n) : 0);
    for (const n of chart.notes) {
      const id = `a${pid++}`, t0 = n.time + off(n);
      if (baseOf(n) === 'Tap') { ev.push({ k: 'down', id, x: n.x + n.width / 2, t: t0 }, { k: 'up', id, t: t0 + 0.03 }); }
      else if (baseOf(n) === 'Flow') {
        ev.push({ k: 'down', id, x: n.x + n.width / 2, t: t0 });
        if (n.mode === 'scrub') {

          const cx = n.x + n.width / 2, amp = 0.4 * n.width;
          for (let t = n.time + 0.02, k = 0; t <= n.end + 1e-9; t += 0.02, k++) ev.push({ k: 'move', id, x: cx + amp * Math.sin(k * Math.PI / 3), t });
        }
        ev.push({ k: 'up', id, t: n.end + 0.01 });
      }
      else if (baseOf(n) === 'Hold') { ev.push({ k: 'down', id, x: n.x + n.width / 2, t: t0 }, { k: 'up', id, t: n.end + 0.01 }); }
      else if (baseOf(n) === 'Slide') {
        ev.push({ k: 'down', id, x: n.path[0].x + n.path[0].width / 2, t: t0 });
        for (let i = 1; i < n.path.length; i++) {
          const a = n.path[i - 1], b = n.path[i], steps = Math.max(1, Math.ceil((b.t - a.t) / 0.02));
          for (let s = 1; s <= steps; s++) {
            const k = s / steps, r = { x: a.x + (b.x - a.x) * k, width: a.width + (b.width - a.width) * k };
            ev.push({ k: 'move', id, x: r.x + r.width / 2, t: a.t + (b.t - a.t) * k });
          }
        }
        ev.push({ k: 'up', id, t: n.end + 0.01 });
      } else if (n.type === 'Drag') {
        ev.push({ k: 'down', id, x: n.x + n.width / 2, t: t0 }, { k: 'up', id, t: t0 + 0.03 });
      }
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  function play(judge, events) {
    for (const e of events) {
      if (e.k === 'down') judge.down(e.id, e.x, e.t);
      else if (e.k === 'move') judge.move(e.id, e.x, e.t);
      else judge.up(e.id, e.t);
    }
    return judge.finish();
  }

  const api = { ticksOf, smears, isEx, baseOf, CELLS, MIN_WIDTH, DEFAULTS, WEIGHTS, TYPES, LAYERS, LAYER_HINT, slotCount, validateChart, peakContacts, lint, rangeAt, gradeFor, Judge, autoplayEvents, play };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KiyoameTrackless = api;
})(typeof window === 'object' ? window : globalThis);

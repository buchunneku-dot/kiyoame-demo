(function () {
  'use strict';
  const T = window.KiyoameTrackless, Proj = window.KiyoameProjection;
  const $ = id => document.getElementById(id);
  const canvas = $('c'), g = canvas.getContext('2d');

  const COL = { drag: '#ffd54a', upper: '#6fd3cd', lower: '#f293ba', accent: '#ffc46b', rest: '#9b8cff', ink: '#e8ecf6', muted: '#8d97b5', miss: '#ff6b6b' };
  const RGB = { upper: '111,211,205', lower: '242,147,186' };
  const DEEP = { upper: '38,150,160', lower: '206,86,138' };
  const TRACK_INK = '#2a2f52', TRACK_MUTED = '#6a7196';
  const GRADE_COL = { PERFECT: TRACK_INK, GREAT: '#d98a2b', GOOD: TRACK_MUTED, MISS: '#d9536a' };

  const FONT = 'Montserrat,system-ui,sans-serif';
  const spaced = px => { if ('letterSpacing' in g) g.letterSpacing = px; };

  const SPEED_MIN = 1.0, SPEED_MAX = 12.0, SPEED_DEFAULT = 5.0, SPEED_KEY = 'kiyoame.trackless.speed';

  const speeds = { upper: SPEED_DEFAULT, lower: SPEED_DEFAULT };
  let projSync = false;
  const approachOf = speed => 5 / speed;
  try {
    const u = Number(localStorage.getItem(SPEED_KEY)), l = Number(localStorage.getItem(SPEED_KEY + '.lower'));
    if (u >= SPEED_MIN && u <= SPEED_MAX) speeds.upper = u;
    speeds.lower = l >= SPEED_MIN && l <= SPEED_MAX ? l : speeds.upper;
    projSync = localStorage.getItem(SPEED_KEY + '.proj') === '1';
  } catch (e) {}

  function mapperFor(layer, Lo, now) {
    const L = Lo[layer], COS_FOLD = Math.cos(FOLD * Math.PI / 180);
    const al = approachOf(speeds.lower), au = approachOf(speeds.upper);
    if (!projSync) {
      const ap = layer === 'upper' ? au : al;
      return { d: t => (t - now) / ap, reach: ap * L.dMax, approach: ap };
    }
    if (layer === 'lower') return { d: t => (t - now) / al, reach: al * L.dMax, approach: al };
    return { d: t => (t - now) / al / COS_FOLD, reach: al * COS_FOLD * L.dMax, approach: al * COS_FOLD };
  }

  const GRID_KEY = 'kiyoame.trackless.grid';
  let gridMode = 'lane';
  try { const v = localStorage.getItem(GRID_KEY); if (v === 'all' || v === 'lane' || v === 'off') gridMode = v; } catch (e) {}

  const BACKDROP_KEY = 'kiyoame.trackless.backdrop';
  let backdropMode = 'on';
  try { if (localStorage.getItem(BACKDROP_KEY) === 'off') backdropMode = 'off'; } catch (e) {}
  const backdrop = window.KiyoameBackdrop ? window.KiyoameBackdrop.create() : null;
  const backdropOn = () => backdrop && backdropMode !== 'off';
  const FOLD = 40, LAYOUT = { cameraDeg: 26, lowerRatio: 0.58, topY: 0 };
  const D_MAX = { upper: 1, lower: 4 };

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize); resize();

  function layout() {

    const span = Math.max(1, (W - 32) * 0.8 * 8 / (W * 0.86));
    const field = Proj.dualLayerLayout(W, H, span, FOLD, Object.assign({}, LAYOUT, { judgeBottom: nearHalf() }));
    const upper = Object.assign({}, field.forLayer('upper'), { dMax: D_MAX.upper }), lower = Object.assign({}, field.forLayer('lower'), { dMax: D_MAX.lower });
    return { upper, lower, judgeY: field.judgeY, slot: field.slot };
  }
  const uOf = cell => cell / 3 + 0.25;
  const cellOfX = (x, L) => ((x - W / 2) / L.slot + 4) * 3;

  let ctx = null, master = null, startAt = 0, judge = null, chart = null, events = null, evIdx = 0, running = false;
  const flashes = [], pops = [];
  let lastGrade = null, lastGradeAt = 0;
  const outLatency = () => Math.max(0, Math.min(0.3, (ctx && (ctx.outputLatency || ctx.baseLatency)) || 0));
  const songTime = () => (ctx ? ctx.currentTime - outLatency() - startAt : 0);
  const JUDGE_LAG = 0.05;

  const Song = window.KiyoameSong;
  const CHART_KEY = 'kiyoame.chart';
  let chartName = 'standard';
  try { if (Song.charts.includes(localStorage.getItem(CHART_KEY))) chartName = localStorage.getItem(CHART_KEY); } catch (e) {}
  const goButtons = () => [...document.querySelectorAll('.go'), $('again')];
  let starting = false, lastClock = 0, lastClockAt = 0;
  async function startRun() {
    if (starting) return;
    starting = true;
    const status = $('start-status');
    status.textContent = 'Starting audio…';
    for (const b of goButtons()) b.disabled = true;
    try {

      if (ctx) ctx.close().catch(() => {});
      master = null;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const ready = window.KiyoameTracklessAudio.unlock(ctx);

      await ready;
      if (document.hidden || H > W) throw new Error('Keep the page in front and in landscape, then press Start.');
    if (Song.prepare) await Song.prepare(ctx);
    chart = Song.buildChart(chartName);
    const lint = T.lint(chart);
    if (lint.warnings.length) console.warn('chart lint', lint.warnings);
    judge = new T.Judge(chart);
    const byId = new Map(chart.notes.map(n => [n.id, n]));
    judge.onResult = (r) => {
      const n = byId.get(r.noteId);
      lastGrade = r; lastGradeAt = performance.now();
      if (r.grade !== 'MISS' && n) {
        if (r.part === 'head') { Song.hitSound(ctx, master, n.x + n.width / 2, n.layer, ctx.currentTime); flashes.push({ n, at: performance.now(), grade: r.grade }); }
      }
    };
    if (!master) { master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination); }

    const from = Number(new URLSearchParams(location.search).get('from')) || 0;
    startAt = ctx.currentTime + 0.4 - from;
    if (!from) Song.scheduleBacking(ctx, master, startAt);
    events = $('auto').checked ? T.autoplayEvents(chart) : null; evIdx = 0;
    flashes.length = 0; pops.length = 0; lastGrade = null;
    lastClock = ctx.currentTime; lastClockAt = performance.now();
    running = true;
    down.clear(); status.textContent = '';
    showPanel(null);
    } catch (error) {
      running = false;
      if (ctx) ctx.close().catch(() => {});
      ctx = null; master = null;
      status.textContent = error.message || 'Could not start. Press Start again.';
      showPanel('home');
      console.error('Trackless start failed', error);
    } finally {
      starting = false;
      for (const b of goButtons()) b.disabled = false;
    }
  }

  function finishRun() {
    running = false;
    const s = judge.finish();
    $('r-score').textContent = String(s.score).padStart(7, '0');
    $('r-acc').textContent = `Accuracy ${(s.accuracy * 100).toFixed(2)}% · Max combo ${s.maxCombo}`;
    const byLayer = { upper: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 }, lower: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 } };
    for (const r of judge.results) byLayer[r.layer][r.grade]++;
    const row = (name, c) => `<tr><td>${name}</td><td>PERFECT ${c.PERFECT} · GREAT ${c.GREAT} · GOOD ${c.GOOD} · MISS ${c.MISS}</td></tr>`;
    $('r-table').innerHTML = row('Lower', byLayer.lower) + row('Upper', byLayer.upper) + row('Total', s.counts);
    showPanel('result');
    if (ctx) ctx.suspend();
  }

  const down = new Map();

  const EDGE = 18, PALM = 70;

  const TOUCH_KEY = 'kiyoame.trackless.touch';
  let touchZone = 'half';
  try { const v = localStorage.getItem(TOUCH_KEY); if (v === 'near' || v === 'half' || v === 'full') touchZone = v; } catch (e) {}

  const nearHalf = () => (Math.max(96, Math.min(140, H * 0.17)) + 0.10 * H) / 2;
  const touchBounds = L => window.KiyoameTracklessTouch.bounds(touchZone, H, L.judgeY, nearHalf());
  const touchTop = L => touchBounds(L).top;
  const touchBottom = L => touchBounds(L).bottom;
  function accepts(e) {
    if (e.clientX < EDGE || e.clientX > W - EDGE || e.clientY < touchTop(layout()) || e.clientY > touchBottom(layout())) return false;
    if (e.pointerType === 'touch' && Math.max(e.width || 0, e.height || 0) > PALM) return false;
    return true;
  }
  function feed(kind, e) {
    if (!running || events) return;
    const age = Math.max(0, Math.min(JUDGE_LAG, (performance.now() - e.timeStamp) / 1000));
    const L = layout(), cell = cellOfX(e.clientX, L), t = Math.max(judge.time, songTime() - age);
    const area = touchBounds(L);
    judge.rows = area.rows; judge.rowTop = area.top / H; judge.rowBottom = area.bottom / H;
    const yy = e.clientY / H;
    if (kind === 'down') { if (!accepts(e)) return; down.set(e.pointerId, true); judge.down(e.pointerId, cell, t, yy); }
    else if (kind === 'move' && down.has(e.pointerId)) judge.move(e.pointerId, cell, t, yy);
    else if (kind === 'up' && down.has(e.pointerId)) { down.delete(e.pointerId); judge.up(e.pointerId, t); }
  }
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (err) {} feed('down', e); });
  canvas.addEventListener('pointermove', e => { e.preventDefault(); for (const m of (e.getCoalescedEvents && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e])) feed('move', m); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, e => feed('up', e));
  addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });

  const clampD = (L, d) => Math.max(L.dMin, Math.min(L.dMax, d));
  function quad(L, u0, u1, d0, d1, style, alpha) {
    d0 = clampD(L, d0); d1 = clampD(L, d1);
    if (d1 <= d0) return false;
    const a = L.P(u0, d0), b = L.P(u1, d0), c = L.P(u1, d1), e = L.P(u0, d1);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(e.x, e.y); g.closePath();
    if (style) { g.globalAlpha = alpha === undefined ? 1 : alpha; g.fillStyle = style; g.fill(); g.globalAlpha = 1; }
    return true;
  }
  const planeOf = (Lo, n) => Lo[n.layer];

  const TRACK = {
    upper: { fill: [[0, 'rgba(255,255,255,0)'], [0.18, 'rgba(255,255,255,0.35)'], [0.55, 'rgba(252,253,255,0.78)'], [1, 'rgba(255,255,255,0.9)']], railFrom: 0.05, railTo: 0.35 },
    lower: { fill: [[0, 'rgba(214,219,236,0)'], [0.6, 'rgba(214,219,236,0.22)'], [1, 'rgba(214,219,236,0.32)']], railFrom: 0.35, railTo: 0.75 },
    line: '72,82,124',
  };

  function fadeIn(L, rgb, a, from, to) {
    const k = g.createLinearGradient(0, L.yAt(L.dMax), 0, L.judgeY);
    k.addColorStop(0, `rgba(${rgb},0)`); k.addColorStop(from, `rgba(${rgb},0)`); k.addColorStop(to, `rgba(${rgb},${a})`); k.addColorStop(1, `rgba(${rgb},${a})`);
    return k;
  }
  function seg(L, u, d0, d1) { const a = L.P(u, d0), b = L.P(u, d1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  function drawField(Lo) {
    const U = Lo.upper;

    {
      const fl = U.P(0.25, U.dMax), nl = U.P(0.25, 0), fr = U.P(8.25, U.dMax), nr = U.P(8.25, 0);
      const at = (f, n, y) => f.x + (n.x - f.x) * (y - f.y) / ((n.y - f.y) || 1);
      const band = g.createLinearGradient(0, nl.y, 0, H);
      band.addColorStop(0, 'rgba(255,255,255,0.6)'); band.addColorStop(1, 'rgba(255,255,255,0.18)');
      g.fillStyle = band; g.beginPath(); g.moveTo(nl.x, nl.y); g.lineTo(nr.x, nr.y); g.lineTo(at(fr, nr, H), H); g.lineTo(at(fl, nl, H), H); g.closePath(); g.fill();
    }
    const contacts = judge ? [...judge.contacts.values()] : [];
    for (const layer of ['upper', 'lower']) {
      const L = Lo[layer], T = TRACK[layer], far = layer === 'lower';
      const fill = g.createLinearGradient(0, L.yAt(L.dMax), 0, L.judgeY);
      for (const [o, c] of T.fill) fill.addColorStop(o, c);
      quad(L, 0.25, 8.25, 0, L.dMax, fill);

      if (!far) {
        const top = L.dAbove(90), glow = g.createLinearGradient(0, L.yAt(top), 0, L.judgeY);
        glow.addColorStop(0, 'rgba(255,255,255,0)'); glow.addColorStop(1, 'rgba(255,255,255,0.55)');
        quad(L, 0.25, 8.25, 0, top, glow);
      }

      g.lineWidth = 1;
      if (gridMode !== 'off') {
        for (let cell = 1; cell < 24; cell++) {
          const lane = cell % 3 === 0;
          if (!lane && (gridMode !== 'all' || far)) continue;
          g.strokeStyle = fadeIn(L, TRACK.line, far ? 0.05 : lane ? 0.08 : 0.03, T.railFrom, T.railTo);
          seg(L, uOf(cell), 0, L.dMax);
        }
      }

      if (!far) for (const c of contacts) {
        for (let cell = Math.ceil(c.x - 4); cell <= Math.floor(c.x + 4); cell++) {
          if (cell <= 0 || cell >= 24) continue;
          const k = 1 - Math.abs(cell - c.x) / 4;
          const grad = g.createLinearGradient(0, L.yAt(0.6), 0, L.judgeY);
          grad.addColorStop(0, `rgba(${RGB.upper},0)`); grad.addColorStop(1, `rgba(${RGB.upper},${(0.5 * k).toFixed(3)})`);
          g.strokeStyle = grad; seg(L, uOf(cell), 0, 0.6);
        }
      }

      g.save();
      g.shadowColor = `rgba(${RGB[layer]},0.7)`; g.shadowBlur = 8;
      g.lineWidth = 1; g.strokeStyle = fadeIn(L, RGB[layer], far ? 0.6 : 0.95, T.railFrom, T.railTo);
      seg(L, 0.25, 0, L.dMax); seg(L, 8.25, 0, L.dMax);
      g.restore();
    }
  }

  function drawNotes(Lo, now) {
    const maps = { upper: mapperFor('upper', Lo, now), lower: mapperFor('lower', Lo, now) };
    const dOfL = (layer, t) => maps[layer].d(t);

    const byId = judge.byId || (judge.byId = new Map(judge.notes.map(n => [n.id, n])));
    for (const n of judge.notes) {
      if (!n.link || n.id > n.link) continue;
      const o = byId.get(n.link), d = dOfL(n.layer, n.time), dB = o && dOfL(o.layer, o.time);
      if (!o || (n.head !== null && o.head !== null)) continue;
      const La = planeOf(Lo, n), Lb = planeOf(Lo, o);
      if (d > La.dMax || dB > Lb.dMax || d < La.dMin || dB < Lb.dMin) continue;
      const pa = La.P(uOf(n.x + n.width / 2), d), pb = Lb.P(uOf(o.x + o.width / 2), dB), sc = Math.max(0.5, La.scale(d));
      g.strokeStyle = COL.drag; g.lineWidth = 3 * sc; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
      g.fillStyle = COL.drag; for (const p of [pa, pb]) { g.beginPath(); g.arc(p.x, p.y, 4 * sc, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    for (const n of judge.notes) {
      const end = n.end === undefined ? n.time : n.end;
      const L = planeOf(Lo, n), dOf = t => dOfL(n.layer, t);
      if (n.time > now + maps[n.layer].reach || end < now - 0.4) continue;
      const missed = n.head === 'MISS';
      const holding = m => now >= m.time - 0.05 && judge.anyInside(T.rangeAt(m, Math.min(now, m.end)));
      const base = T.baseOf(n), ex = T.isEx(n);
      if ((base === 'Tap' || n.type === 'Drag') && n.head !== null && !missed) continue;

      const fade = n.layer === 'lower' ? Math.max(0, Math.min(1, (D_MAX.lower - dOf(n.time)) / 1.2)) : 1;
      const alpha = (missed ? 0.25 : 1) * fade;
      const skin = window.KiyoameTracklessNotes;
      if (n.type === 'Drag') {
        skin.drag(g, L, n.x, n.width, dOf(n.time), alpha);
        continue;
      }
      if (base === 'Tap') {
        window.KiyoameTracklessTap.draw(g, L, n.x, n.width, dOf(n.time), n.layer, alpha, ex);
        continue;
      }
      if (base !== 'Hold' && base !== 'Slide' && base !== 'Flow') continue;

      if (base !== 'Flow' && n.tail !== null) continue;
      const started = now >= n.time, active = started && holding(n), broken = started && !active;
      const t0 = Math.max(n.time, started ? now : n.time), t1 = Math.min(n.end, now + maps[n.layer].reach);
      if (t1 >= t0) {
        const samples = [];
        const step = base === 'Slide' ? 0.04 : Math.max(0.04, t1 - t0);
        for (let t = t0; ; t += step) {
          const tt = Math.min(t, t1), range = T.rangeAt(n, tt);
          samples.push({ x: range.x, width: range.width, d: dOf(tt), time: tt });
          if (tt >= t1) break;
        }
        skin.ribbon(g, L, samples, n.layer, alpha, base, active, broken, t1 >= n.end - 1e-8);
      }

      const current = started ? T.rangeAt(n, Math.min(now, n.end)) : n;
      if (now <= n.end) skin.head(g, L, current.x, current.width, started ? 0 : dOf(n.time),
        n.layer, alpha * (broken ? 0.4 : 1), ex, base === 'Flow' && n.mode === 'scrub' ? 'scrub' : base);
    }
  }

  const hash = (str, k) => { let h = 2166136261 ^ k; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000; };
  function drawJudge(Lo, perf) {
    const y = Lo.judgeY, x0 = W / 2 - 4 * Lo.slot, x1 = W / 2 + 4 * Lo.slot;

    let perfect = 0;
    for (const f of flashes) if (f.grade === 'PERFECT') perfect = Math.max(perfect, 1 - (perf - f.at) / 260);
    const lineGrad = (rgb, a) => { const k = g.createLinearGradient(x0, 0, x1, 0); k.addColorStop(0, `rgba(${rgb},0)`); k.addColorStop(0.12, `rgba(${rgb},${a})`); k.addColorStop(0.88, `rgba(${rgb},${a})`); k.addColorStop(1, `rgba(${rgb},0)`); return k; };
    g.save();
    if (perfect > 0) { g.shadowColor = `rgba(255,200,100,${perfect})`; g.shadowBlur = 18; g.fillStyle = lineGrad('255,214,140', perfect * 0.9); g.fillRect(x0, y - 3, x1 - x0, 6); }
    g.shadowColor = 'rgba(90,98,170,0.5)'; g.shadowBlur = 8;
    g.fillStyle = lineGrad('62,70,138', 1); g.fillRect(x0, y - 1, x1 - x0, 2);
    g.restore();

    const ease = p => 1 - (1 - p) * (1 - p);
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], age = perf - f.at;
      if (age > 260) { flashes.splice(i, 1); continue; }
      const p = age / 260, k = 1 - p, rgb = RGB[f.n.layer], L = Lo[f.n.layer];
      const cx = W / 2 + ((f.n.x + f.n.width / 2) / 3 - 4) * Lo.slot, w = f.n.width / 3 * Lo.slot;

      const deep = DEEP[f.n.layer], gold = f.grade === 'PERFECT' ? '255,214,140' : rgb;

      const top = L.dAbove(60 + 70 * ease(p)), yt = L.yAt(top);
      let col = g.createLinearGradient(0, yt, 0, y);
      col.addColorStop(0, `rgba(${rgb},0)`); col.addColorStop(1, `rgba(${rgb},${(0.7 * k).toFixed(3)})`);
      quad(L, uOf(f.n.x), uOf(f.n.x + f.n.width), 0, top, col);

      const inset = f.n.width * 0.2, top2 = L.dAbove(35 + 45 * ease(p));
      col = g.createLinearGradient(0, L.yAt(top2), 0, y);
      col.addColorStop(0, `rgba(${rgb},0)`); col.addColorStop(1, `rgba(${rgb},${(0.45 * k * k).toFixed(3)})`);
      quad(L, uOf(f.n.x + inset), uOf(f.n.x + f.n.width - inset), 0, top2, col);

      const half = w * (0.6 + 0.5 * ease(p)) + 24;
      const streak = (a, rgbS) => { const k2 = g.createLinearGradient(cx - half, 0, cx + half, 0); k2.addColorStop(0, `rgba(${rgbS},0)`); k2.addColorStop(0.5, `rgba(${rgbS},${a})`); k2.addColorStop(1, `rgba(${rgbS},0)`); return k2; };
      g.save(); g.beginPath(); g.rect(x0, y - 10, x1 - x0, 20); g.clip();
      g.fillStyle = streak((0.5 * k).toFixed(3), rgb); g.fillRect(cx - half, y - 4, half * 2, 8);
      g.fillStyle = streak((0.95 * k).toFixed(3), deep); g.fillRect(cx - half, y - 1, half * 2, 2);
      g.restore();

      if (p < 0.5) {
        const q = 1 - p / 0.5, r = (w * 0.3 + 12) * (0.8 + 0.4 * p);
        g.save(); g.translate(cx, y); g.scale(1, 0.4);
        const core = g.createRadialGradient(0, 0, 0, 0, 0, r);
        core.addColorStop(0, `rgba(255,255,255,${(0.95 * q).toFixed(3)})`); core.addColorStop(0.25, `rgba(${gold},${(0.85 * q).toFixed(3)})`); core.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = core; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
      }

      const id = String(f.n.id || f.n.time);
      g.save(); g.shadowColor = `rgba(${rgb},0.9)`; g.shadowBlur = 5;

      const star = (px, py, len, wid) => {
        g.beginPath();
        g.moveTo(px - len, py); g.lineTo(px, py - wid); g.lineTo(px + len, py); g.lineTo(px, py + wid); g.closePath();
        g.moveTo(px, py - len); g.lineTo(px + wid, py); g.lineTo(px, py + len); g.lineTo(px - wid, py); g.closePath();
        g.fill();
      };
      for (let j = 0; j < 4; j++) {
        const h1 = hash(id, j), h2 = hash(id, j + 7), h3 = hash(id, j + 13);
        const px = cx + (h1 - 0.5) * (w + 16) * (0.6 + 0.6 * ease(p)), py = y - (8 + 30 * h2) * ease(p);
        const tw = Math.sin(Math.min(1, p * 1.3) * Math.PI), len = (3 + 4 * h3) * tw;
        if (len < 0.4) continue;
        g.fillStyle = `rgba(${deep},${(0.85 * tw).toFixed(3)})`;
        star(px, py, len, Math.max(0.7, len * 0.18));
      }
      g.restore();
    }

    const contacts = judge ? [...judge.contacts.values()] : [];
    for (const c of contacts) {
      const x = W / 2 + (c.x / 3 - 4) * Lo.slot;
      g.strokeStyle = 'rgba(70,78,130,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y + 18, 16, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
    }

    if (touchZone !== 'full') {
      const area = touchBounds(Lo), top = area.top, bot = area.bottom;

      if (gridMode === 'all') { g.fillStyle = 'rgba(42,47,82,0.12)'; g.fillRect(EDGE, top, W - 2 * EDGE, 1); if (bot < H) g.fillRect(EDGE, bot - 1, W - 2 * EDGE, 1); }

      if (gridMode === 'all') { g.fillStyle = 'rgba(42,47,82,0.06)'; for (let k = 1; k < area.rows; k++) g.fillRect(EDGE, top + (bot - top) * k / area.rows, W - 2 * EDGE, 1); }
    }
  }

  function drawHud(perf) {
    const done = judge.notes.reduce((s, n) => s + (n.head !== null ? 1 : 0), 0), judged = judge.results.length;
    const score = Math.round(1e6 * judge.weight / Math.max(1, judge.slots));
    const ink = backdropOn() ? TRACK_INK : COL.ink, muted = backdropOn() ? TRACK_MUTED : COL.muted;
    g.fillStyle = ink; g.textAlign = 'right'; g.font = `300 24px ${FONT}`; spaced('3px');
    g.fillText(String(score).padStart(7, '0'), W - 16, 36);
    g.fillStyle = muted; g.font = `400 11px ${FONT}`; spaced('2px');
    g.fillText(judged ? `${(judge.weight / judged * 100).toFixed(2)}%` : '', W - 16, 54);
    g.textAlign = 'left'; g.fillText(`${done} / ${judge.notes.length}`, 16, 36);
    spaced('0px');
    if (judge.combo > 1) {
      g.textAlign = 'center'; g.fillStyle = 'rgba(42,47,82,0.28)'; g.font = `200 46px ${FONT}`; spaced('4px');
      g.fillText(String(judge.combo), W / 2, H * 0.44);
      g.fillStyle = 'rgba(42,47,82,0.4)'; g.font = `500 10px ${FONT}`; spaced('5px');
      g.fillText('COMBO', W / 2, H * 0.44 + 18); spaced('0px');
    }
    if (lastGrade && perf - lastGradeAt < 500) {
      g.globalAlpha = 1 - (perf - lastGradeAt) / 500;
      g.fillStyle = GRADE_COL[lastGrade.grade]; g.textAlign = 'center'; g.font = `500 14px ${FONT}`; spaced('4px');
      g.fillText(lastGrade.grade + (lastGrade.reason === 'lost' ? ' · released' : ''), W / 2, H * 0.44 + 46); spaced('0px'); g.globalAlpha = 1;
    }
  }

  function pauseRun(message) { if (running) { running = false; down.clear(); if (ctx) ctx.suspend().catch(() => {}); if (message) { $('start-status').textContent = message; showPanel('home'); } else showPanel('home'); } }
  function frame() {
    requestAnimationFrame(frame);
    const portrait = H > W;
    if ($('rotate').hidden === !portrait) {} else $('rotate').hidden = !portrait;
    if (portrait) pauseRun();
    const perf = performance.now();
    const Lo = layout();
    if (backdropOn()) backdrop.draw(g, W, H, DPR);
    else {
      g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, W, H);
      const bg = g.createLinearGradient(0, H * 0.4, 0, H); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(120,90,255,0.12)');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
    }
    drawField(Lo);
    if (!running || !judge) return;
    if (ctx.currentTime > lastClock) { lastClock = ctx.currentTime; lastClockAt = perf; }
    if (ctx.state !== 'running' || perf - lastClockAt > 1500) {
      pauseRun('Audio was interrupted. Press Start to play again.'); return;
    }
    const now = songTime();
    if (events) {
      while (evIdx < events.length && events[evIdx].t <= now) {
        const e = events[evIdx++];
        if (e.k === 'down') judge.down(e.id, e.x, e.t); else if (e.k === 'move') judge.move(e.id, e.x, e.t); else judge.up(e.id, e.t);
      }
    }
    judge.advance(Math.max(now - JUDGE_LAG, judge.time));
    drawNotes(Lo, now);
    drawJudge(Lo, perf);
    drawHud(perf);
    if (now > chart.duration) finishRun();
  }
  requestAnimationFrame(frame);

  function showPanel(name) { for (const id of ['home', 'settings', 'result']) $(id).hidden = id !== name; }
  $('to-settings').addEventListener('click', () => showPanel('settings'));
  $('settings-back').addEventListener('click', () => showPanel('home'));
  $('result-home').addEventListener('click', () => showPanel('home'));
  {
    const info = Song.buildChart(chartName);
    $('song-title').textContent = info.title;
    $('song-meta').textContent = `${info.bpm} BPM`;
    const pick = name => {
      chartName = name;
      try { localStorage.setItem(CHART_KEY, name); } catch (e) {}
      for (const b of document.querySelectorAll('#chart-pick button')) b.setAttribute('aria-pressed', String(b.dataset.chart === name));
    };
    for (const b of document.querySelectorAll('#chart-pick button')) b.addEventListener('click', () => pick(b.dataset.chart));
    pick(chartName);
  }
  for (const b of document.querySelectorAll('.go')) b.addEventListener('click', startRun);
  $('again').addEventListener('click', startRun);
  if (new URLSearchParams(location.search).get('auto') === '1') $('auto').checked = true;

  const clampSpeed = v => Math.round(Math.max(SPEED_MIN, Math.min(SPEED_MAX, Number(v) || SPEED_DEFAULT)) * 10) / 10;
  function refreshSpeedUi() {
    for (const layer of ['upper', 'lower']) {
      const el = $('speed-' + layer), out = $('speed-' + layer + '-out');
      el.value = speeds[layer];
      out.textContent = projSync && layer === 'upper' ? '= lower' : speeds[layer].toFixed(1);
    }
    $('speed-upper').disabled = $('speed-upper-down').disabled = $('speed-upper-up').disabled = projSync;
    $('proj-sync').checked = projSync;
  }
  function setSpeed(layer, v) {
    speeds[layer] = clampSpeed(v);
    try { localStorage.setItem(layer === 'upper' ? SPEED_KEY : SPEED_KEY + '.lower', String(speeds[layer])); } catch (e) {}
    refreshSpeedUi();
  }
  function setProjSync(on) {
    projSync = !!on;
    try { localStorage.setItem(SPEED_KEY + '.proj', projSync ? '1' : '0'); } catch (e) {}
    refreshSpeedUi();
  }
  for (const layer of ['upper', 'lower']) {
    $('speed-' + layer).addEventListener('input', () => setSpeed(layer, $('speed-' + layer).value));
    $('speed-' + layer + '-down').addEventListener('click', () => setSpeed(layer, speeds[layer] - 0.1));
    $('speed-' + layer + '-up').addEventListener('click', () => setSpeed(layer, speeds[layer] + 0.1));
  }
  $('touch-zone').value = touchZone;
  $('touch-zone').addEventListener('change', () => {
    touchZone = $('touch-zone').value;
    try { localStorage.setItem(TOUCH_KEY, touchZone); } catch (e) {}
  });
  $('backdrop').value = backdropMode;
  $('backdrop').addEventListener('change', () => {
    backdropMode = $('backdrop').value;
    try { localStorage.setItem(BACKDROP_KEY, backdropMode); } catch (e) {}
  });
  $('grid-mode').value = gridMode;
  $('grid-mode').addEventListener('change', () => {
    gridMode = $('grid-mode').value;
    try { localStorage.setItem(GRID_KEY, gridMode); } catch (e) {}
  });
  $('proj-sync').addEventListener('change', () => setProjSync($('proj-sync').checked));
  addEventListener('resize', refreshSpeedUi);
  refreshSpeedUi();
  window.KiyoameTracklessGame = { get judge() { return judge; }, get speeds() { return speeds; }, get projSync() { return projSync; }, mapperFor: layer => mapperFor(layer, layout(), 0), setSpeed, setProjSync, start: startRun };
})();

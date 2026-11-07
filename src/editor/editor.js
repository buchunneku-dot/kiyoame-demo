(function () {
  'use strict';

  const T = window.KiyoameTrackless, Song = window.KiyoameSong, M = window.KiyoameEditorModel, V = window.KiyoameEditorView;
  const $ = id => document.getElementById(id);
  const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GAME_PAGE = (document.querySelector('meta[name="kiyoame-game"]') || {}).content || 'index.html';
  const DRAFT_KEY = 'kiyoame.editor.draft', TEST_KEY = 'kiyoame.editorChart';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  const view = new V.EditorView($('view'));
  let doc = null, songId = Song.songs[0], tool = 'Tap', selected = new Set(), clipboard = [];
  let report = { errors: [], warnings: [], peakContacts: 0, autoplayScore: null, ok: false };
  let playhead = 0, drag = null, ghost = null, box = null, dirty = true;

  const snapDiv = () => Number($('snap').value);
  const offset = () => (Number($('offset').value) || 0) / 1000;
  const snapT = t => M.snap(t, doc.chart.bpm, offset(), snapDiv());
  const step = () => (snapDiv() ? 60 / doc.chart.bpm * 4 / snapDiv() : 0.001);

  function toast(text) {
    const el = $('toast'); el.textContent = text; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function setDoc(next, song) {
    stop();
    doc = next; songId = song; selected.clear();
    Song.select(songId); $('song').value = songId;
    doc.onChange = changed;
    playhead = 0; view.scroll = -0.5;
    changed(true);
  }

  function changed(skipDraft) {
    report = doc.check();
    if (skipDraft !== true) store.set(DRAFT_KEY, { song: songId, chart: doc.toJSON() });
    for (const id of [...selected]) if (!doc.byId(id)) selected.delete(id);
    renderMeta(); renderProps(); renderIssues();
    dirty = true;
  }

  function loadPreset() {
    const song = $('song').value, name = $('chart').value;
    if (name === 'blank') {
      const info = Song.info(song);
      setDoc(M.EditorDoc.blank({ id: `${song}-custom`, title: info.title, bpm: info.bpm, duration: info.duration }), song);
    } else setDoc(new M.EditorDoc(Song.buildChart(name, song)), song);
    toast(`Loaded ${doc.chart.id}`);
  }

  function renderMeta() {
    const c = doc.chart;
    $('meta-id').value = c.id; $('meta-title').value = c.title || ''; $('meta-bpm').value = c.bpm; $('meta-duration').value = c.duration;
  }

  const field = (label, html) => `<span>${label}</span>${html}`;
  const num = (key, v, stepV, min, max) => `<input type="number" data-key="${key}" value="${v}" step="${stepV}"${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}>`;

  function renderProps() {
    const el = $('props');
    if (!selected.size) { el.innerHTML = '<p class="muted">Nothing selected. Click a note, or drag on empty space with the Select tool to box-select.</p>'; return; }
    if (selected.size > 1) {
      el.innerHTML = `<p class="muted">${selected.size} notes selected.</p><div class="row" style="margin-top:6px"><button type="button" data-act="ex">Toggle Ex</button><button type="button" data-act="link">Link</button><button type="button" data-act="delete">Delete</button></div>`;
      return;
    }
    const n = doc.byId([...selected][0]), base = M.baseType(n.type), ex = M.exOf(n.type);
    let html = '<div class="props">';
    html += field('ID', `<input type="text" value="${escapeHtml(n.id)}" disabled>`);
    html += field('Type', `<select data-key="base">${['Tap', 'Hold', 'Slide', 'Flow', 'Drag'].map(t => `<option${t === base ? ' selected' : ''}>${t}</option>`).join('')}</select>`);
    if (base !== 'Drag') html += field('Ex', `<input type="checkbox" data-key="ex"${ex ? ' checked' : ''} style="width:auto">`);
    html += field('Layer', `<select data-key="layer"><option value="upper"${n.layer === 'upper' ? ' selected' : ''}>Upper</option><option value="lower"${n.layer === 'lower' ? ' selected' : ''}>Lower</option></select>`);
    html += field('Time', num('time', n.time, 0.001, 0));
    if (n.end !== undefined) html += field('End', num('end', n.end, 0.001, 0));
    html += field('X', num('x', n.x, 1, 0, 23)) + field('Width', num('width', n.width, 1, 1, 24));
    if (n.path) { const e = n.path[n.path.length - 1]; html += field('End X', num('endX', e.x, 1, 0, 23)) + field('End width', num('endWidth', e.width, 1, 1, 24)); }
    if (base === 'Flow') {
      html += field('Mode', `<select data-key="mode"><option value="hold"${n.mode === 'hold' ? ' selected' : ''}>Hold</option><option value="scrub"${n.mode === 'scrub' ? ' selected' : ''}>Scrub</option></select>`);
      html += field('Tick', num('tick', n.tick, 0.01, 0.05, 1));
    }
    html += field('Link', n.link !== undefined ? `<div class="row"><span>${escapeHtml(n.link)}</span><button type="button" data-act="unlink">Unlink</button></div>` : '<span class="muted">none</span>');
    html += '</div><div class="row" style="margin-top:8px"><button type="button" data-act="delete">Delete</button></div>';
    el.innerHTML = html;
  }

  function onPropChange(e) {
    const key = e.target.dataset.key;
    if (!key || selected.size !== 1) return;
    const id = [...selected][0], n = doc.byId(id), v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (key === 'base') doc.update(id, { type: M.typeName(v, M.exOf(n.type)) });
    else if (key === 'ex') doc.update(id, { type: M.typeName(M.baseType(n.type), v) });
    else if (key === 'layer' || key === 'mode') doc.update(id, { [key]: v });
    else if (key === 'endX') doc.setSlideEnd(id, Number(v));
    else if (key === 'endWidth') doc.setSlideEnd(id, n.path[n.path.length - 1].x, Number(v));
    else if (Number.isFinite(Number(v))) doc.update(id, { [key]: Number(v) });
    else renderProps();
  }

  function renderIssues() {
    const r = report, list = [...r.errors, ...r.warnings];
    const score = r.autoplayScore === null ? '<span class="bad">blocked by errors</span>' : `<span class="${r.autoplayScore === 1000000 ? 'ok' : 'bad'}">${r.autoplayScore.toLocaleString('en-US')}</span>`;
    $('summary').innerHTML = `<b>${doc.notes.length}</b> notes · peak contacts <b class="${r.peakContacts > T.DEFAULTS.maxContacts ? 'bad' : ''}">${r.peakContacts}</b><br>`
      + `${r.errors.length ? `<span class="bad">${r.errors.length} error${r.errors.length > 1 ? 's' : ''}</span>` : '<span class="ok">Valid</span>'} · ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}<br>Auto play ${score}`;
    $('issues').innerHTML = list.map((w, i) => `<button type="button" class="issue ${w.level}" data-issue="${i}">${escapeHtml(w.message)}</button>`).join('');
  }

  function focusIssue(i) {
    const w = [...report.errors, ...report.warnings][i];
    if (!w || !w.noteIds.length) return;
    selected = new Set(w.noteIds.filter(id => doc.byId(id)));
    const first = doc.byId(w.noteIds[0]);
    if (first) { playhead = first.time; view.reveal(first.time); }
    renderProps(); dirty = true;
  }

  function setTool(t) {
    tool = t;
    for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === t);
  }

  function newNote(p, t0, t1, c0, c1) {
    const base = tool, ex = $('ex').checked, w = Math.max(1, Math.min(24, Number($('def-width').value) || 3));
    const n = { type: M.typeName(base, ex), layer: p.layer, time: t0 };
    const a = Math.floor(c0), b = Math.floor(c1);
    if (base === 'Slide') {
      n.x = Math.max(0, Math.min(24 - w, a - Math.floor(w / 2))); n.width = w;
      n.end = Math.max(t1, t0 + step());
      const ex2 = Math.max(0, Math.min(24 - w, b - Math.floor(w / 2)));
      n.path = [{ t: t0, x: n.x, width: w }, { t: n.end, x: ex2, width: w }];
    } else {
      if (a === b) { n.x = Math.max(0, Math.min(24 - w, a - Math.floor(w / 2))); n.width = w; } else { n.x = Math.min(a, b); n.width = Math.abs(b - a) + 1; }
      if (M.LONG.has(base)) n.end = Math.max(t1, t0 + (base === 'Flow' ? 0.25 : step()));
      if (base === 'Flow') { n.mode = 'hold'; n.tick = 0.25; }
    }
    return n;
  }

  const canvas = $('view');
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, p = view.at(x, y);
    canvas.setPointerCapture(e.pointerId);
    if (p.ruler) { playhead = Math.max(0, p.t); if (playing) restart(); drag = { kind: 'playhead' }; dirty = true; return; }
    const h = view.hit(doc.notes, x, y);
    if (e.button === 2) { if (h) { doc.remove([h.id]); selected.delete(h.id); } return; }
    if (h) {
      if (e.shiftKey) { if (selected.has(h.id)) selected.delete(h.id); else selected.add(h.id); }
      else if (!selected.has(h.id) || h.part !== 'body') selected = new Set([h.id]);
      renderProps();
      const n = doc.byId(h.id);
      drag = { kind: h.part, id: h.id, x0: x, y0: y, t0: p.t, c0: p.cell, base: doc.toJSON().notes, applied: false, nTime: n.time };
      dirty = true; return;
    }
    if (!p.layer) return;
    if (tool === 'select') { if (!e.shiftKey) selected.clear(); box = { x0: x, y0: y, x1: x, y1: y }; drag = { kind: 'box' }; renderProps(); dirty = true; return; }
    const t0 = snapT(p.t);
    drag = { kind: 'place', p, t0, c0: p.cell };
    ghost = newNote(p, t0, t0, p.cell, p.cell);
    dirty = true;
  });

  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, p = view.at(x, y);
    if (drag.kind === 'playhead') { playhead = Math.max(0, p.t); dirty = true; return; }
    if (drag.kind === 'box') { box.x1 = x; box.y1 = y; dirty = true; return; }
    if (drag.kind === 'place') { ghost = newNote(drag.p, drag.t0, snapT(p.t), drag.c0, p.cell === null ? drag.c0 : p.cell); dirty = true; return; }
    const n = doc.byId(drag.id);
    if (!n) return;
    if (drag.kind === 'end') { const end = snapT(p.t); if (end !== n.end) doc.update(n.id, { end }); return; }
    if (drag.kind === 'slideEnd') {
      const end = snapT(p.t), last = n.path[n.path.length - 1];
      const ex = p.cell === null ? last.x : Math.max(0, Math.min(24 - last.width, Math.floor(p.cell) - Math.floor(last.width / 2)));
      if (end !== n.end || ex !== last.x) { const path = n.path.map(q => Object.assign({}, q)); path[path.length - 1].x = ex; doc.update(n.id, { end, path }); }
      return;
    }
    if (Math.abs(x - drag.x0) < 3 && Math.abs(y - drag.y0) < 3 && !drag.applied) return;
    const targetT = snapT(drag.nTime + (p.t - drag.t0)), dc = p.cell === null ? 0 : Math.round(p.cell - drag.c0);
    const dt = targetT - n.time, dx = dc - (drag.dx || 0);
    if (Math.abs(dt) > 1e-6 || dx) { doc.move([...selected], dt, dx); drag.dx = dc; drag.applied = true; }
  });

  const endDrag = () => {
    if (drag && drag.kind === 'place' && ghost) {
      const id = doc.add(ghost);
      selected = new Set([id]); renderProps();
      playTick(ghost);
    }
    if (drag && drag.kind === 'box' && box) {
      const [ta, tb] = [view.tOf(Math.max(box.y0, box.y1)), view.tOf(Math.min(box.y0, box.y1))];
      for (const n of doc.notes) {
        if (n.time < ta || n.time > tb) continue;
        const left = view.xOf(n.layer, n.x), right = view.xOf(n.layer, n.x + n.width);
        if (right >= Math.min(box.x0, box.x1) && left <= Math.max(box.x0, box.x1)) selected.add(n.id);
      }
      renderProps();
    }
    drag = null; ghost = null; box = null; dirty = true;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) view.zoomAt(e.clientY - r.top, Math.exp(-e.deltaY * 0.002));
    else view.scroll = Math.max(-2, Math.min(doc.chart.duration, view.scroll - e.deltaY / view.pps));
    dirty = true;
  }, { passive: false });

  function selectedNotes() { return doc.notes.filter(n => selected.has(n.id)); }

  function act(name) {
    const ids = [...selected];
    if (name === 'delete') { doc.remove(ids); selected.clear(); renderProps(); }
    else if (name === 'unlink' && ids.length === 1) doc.unlink(ids[0]);
    else if (name === 'link') { const msg = ids.length === 2 ? doc.link(ids[0], ids[1]) : 'Select one upper and one lower note'; if (msg) toast(msg); }
    else if (name === 'ex') {
      const any = selectedNotes().some(n => !M.exOf(n.type) && n.type !== 'Drag');
      doc.commit(() => { for (const n of selectedNotes()) if (n.type !== 'Drag') n.type = M.typeName(M.baseType(n.type), any); });
    }
  }

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea')) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doc.redo(); else doc.undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); doc.redo(); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); selected = new Set(doc.notes.map(n => n.id)); renderProps(); dirty = true; return; }
    if (mod && k.toLowerCase() === 'c') { clipboard = JSON.parse(JSON.stringify(selectedNotes())); toast(`Copied ${clipboard.length}`); return; }
    if (mod && k.toLowerCase() === 'v') { const ids = doc.paste(clipboard, snapT(playhead)); selected = new Set(ids); renderProps(); return; }
    if (mod) return;
    const tools = { v: 'select', escape: 'select', 1: 'Tap', 2: 'Hold', 3: 'Slide', 4: 'Flow', 5: 'Drag' };
    if (tools[k.toLowerCase()]) { setTool(tools[k.toLowerCase()]); if (k === 'Escape') { selected.clear(); renderProps(); dirty = true; } return; }
    if (k === ' ') { e.preventDefault(); toggle(); return; }
    if (k === 'Delete' || k === 'Backspace') { act('delete'); return; }
    if (k.toLowerCase() === 'e') { if (selected.size) act('ex'); else $('ex').checked = !$('ex').checked; return; }
    if (k.toLowerCase() === 'l') { act('link'); return; }
    if (k.toLowerCase() === 'u') { for (const id of selected) doc.unlink(id); return; }
    if (k === 'Home') { playhead = 0; view.reveal(0); dirty = true; return; }
    const nudge = { ArrowUp: [step(), 0], ArrowDown: [-step(), 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (nudge && selected.size) { e.preventDefault(); doc.move([...selected], nudge[0], nudge[1]); }
  });

  let ctx = null, out = null, source = null, playing = false, ctxStart = 0, headStart = 0, scheduledTo = 0;
  const rate = () => Number($('rate').value) || 1;
  const latency = () => Math.max(0, Math.min(window.KiyoameJudgementConfig.input.maxOutputLatency, (ctx && (ctx.outputLatency || ctx.baseLatency)) || 0));
  const now = () => (playing ? headStart + (ctx.currentTime - ctxStart - latency()) * rate() : playhead);

  async function ensureAudio() {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); out = ctx.createGain(); out.gain.value = 0.7; out.connect(ctx.destination); }
    if (ctx.state === 'suspended') await ctx.resume();
    Song.select(songId);
    return Song.prepare(ctx);
  }

  async function start() {
    let buffer;
    try { buffer = await ensureAudio(); } catch (err) { toast('Song audio could not be loaded'); return; }
    source = ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate(); source.connect(out);
    ctxStart = ctx.currentTime + 0.05; headStart = playhead; scheduledTo = playhead;
    if (playhead < buffer.duration) source.start(ctxStart, Math.max(0, playhead));
    playing = true; $('play').textContent = 'Pause';
  }
  function stop() {
    if (!playing) return;
    playhead = now();
    try { source.stop(); } catch (e) {}
    source = null; playing = false; $('play').textContent = 'Play';
  }
  function restart() { stop(); start(); }
  function toggle() { if (playing) stop(); else start(); }

  function playTick(n) {
    if (!ctx || !$('ticks').checked) return;
    Song.hitSound(ctx, out, n.x + n.width / 2, n.layer, ctx.currentTime);
  }

  function scheduleTicks() {
    if (!playing || !$('ticks').checked) return;
    const t = now(), until = t + 0.25;
    for (const n of doc.notes) {
      if (n.time < scheduledTo || n.time >= until) continue;
      const when = ctxStart + (n.time - headStart) / rate();
      if (when >= ctx.currentTime - 0.01) Song.hitSound(ctx, out, n.x + n.width / 2, n.layer, Math.max(ctx.currentTime, when));
    }
    scheduledTo = Math.max(scheduledTo, until);
  }

  function frame() {
    if (playing) {
      const t = now();
      playhead = t;
      scheduleTicks();
      const [a, b] = view.visible();
      if (t > b - (b - a) * 0.35) view.scroll = t - (b - a) * 0.4;
      if (t > doc.chart.duration) stop();
      dirty = true;
    }
    if (dirty) {
      const errored = new Set(report.errors.flatMap(w => w.noteIds)), flagged = new Set(report.warnings.flatMap(w => w.noteIds));
      view.draw({ chart: doc.chart, selected, flagged, errored, ghost, box, playhead, division: snapDiv() || 4, offset: offset() });
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const globalName = id => 'KiyoameChart' + id.split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');

  $('load').addEventListener('click', loadPreset);
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const chart = M.parseChartText(await f.text());
      if (!chart || !Array.isArray(chart.notes)) throw new Error('No notes');
      const song = Song.songs.find(s => chart.id && chart.id.startsWith(s)) || $('song').value;
      setDoc(new M.EditorDoc(chart), song);
      toast(`Imported ${chart.id || f.name}`);
    } catch (err) { toast('This file is not a chart'); }
  });
  $('export-js').addEventListener('click', () => {
    if (!report.ok) toast('Exported with errors: fix them before using the chart');
    download(`chart-${doc.chart.id}.js`, doc.toScript(globalName(doc.chart.id)), 'text/javascript');
  });
  $('export-json').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(doc.toJSON(), null, 1)); toast('Chart JSON copied'); } catch (e) { toast('Clipboard not available'); }
  });
  $('play').addEventListener('click', toggle);
  $('rate').addEventListener('change', () => { if (playing) restart(); });
  $('test').addEventListener('click', () => {
    if (!report.ok) { toast('Fix the errors first'); return; }
    const from = Math.max(0, playhead - 2);
    if (!store.set(TEST_KEY, { song: songId, chart: doc.toJSON(), from })) { toast('Browser storage is not available'); return; }
    window.open(`${GAME_PAGE}?chart=editor`, '_blank');
  });
  $('tools').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.tool); });
  $('props').addEventListener('change', onPropChange);
  $('props').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
  $('issues').addEventListener('click', e => { const b = e.target.closest('[data-issue]'); if (b) focusIssue(Number(b.dataset.issue)); });
  for (const id of ['snap', 'offset']) $(id).addEventListener('change', () => { dirty = true; });
  $('meta-id').addEventListener('change', e => { const v = e.target.value.trim(); if (/^[A-Za-z0-9_-]+$/.test(v)) { doc.chart.id = v; changed(); } else renderMeta(); });
  $('meta-title').addEventListener('change', e => { doc.chart.title = e.target.value; changed(); });
  $('meta-bpm').addEventListener('change', e => { const v = Number(e.target.value); if (v > 0) { doc.chart.bpm = v; changed(); } else renderMeta(); });
  $('meta-duration').addEventListener('change', e => { const v = Number(e.target.value); if (v > 0) { doc.chart.duration = v; changed(); } else renderMeta(); });
  $('song').addEventListener('change', () => { songId = $('song').value; Song.select(songId); stop(); });

  $('song').innerHTML = Song.songs.map(id => `<option value="${id}">${escapeHtml(Song.info(id).title)}</option>`).join('');
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });
  const resize = () => { view.resize(); dirty = true; };
  window.addEventListener('resize', resize);
  resize();
  setTool('Tap');
  const draft = store.get(DRAFT_KEY);
  if (draft && draft.chart && Array.isArray(draft.chart.notes) && Song.songs.includes(draft.song)) {
    try { setDoc(new M.EditorDoc(draft.chart), draft.song); toast('Restored your last draft'); } catch (e) { loadPreset(); }
  } else loadPreset();
  requestAnimationFrame(frame);
})();

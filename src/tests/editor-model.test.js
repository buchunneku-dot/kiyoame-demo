'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const M = require('../editor/editor-model.js');
const T = require('../trackless-core.js');

let checks = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const ok = (c, msg) => { assert.ok(c, msg); checks++; };

for (const f of ['chart-standard', 'chart-showcase', 'chart-ams-standard', 'chart-ams-showcase']) {
  require(path.join(__dirname, '..', 'song', f + '.js'));
}
const charts = ['KiyoameChartStandard', 'KiyoameChartShowcase', 'KiyoameChartAmsStandard', 'KiyoameChartAmsShowcase'].map(k => globalThis[k]);
for (const c of charts) {
  const doc = new M.EditorDoc(c);
  eq(JSON.stringify(doc.toJSON()), JSON.stringify(c), `${c.id}: loading and exporting changes nothing`);
  const back = M.parseChartText(doc.toScript('X'));
  eq(back, c, `${c.id}: the exported script parses back to the same chart`);
  const r = doc.check();
  ok(r.ok && r.autoplayScore === 1000000, `${c.id}: check passes and auto play scores 1,000,000`);
}

const blank = () => M.EditorDoc.blank({ id: 't', bpm: 120, duration: 20 });
{
  const d = blank();
  const a = d.add({ type: 'Tap', layer: 'lower', time: 2, x: 5, width: 3 });
  const b = d.add({ type: 'Tap', layer: 'upper', time: 1, x: 22, width: 4 });
  eq(d.notes.map(n => n.id), [b, a], 'notes stay sorted by time');
  eq([d.byId(b).x, d.byId(b).width], [20, 4], 'a range past the edge is pulled inside the field');
  ok(a !== b, 'new notes get unique IDs');
  const h = d.add({ type: 'Hold', layer: 'lower', time: 3, x: 0, width: 3 });
  eq(d.byId(h).end, 3.5, 'a long note without an end gets half a second');
  d.update(h, { time: 4 });
  eq([d.byId(h).time, d.byId(h).end], [4, 4.5], 'moving a long note keeps its length');
  d.update(h, { type: 'Tap' });
  ok(d.byId(h).end === undefined, 'changing a long note to a Tap removes its end');
  d.update(h, { type: 'Slide' });
  const s = d.byId(h);
  eq([s.path.length, s.path[0].t, s.path[1].t], [2, s.time, s.end], 'changing to a Slide builds a path from start to end');
  d.setSlideEnd(h, 10, 3);
  eq(d.byId(h).path[1].x, 10, 'the Slide end position can be set');
  d.update(h, { type: 'Flow' });
  eq([d.byId(h).mode, d.byId(h).tick, d.byId(h).path], ['hold', 0.25, undefined], 'changing to a Flow sets mode and tick and drops the path');
}
{
  const d = blank();
  const a = d.add({ type: 'Tap', layer: 'lower', time: 2, x: 0, width: 3 });
  d.move([a], 0.5, 30);
  eq([d.byId(a).time, d.byId(a).x], [2.5, 21], 'moving clamps to the field');
  d.move([a], -10, 0);
  eq(d.byId(a).time, 0, 'moving clamps to the song start');
}
{
  const d = blank();
  const u = d.add({ type: 'Tap', layer: 'upper', time: 2, x: 0, width: 3 });
  const l = d.add({ type: 'Tap', layer: 'lower', time: 2.02, x: 1, width: 3 });
  const same = d.add({ type: 'Tap', layer: 'upper', time: 2, x: 0, width: 3 });
  const far = d.add({ type: 'Tap', layer: 'lower', time: 2, x: 10, width: 3 });
  eq(d.link(u, same), 'Linked notes must be one upper and one lower', 'cannot link two notes on one layer');
  eq(d.link(u, far), 'Linked notes must overlap', 'cannot link notes that do not overlap');
  eq(d.link(u, l), '', 'an upper and an overlapping lower note link');
  eq([d.byId(l).time, d.byId(l).link, d.byId(u).link], [2, u, l], 'linking aligns times and points both ways');
  d.move([l], 0.5, 0);
  ok(d.byId(u).link === undefined && d.byId(l).link === undefined, 'moving one side apart in time unlinks the pair');
  d.link(u, l);
  d.remove([u]);
  ok(d.byId(l).link === undefined, 'deleting one side unlinks the other');
}
{
  const d = blank();
  d.add({ type: 'Tap', layer: 'lower', time: 2, x: 0, width: 3 });
  d.add({ type: 'Tap', layer: 'lower', time: 3, x: 0, width: 3 });
  eq(d.notes.length, 2, 'two notes added');
  d.undo();
  eq(d.notes.length, 1, 'undo removes the last edit');
  d.redo();
  eq(d.notes.length, 2, 'redo restores it');
  d.undo(); d.add({ type: 'Drag', layer: 'upper', time: 4, x: 0, width: 3 });
  ok(!d.redo(), 'a new edit clears redo');
}
{
  const d = blank();
  const u = d.add({ type: 'Tap', layer: 'upper', time: 2, x: 0, width: 3 });
  const l = d.add({ type: 'Tap', layer: 'lower', time: 2, x: 0, width: 3 });
  d.link(u, l);
  const ids = d.paste([d.byId(u), d.byId(l)], 6);
  eq(ids.length, 2, 'paste copies both notes');
  const a = d.byId(ids[0]), b = d.byId(ids[1]);
  eq([a.time, b.time, a.link, b.link], [6, 6, b.id, a.id], 'pasted pairs keep their link to each other');
  ok(d.byId(u).link === l, 'the original pair is unchanged');
}
{
  const d = blank();
  eq(d.check().ok, false, 'an empty chart is not valid');
  d.add({ type: 'Tap', layer: 'lower', time: 1, x: 0, width: 3 });
  d.add({ type: 'Tap', layer: 'upper', time: 1, x: 1, width: 3 });
  d.add({ type: 'Tap', layer: 'lower', time: 1, x: 10, width: 3 });
  const r = d.check();
  ok(r.ok && r.peakContacts === 3, 'three notes at once are valid but need three contacts');
  ok(r.warnings.some(w => /over the limit/.test(w.message)), 'the contact limit warning is reported');
  const pair = r.warnings.find(w => /link them/.test(w.message));
  eq(pair.noteIds.length, 2, 'the overlap warning names both notes');
  const bad = blank();
  bad.chart.notes.push({ id: 'z', type: 'Hold', layer: 'lower', time: 1, end: 0.5, x: 0, width: 3 });
  const e = bad.check();
  ok(!e.ok && e.errors[0].noteIds[0] === 'z' && e.autoplayScore === null, 'errors name the note and block auto play');
}
eq(M.snap(1.03, 120, 0, 16), 1, 'snap to sixteenths at 120 BPM');
eq(M.snap(1.07, 120, 0, 16), 1.125, 'snap rounds to the nearest line');
eq(M.snap(1.0, 120, 0.01, 4), 1.01, 'snap follows the grid offset');
eq(M.snap(1.2345, 120, 0, 0), 1.235, 'snap off rounds to a millisecond');
eq(M.typeName('Tap', true), 'ExTap', 'Ex type names');
eq(M.typeName('Drag', true), 'Drag', 'Drag has no Ex variant');
ok(T.TYPES.includes(M.typeName('Flow', true)), 'every Ex type name is a real type');

console.log(`PASS: ${checks} editor checks`);

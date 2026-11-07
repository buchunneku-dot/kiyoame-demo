'use strict';
const assert = require('node:assert/strict');
const T = require('../trackless-core.js');

const chart = notes => ({ version: 'trackless-v1', id: 't', bpm: 120, duration: 20, cells: 24, notes });
const tap = (id, time, x, width = 3, layer = 'lower') => ({ id, type: 'Tap', layer, time, x, width });
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++; };
const rejects = (c, re, msg) => { assert.throws(() => T.validateChart(c), re, msg); checks++; };

rejects(chart([tap('a', 1, 0, 0)]), /minimum key/, 'zero width is rejected (minimum key = 1 cell)');
rejects(chart([tap('a', 1, 0.5, 3)]), /whole cells/, 'position must be a whole cell');
rejects(chart([tap('a', 1, 22, 3)]), /outside the field/, 'range must stay inside the field');
rejects(chart([tap('a', 1, 0, 3), tap('a', 2, 0, 3)]), /duplicated/, 'IDs must be unique');
rejects(chart([tap('a', 2, 0, 3), tap('b', 1, 0, 3)]), /time/, 'times must not go backwards');
rejects(chart([{ id: 'x', type: 'strum', layer: 'lower', time: 1, x: 0, width: 3 }]), /Unknown note type/, 'old lowercase type names are rejected');
rejects(chart([{ id: 'x', type: 'Tap', layer: 'middle', time: 1, x: 0, width: 3 }]), /layer/, 'layer must be upper / lower');
rejects(chart([{ id: 's', type: 'Slide', layer: 'upper', time: 1, end: 2, x: 0, width: 3, path: [{ t: 1, x: 0, width: 3 }] }]), /two path points/, 'Slide needs two path points');
rejects(chart([{ id: 's', type: 'Swipe', layer: 'upper', time: 1, x: 0, width: 6, dir: 1 }]), /Unknown note type/, 'Swipe was removed and is rejected');
T.validateChart(chart([tap('a', 1, 0, 1), tap('b', 2, 23, 1)]));
checks++;

function run(notes, fn, params) {
  const j = new T.Judge(chart(notes), params);
  fn(j);
  return j.finish();
}
const grade = (dt, x = 1) => {
  const j = new T.Judge(chart([tap('a', 5, 0, 3)]));
  j.down('p', x, 5 + dt); j.up('p', 5 + dt + 0.02);
  return j.finish().counts;
};
eq(grade(0.04).PERFECT, 1, '±40 ms is PERFECT');
eq(grade(-0.04).PERFECT, 1, '40 ms early is PERFECT');
eq(grade(0.07).GREAT, 1, '±70 ms is GREAT');
eq(grade(-0.07).GREAT, 1, '70 ms early is GREAT');
eq(grade(0.1).GOOD, 1, 'up to 100 ms late is GOOD');
eq(grade(0.11).MISS, 1, 'beyond 100 ms late is MISS');
{
  const j = new T.Judge(chart([tap('a', 5, 0, 3)]));
  j.down('p', 1, 4.9); j.up('p', 4.92); j.down('q', 1, 5.0); j.up('q', 5.02);
  const r = j.finish().counts;
  eq(r.PERFECT, 1, 'no early GOOD or MISS: a touch 100 ms early is ignored and a later touch still takes the note');
}
{
  const j = new T.Judge(chart([tap('a', 5, 0, 3)]));
  j.down('p', 1, 4.9); j.up('p', 5.1);
  eq(j.finish().counts.MISS, 1, 'a finger resting since before the window opened does not take the note');
}
eq(grade(0, 5).MISS, 1, 'a press outside the range misses');
eq(grade(0, 2.99).PERFECT, 1, 'any position inside the range hits (no distance-from-centre scoring)');
eq(grade(0, 3).PERFECT, 1, 'a press one cell past the edge still hits (finger width)');
eq(grade(0, 4).MISS, 1, 'two cells past the edge misses');
{
  const j = new T.Judge(chart([tap('e', 1, 3, 3), tap('f', 1, 15, 3)]));
  j.down('p', 6, 1); j.down('q', 16, 1); j.up('p', 1.05); j.up('q', 1.05);
  eq(j.finish().counts.PERFECT, 2, 'chord: a finger landing on the edge of a note still takes it');
}
{
  const j = new T.Judge(chart([tap('l', 1, 3, 3), tap('r', 1, 7, 3)]));
  j.down('p', 6.5, 1); j.up('p', 1.05);
  const r = j.finish(); eq(r.counts.PERFECT + r.counts.MISS, 2, 'between two notes a press takes only one of them');
}
{
  const j = new T.Judge(chart([tap('l', 1, 3, 3), tap('r', 1.12, 7, 3)]));
  j.down('p', 6.5, 1.11); j.up('p', 1.15);
  eq(j.finish().counts.PERFECT, 1, 'a press in reach of two notes goes to the one it grades higher');
}
{
  const alone = new T.Judge(chart([tap('a', 1, 3, 3)]));
  alone.down('p', 6.2, 1); alone.up('p', 1.03);
  eq(alone.finish().counts.PERFECT, 1, 'control: one cell past the edge, nothing else around: the margin takes the note');
  const j = new T.Judge(chart([tap('a', 1, 3, 3), tap('u', 1.1, 6, 3)]));
  j.down('p', 6.2, 1); j.up('p', 1.03); j.finish();
  eq(j.results.find(r => r.noteId === 'a').grade, 'MISS', 'no margin when the finger is on a note coming up next: the neighbour is not taken');
}
{
  const j = new T.Judge(chart([tap('a', 5, 0, 3), tap('b', 5.05, 3, 3)]));
  j.down('p', 4, 5.04);
  const s = j.finish();
  eq(s.counts.PERFECT + s.counts.GREAT, 1, 'one press hits one note');
  eq(s.counts.MISS, 1, 'the other one is missed');
}

const hold = { id: 'h', type: 'Hold', layer: 'lower', time: 2, end: 4, x: 6, width: 3 };
const parts = j => Object.fromEntries(j.results.map(r => [r.noteId + '.' + r.part, r.grade]));
{
  eq(T.checkInterval(120), 0.25, '120 BPM: a checkpoint every eighth note');
  eq(T.checkInterval(100), 0.15, 'under 120 BPM: every sixteenth');
  eq(T.checkInterval(240), 0.25, '240 BPM and over: every beat');
  eq(T.checksOf(hold, 120).length, 7, 'a 2 s Hold at 120 BPM has 7 checkpoints (none on the end itself)');
  eq(T.checksOf({ ...hold, end: 2.2 }, 120).length, 1, 'a Hold shorter than one interval still has one checkpoint');
  const s = run([hold], j => { j.down('p', 7, 2); j.up('p', 4.01); });
  eq(s.counts.PERFECT, 8, 'held to the end: head and 7 checkpoints PERFECT');
  eq(s.slots, 8, 'Hold slots = head + checkpoints');
}
{
  const s = run([hold], j => { j.down('p', 7, 2); j.up('p', 3.01); });
  eq(s.counts.MISS, 3, 'let go at 3.01: the checkpoints at 3.25 and 3.5 are GOOD/MISS-graded by the gap, 3.75 and after are MISS');
  const x = run([hold], j => { j.down('p', 7, 2); j.up('p', 3.74); });
  eq(x.counts.PERFECT, 8, 'no release judgement: letting go just after the last checkpoint costs nothing');
}
{
  const g = gapMs => { const j = new T.Judge(chart([hold])); j.down('p', 7, 2); j.up('p', 2.5 - gapMs / 1000); j.down('p', 7, 2.6); j.up('p', 4.01); j.finish(); return parts(j)['h.check1']; };
  eq(g(30), 'PERFECT', 'checkpoint 50 ms window: let go 30 ms before it is still PERFECT');
  eq(g(80), 'GREAT', 'let go 80 ms before: GREAT');
  eq(g(130), 'GOOD', 'let go 130 ms before: GOOD');
  eq(g(200), 'MISS', 'let go 200 ms before: MISS');
  const t = run([hold], j => { j.down('p', 7, 2); j.move('p', 20, 2.5); j.move('p', 7, 2.53); j.up('p', 4.01); });
  eq(t.counts.MISS, 0, 'leaving the range briefly between checkpoints costs nothing');
}
{
  const s = run([hold], j => {});
  eq(s.counts.MISS, 8, 'not touched at all: head and every checkpoint MISS');
}
{
  const s = run([hold], j => { j.down('p', 7, 2); j.down('q', 8, 3); j.up('p', 3.0); j.up('q', 4.01); });
  eq(s.counts.PERFECT, 8, 'any finger inside a Hold keeps it held; switching or rubbing fingers does not break it');
  const late = new T.Judge(chart([hold])); late.down('p', 20, 1); late.move('p', 7, 3); late.up('p', 4.01); late.finish();
  const pl = parts(late);
  eq(pl['h.head'], 'MISS', 'joined late: head MISS');
  eq(pl['h.check3'] + pl['h.check4'] + pl['h.check6'], 'MISSPERFECTPERFECT', 'but the checkpoints after joining count: a missed head does not kill the body');
  const early = new T.Judge(chart([hold])); early.down('p', 7, 1.85); early.up('p', 4.01); early.finish();
  const pe = parts(early);
  eq(pe['h.head'], 'MISS', 'pressed 150 ms early and held: head MISS (taps keep their early rule)');
  eq(Object.values(pe).filter(g => g === 'PERFECT').length, 7, 'every checkpoint is PERFECT');
}

const slide = {
  id: 's', type: 'Slide', layer: 'upper', time: 2, end: 4, x: 0, width: 3,
  path: [{ t: 2, x: 0, width: 3 }, { t: 4, x: 18, width: 3 }],
};
{
  const s = T.play(new T.Judge(chart([slide])), T.autoplayEvents(chart([slide])));
  eq(s.counts.PERFECT, T.slotCount(slide, 120), 'following the path: head and every checkpoint PERFECT');
}
{
  const s = run([slide], j => { j.down('p', 1, 2); j.move('p', 1, 3); j.up('p', 4.01); });
  ok(s.counts.MISS >= 3, 'staying still off the path: the later checkpoints MISS');
  eq(T.rangeAt(slide, 3).x, 9, 'paths interpolate linearly in time');
}

rejects(chart([{ id: 'r', type: 'Rest', layer: 'upper', time: 2, end: 4 }, tap('a', 5, 0, 3)]), /Unknown note type/, 'Rest was removed and is rejected');
ok(!T.TYPES.includes('Rest'), 'Rest is not in the type list');

{
  const c = chart([tap('a', 1, 0, 3), { ...hold, time: 2, end: 2.5 }, tap('b', 5, 12, 3), { id: 'd', type: 'Drag', layer: 'upper', time: 6, x: 6, width: 8 }]);
  const s = T.play(new T.Judge(c), T.autoplayEvents(c));
  eq(s.counts.PERFECT, s.slots, 'auto play is all PERFECT');
  eq(s.score, 1000000, 'all PERFECT scores 1,000,000');
  const jitter = T.play(new T.Judge(c), T.autoplayEvents(c, n => (n.id === 'a' ? 0.06 : 0)));
  eq(jitter.counts.GREAT, 1, '60 ms off is GREAT');
  ok(jitter.accuracy < 1 && jitter.accuracy > 0.9, 'accuracy is weighted');
}

{
  const three = chart([
    { id: 'a', type: 'Hold', layer: 'lower', time: 1, end: 5, x: 0, width: 3 },
    { id: 'b', type: 'Hold', layer: 'lower', time: 2, end: 5, x: 6, width: 3 },
    { id: 'c', type: 'Hold', layer: 'upper', time: 3, end: 5, x: 12, width: 3 },
  ]);
  eq(T.lint(three).peakContacts, 3, 'three overlapping long notes need 3 contacts');
  ok(T.lint(three).warnings.some(w => /contacts/.test(w)), 'over the limit gives a warning');
  eq(T.lint(three, { maxContacts: 3 }).warnings.length, 0, 'the limit is adjustable');
  const hint = T.lint(chart([{ id: 'w', type: 'Slide', layer: 'lower', time: 1, end: 2, x: 0, width: 6, path: [{ t: 1, x: 0, width: 6 }, { t: 2, x: 6, width: 6 }] }]));
  ok(hint.warnings.some(w => /upper/.test(w)), 'a Slide on the lower layer gets a layer hint');
}

{
  const h = { id: 'h', type: 'Hold', layer: 'lower', time: 2, end: 4, x: 9, width: 3 };
  const j = new T.Judge(chart([h]));
  j.down('pass', 20, 1.9);
  j.down('hold', 10, 1.99);
  j.move('pass', 10, 2.0); j.move('pass', 2, 2.2);
  j.up('pass', 2.3); j.up('hold', 4.01);
  eq(j.finish().counts.MISS, 0, 'after a passing finger leaves, the original finger still holds the Hold');
}

{
}
{

  const c = chart([tap('b', 4.9, 0, 3), tap('a', 5, 6, 3)]);
  const j = new T.Judge(c);
  j.down('s', 0.5, 4.8);
  j.move('s', 7, 4.95); j.move('s', 7.5, 5.0);
  j.up('s', 5.2);
  j.finish();
  const byId = Object.fromEntries(j.results.map(x => [x.noteId, x.grade]));
  eq(byId.b, 'GREAT', 'the first moment a finger is on b (−100 ms) sets the grade');
  eq(byId.a, 'GREAT', 'rubbing into a counts as a touch (about −73 ms), on both layers');
}

{
  const SIXTEENTH = 60 / 200 / 4;
  ok(Math.abs(SIXTEENTH - 0.075) < 1e-12, 'a sixteenth at 200 BPM = 75 ms');
  for (const layer of ['lower', 'upper']) {

    const notes = [];
    for (let i = 0; i < 24; i++) notes.push({ id: 'z' + i, type: 'Tap', layer, time: 2 + i * SIXTEENTH, x: i % 2 ? 18 : 3, width: 3 });
    const zig = chart(notes);
    const j = new T.Judge(zig);
    j.down('f', 4.5, 2);
    for (let i = 0; i < 24; i++) {
      const t0 = 2 + i * SIXTEENTH;
      for (const k of [1 / 3, 2 / 3, 1]) j.move('f', (i % 2 ? 19.5 : 4.5) + ((i % 2 ? 4.5 : 19.5) - (i % 2 ? 19.5 : 4.5)) * k, t0 + SIXTEENTH * k);
    }
    j.up('f', 4);
    eq(j.finish().counts.PERFECT, 24, `${layer}: rubbing back and forth at sixteenths, all 24 PERFECT`);

    const steps = [];
    for (let i = 0; i < 8; i++) steps.push({ id: 's' + i, type: 'Tap', layer, time: 2 + i * SIXTEENTH, x: i * 3, width: 3 });
    const k = new T.Judge(chart(steps));
    k.down('f', 1.5, 2);
    for (let i = 1; i < 8; i++) k.move('f', i * 3 + 1.5, 2 + i * SIXTEENTH);
    k.up('f', 3);
    eq(k.finish().counts.PERFECT, 8, `${layer}: sparsely sampled sweeps still hit`);

    const wide = chart([{ id: 'w', type: 'Tap', layer, time: 2.5, x: 10, width: 1 }]);
    const m = new T.Judge(wide);
    m.down('f', 0.5, 2.4); m.move('f', 23.5, 2.6); m.up('f', 2.7);
    eq(m.finish().counts.PERFECT, 1, `${layer}: one sweep across the field touches a 1-cell range on the way`);
  }
}

{
  const A = { id: 'A', type: 'Tap', layer: 'lower', time: 5, x: 6, width: 6 };
  const B = { id: 'B', type: 'Tap', layer: 'lower', time: 5.075, x: 6, width: 6 };
  const grades = j => Object.fromEntries(j.results.map(r => [r.noteId, r.grade]));

  const j = new T.Judge(chart([A, B]));
  eq(Math.round(j.notes[0].late * 1000), 38, 'A late window narrows to half the gap');
  eq(Math.round(j.notes[1].early * 1000), 38, 'B early window narrows to half the gap');
  eq(j.notes[0].early, 0.07, 'a side with no overlapping neighbour keeps its window (70 ms early)');
  eq(j.notes[1].late, 0.1, 'and 100 ms late');

  const late = new T.Judge(chart([A, B]));
  late.down('f', 8, 5.06); late.up('f', 5.1);
  late.finish();
  eq(grades(late).A, 'MISS', 'a touch in the second half is no longer taken by A');
  eq(grades(late).B, 'PERFECT', 'it goes to the nearer B, where any touch in the window is PERFECT');

  const rest = new T.Judge(chart([A, B]));
  rest.down('f', 8, 4.99); rest.up('f', 5.3);
  rest.finish();
  eq(grades(rest).A, 'PERFECT', 'a resting finger takes A');
  eq(grades(rest).B, 'MISS', 'staying still (same sensor cell): it does not take a second one');

  const rub = new T.Judge(chart([A, B]));
  rub.down('f', 8, 4.99); rub.move('f', 20, 5.03); rub.move('f', 8, 5.07); rub.up('f', 5.3);
  rub.finish();
  eq(grades(rub).A + grades(rub).B, 'PERFECTPERFECT', 'rubbing: both PERFECT');

  const loose = new T.Judge(chart([A, { ...B, time: 5.12 }]));
  eq(Math.round(loose.notes[0].late * 1000), 60, '120 ms apart: the overlap goes to whichever note grades higher, so A late window ends at the midpoint (60 ms)');
  const edge = new T.Judge(chart([A, { ...B, time: 5.16 }]));
  eq(Math.round(edge.notes[0].late * 1000), 80, '160 ms apart: windows still overlap, split at 80 ms');
  const far = new T.Judge(chart([A, { ...B, time: 5.17 }]));
  eq(far.notes[0].late, 0.1, '170 ms apart: windows no longer overlap (100 late + 70 early), no narrowing');

  const early = new T.Judge(chart([A]));
  early.down('f', 8, 4.94); early.up('f', 4.97);
  eq(early.finish().counts.GREAT, 1, 'an unprotected note touched 60 ms early is GREAT');

  const sl = { ...slide, time: 2, end: 4 };
  const s2 = run([sl], j2 => { j2.down('p', 15, 1); j2.move('p', 5, 1.9); j2.move('p', 1, 2); for (let i = 1; i <= 100; i++) j2.move('p', 1 + (T.rangeAt(sl, 2 + i * 0.02).x - 0) + 1.4, 2 + i * 0.02); j2.up('p', 4.01); });
  eq(s2.counts.MISS, 0, 'a Slide can be entered by rubbing into its head, then followed');
}

{
  const sl = { id: 's', type: 'Slide', layer: 'upper', time: 2, end: 4, x: 0, width: 4, path: [{ t: 2, x: 0, width: 4 }, { t: 4, x: 18, width: 4 }] };
  const clash = tap('t', 3.0, 9, 3);
  ok(T.lint(chart([sl, clash])).warnings.some(w => /may brush t/.test(w)), 'a Slide path overlapping a Tap window and range warns about brushing');
  ok(T.lint(chart([{ ...sl, type: 'ExSlide' }, clash])).warnings.some(w => /may brush/.test(w)), 'ExSlide warns the same way');
  eq(T.lint(chart([sl, tap('t', 4.4, 9, 3)])).warnings.length, 0, 'separate times (no window overlap): no warning');
  eq(T.lint(chart([sl, tap('t', 3.0, 23, 1)])).warnings.length, 0, 'separate ranges: no warning');
  eq(T.lint(chart([sl, { id: 'd', type: 'Drag', layer: 'upper', time: 3.0, x: 9, width: 3 }])).warnings.length, 0, 'any touch on a Drag is PERFECT, so it is not brushing');
  ok(T.smears(sl, clash) && !T.smears(clash, sl), 'smears(a, b): only Slides brush other notes');
  eq(typeof new T.Judge(chart([sl, clash])).busy, 'undefined', 'the judge has no busy method');
}

{
  const drag = (id, time, x = 9, width = 3, layer = 'upper') => ({ id, type: 'Drag', layer, time, x, width });
  const at = (dt, x = 10) => { const j = new T.Judge(chart([drag('d', 5)])); j.down('f', x, 5 + dt); j.up('f', 5 + dt + 0.02); return j.finish().counts; };
  eq(at(0.14).PERFECT, 1, 'touched 140 ms late is still PERFECT, early or late');
  eq(at(-0.14).PERFECT, 1, 'touched 140 ms early is PERFECT');
  eq(at(0.2).MISS, 1, 'beyond the 150 ms window is a miss');
  eq(at(0, 20).MISS, 1, 'not touching the range is a miss');

  const slide = new T.Judge(chart([drag('d', 5)]));
  slide.down('f', 0.5, 4.9); slide.move('f', 20, 5.05); slide.up('f', 5.2);
  eq(slide.finish().counts.PERFECT, 1, 'a finger flicking across the range between samples still touches it');
  const rest = new T.Judge(chart([drag('a', 5), drag('b', 5.05), drag('c', 5.1), drag('e', 5.15)]));
  rest.down('f', 10, 4.95); rest.up('f', 5.4);
  eq(rest.finish().counts.PERFECT, 4, 'one finger resting in the range catches a run of Drags');

  const hold = { id: 'h', type: 'Hold', layer: 'lower', time: 4, end: 6, x: 9, width: 3 };
  const j = new T.Judge(chart([hold, drag('d', 5)]));
  j.down('f', 10, 4); j.up('f', 6.01);
  eq(j.finish().counts.MISS, 0, 'a finger holding a Hold also catches Drags in range');

  const many = chart([{ id: 'a', type: 'Hold', layer: 'lower', time: 1, end: 5, x: 0, width: 3 }, { id: 'b', type: 'Hold', layer: 'lower', time: 1, end: 5, x: 6, width: 3 }, drag('d', 3, 12), drag('e', 3, 15)]);
  eq(T.lint(many).peakContacts, 2, 'Drags need no extra contact');
  rejects(chart([{ id: 'x', type: 'Drag', layer: 'upper', time: 1, end: 2, x: 0, width: 3 }]), /cannot have an end/, 'Drag cannot have an end');
}

{
  const ex = (id, time, x = 6, width = 3) => ({ id, type: 'ExTap', layer: 'lower', time, x, width });
  const at = (dt, x = 7) => { const j = new T.Judge(chart([ex('e', 5)])); j.down('f', x, 5 + dt); j.up('f', 5 + dt + 0.02); return j.finish().counts; };
  eq(at(0.09).PERFECT, 1, 'ExTap touched 90 ms late is PERFECT');
  eq(at(-0.065).PERFECT, 1, 'ExTap touched 65 ms early is PERFECT');
  eq(at(0.11).MISS, 1, 'beyond the 100 ms late window is a miss');
  eq(at(0, 20).MISS, 1, 'not touching the range is a miss');

  const tp = new T.Judge(chart([tap('t', 5, 6, 3)])); tp.down('f', 7, 5.09); tp.up('f', 5.11);
  eq(tp.finish().counts.GOOD, 1, 'control: a plain Tap with the same offset is GOOD');

  const pair = new T.Judge(chart([ex('a', 5), tap('b', 5.075, 6, 3)]));
  eq(Math.round(pair.notes[0].late * 1000), 38, 'ExTap also narrows windows next to neighbours');
  rejects(chart([{ id: 'x', type: 'ExTap', layer: 'lower', time: 1, end: 2, x: 0, width: 3 }]), /cannot have an end/, 'ExTap cannot have an end');
}

{

  const hold = { id: 'h', type: 'Hold', layer: 'lower', time: 2, end: 6, x: 0, width: 3 };
  const next = tap('n', 4, 15, 3);
  const k = new T.Judge(chart([hold, next]));
  k.down('f', 1, 2); k.move('f', 10, 3.2);
  k.move('f', 10, 3.9); k.move('f', 16, 4.0);
  k.up('f', 4.1);
  k.finish();
  const gk = Object.fromEntries(k.results.map(x => [x.noteId + x.part, x.grade]));
  eq(gk.nhead, 'PERFECT', 'a finger leaving a Hold is free to hit the next note');
  eq(gk[`hcheck${T.checksOf(hold, 120).length - 1}`], 'MISS', 'no finger in the Hold at the end: last checkpoint MISS');
}

{
  const hold = type => ({ id: 'h', type, layer: 'lower', time: 2, end: 4, x: 6, width: 3 });
  const run1 = (type, dt, gapMs) => {
    const j = new T.Judge(chart([hold(type)]));
    j.down('f', 7, 2 + dt);
    if (gapMs) { j.move('f', 20, 3); j.move('f', 7, 3 + gapMs / 1000); }
    j.up('f', 4.01);
    return j.finish().counts;
  };
  eq(run1('Hold', 0.09, 0).GOOD, 1, 'control: a plain Hold 90 ms late has a GOOD head');
  eq(run1('ExHold', 0.09, 0).MISS, 0, 'ExHold 90 ms late: nothing missed');
  eq(run1('ExHold', 0.09, 0).PERFECT, 8, 'head PERFECT and every checkpoint PERFECT');
  eq(run1('ExHold', -0.095, 0).PERFECT, 8, 'ExHold 95 ms early: the same (Ex window is 100 ms both ways)');
  eq(T.slotCount(hold('ExHold'), 120), 8, 'ExHold has the same checkpoints as a Hold');
  const sl = type => ({ id: 's', type, layer: 'upper', time: 2, end: 4, x: 0, width: 3, path: [{ t: 2, x: 0, width: 3 }, { t: 4, x: 18, width: 3 }] });
  const ev = chart([sl('ExSlide')]);
  const j = new T.Judge(ev);
  const events = T.autoplayEvents(ev).map(e => (e.k === 'down' ? { ...e, t: e.t + 0.09 } : e));
  eq(T.play(j, events.sort((p, q) => p.t - q.t)).counts.MISS, 0, 'ExSlide: head touched 90 ms late is PERFECT');
  const j2 = new T.Judge(chart([sl('Slide')]));
  const e2 = T.autoplayEvents(chart([sl('Slide')])).map(e => (e.k === 'down' ? { ...e, t: e.t + 0.09 } : e));
  eq(T.play(j2, e2.sort((p, q) => p.t - q.t)).counts.GOOD, 1, 'control: a plain Slide 90 ms late has a GOOD head');
  ok(T.isEx(sl('ExSlide')) && !T.isEx(sl('Slide')) && T.baseOf(sl('ExSlide')) === 'Slide', 'Ex types are recognised');
}

{
  const lo = { id: 'lo', type: 'Tap', layer: 'lower', time: 5, x: 6, width: 3, link: 'up' };
  const up = { id: 'up', type: 'Tap', layer: 'upper', time: 5, x: 6, width: 3, link: 'lo' };
  T.validateChart(chart([lo, up]));
  ok(true, 'a two-way, same-time, upper/lower link passes');
  rejects(chart([{ ...lo, link: 'nope' }, up]), /does not exist/, 'a link to a missing note is rejected');
  rejects(chart([lo, { ...up, link: undefined }]), /both ways/, 'links must point both ways');
  rejects(chart([lo, { ...up, time: 5.01 }]), /same time/, 'linked notes must be at the same time');
  rejects(chart([lo, { ...up, layer: 'lower' }]), /one upper/, 'one upper and one lower');
  ok(T.lint(chart([{ ...lo, link: undefined }, { ...up, link: undefined }])).warnings.some(w => /same moment/.test(w)), 'same time, overlapping ranges, not linked: warning');
  eq(T.lint(chart([{ ...lo, link: undefined }, { ...up, link: undefined, x: 15 }])).warnings.length, 0, 'same time, separate ranges: no warning');
  eq(T.lint(chart([lo, up])).warnings.length, 0, 'linked: no warning');
  rejects(chart([lo, { ...up, x: 15 }]), /ranges overlap/, 'notes whose ranges do not overlap cannot be linked');
  T.validateChart(chart([lo, { ...up, x: 8, width: 3 }]));
  ok(true, 'partly overlapping notes can be linked');

  const pair = new T.Judge(chart([lo, up]));
  pair.down('a', 7, 5); pair.down('b', 8, 5); pair.up('a', 5.03); pair.up('b', 5.03);
  eq(pair.finish().counts.PERFECT, 2, 'two fingers at once: both PERFECT');
  const one = new T.Judge(chart([lo, up]));
  one.down('a', 7, 5); one.up('a', 5.03);
  const r1 = one.finish();
  eq(r1.counts.PERFECT, 1, 'one finger in one sensor cell takes one note (the other needs a new cell: slide across a row or rub sideways)');
  eq(T.lint(chart([lo, up])).peakContacts, 2, 'the chart check still counts one contact per note (conservative)');
}

{
  const flow = (mode, o = {}) => ({ id: 'f', type: o.type || 'Flow', layer: 'lower', time: 2, end: 4, x: 6, width: 6, mode, tick: 0.25, ...o });
  eq(T.ticksOf(flow('hold')).length, 8, '2 s, one every 0.25 s: 8 ticks');
  eq(T.slotCount(flow('hold')), 9, 'judgements = 1 head + 8 ticks');
  const grades = j => j.results.filter(r => /^tick/.test(r.part)).map(r => r.grade);

  let j = new T.Judge(chart([flow('hold')]));
  j.down('a', 8, 2); j.up('a', 4.05);
  let s = j.finish();
  eq(s.counts.PERFECT, 9, 'hold: held throughout, head + 8 ticks all PERFECT');

  j = new T.Judge(chart([flow('hold')]));
  j.down('a', 8, 2); j.up('a', 3.0);
  j.finish();
  eq(grades(j).filter(g => g === 'PERFECT').length, 4, 'hold: held until 3.0 s, ticks 2.25 / 2.5 / 2.75 / 3.0 pass');
  eq(grades(j).filter(g => g === 'MISS').length, 4, 'the 4 ticks after 3.0 break');

  j = new T.Judge(chart([flow('hold')]));
  j.down('a', 8, 2); j.move('a', 20, 2.6); j.move('a', 8, 3.1); j.up('a', 4.05);
  j.finish();
  const g = grades(j);
  eq(g.join(','), 'PERFECT,PERFECT,MISS,MISS,PERFECT,PERFECT,PERFECT,PERFECT', 'hold: ticks break while away and pass again after returning');

  j = new T.Judge(chart([flow('hold')]));
  j.down('a', 8, 3.0); j.up('a', 4.05);
  s = j.finish();
  eq(j.results.find(r => r.part === 'head').grade, 'MISS', 'head 1 s late: head MISS');
  eq(grades(j).slice(-4).every(x => x === 'PERFECT'), true, 'but later ticks still connect');

  const scrubEv = (jj, from, to) => { jj.down('a', 9, from); for (let t = from + 0.02, k = 0; t <= to; t += 0.02, k++) jj.move('a', 9 + 2 * Math.sin(k * Math.PI / 3), t); jj.up('a', to + 0.01); };
  j = new T.Judge(chart([flow('scrub')])); scrubEv(j, 2, 4.0); s = j.finish();
  eq(s.counts.PERFECT, 9, 'scrub: rubbing throughout, head + 8 ticks all PERFECT');
  j = new T.Judge(chart([flow('scrub')])); j.down('a', 9, 2); j.up('a', 4.05); j.finish();
  eq(grades(j).filter(x => x === 'MISS').length, 8, 'scrub: holding still breaks all 8 ticks');
  j = new T.Judge(chart([flow('scrub')])); j.down('a', 9, 2); for (let t = 2.02, k = 0; t <= 4.0; t += 0.02, k++) j.move('a', 9 + 0.1 * Math.sin(k), t); j.up('a', 4.05); j.finish();
  eq(grades(j).filter(x => x === 'MISS').length, 8, 'scrub: small jitter (< half the width) is not rubbing');

  j = new T.Judge(chart([flow('hold', { type: 'ExFlow' })])); j.down('a', 8, 2.09); j.up('a', 4.05); s = j.finish();
  eq(j.results.find(r => r.part === 'head').grade, 'PERFECT', 'ExFlow head 90 ms late is PERFECT');

  const c = chart([flow('hold'), { ...flow('scrub'), id: 'g', layer: 'upper', time: 6, end: 8, x: 12 }]);
  eq(T.play(new T.Judge(c), T.autoplayEvents(c)).counts.MISS, 0, 'auto play clears both Flow modes without a MISS');
  rejects(chart([flow('wiggle')]), /hold or scrub/, 'mode must be hold / scrub');
  rejects(chart([flow('hold', { tick: 0.01 })]), /tick/, 'a tick that is too small is rejected');
  rejects(chart([flow('hold', { tick: 3 })]), /tick/, 'a tick that is too large is rejected');
  rejects(chart([{ id: 'x', type: 'Tap', layer: 'lower', time: 1, x: 0, width: 3, mode: 'hold' }]), /only Flow/, 'only Flow notes have a mode');
  ok(T.lint(chart([flow('scrub'), tap('t', 3, 8, 3)])).warnings.some(w => /may brush/.test(w)), 'a scrub Flow is a sweep: a Tap inside its range warns about brushing');
  eq(T.lint(chart([flow('hold'), tap('t', 3, 20, 3)])).peakContacts, 2, 'a Flow takes one contact for its whole length');
}

{
  const lo = { id: 'lo', type: 'Tap', layer: 'lower', time: 5, x: 6, width: 3 };
  const up = { id: 'up', type: 'Tap', layer: 'upper', time: 5, x: 6, width: 3 };
  const mk = (fn, notes = [lo, up]) => { const j = new T.Judge(chart(notes)); j.rowTop = 0.60; fn(j); j.finish(); return j; };
  const g = j => Object.fromEntries(j.results.map(r => [r.noteId, r.grade]));

  let j = mk(j => { j.down('a', 7.5, 5, 0.95); j.up('a', 5.1); });
  eq(g(j).lo + g(j).up, 'PERFECTMISS', 'two stacked notes, one finger: takes only one');
  j = mk(j => { j.down('a', 7.5, 5, 0.95); j.move('a', 7.5, 5.03, 0.85); j.up('a', 5.1); });
  eq(g(j).lo + g(j).up, 'PERFECTPERFECT', 'sliding up across a row (new cell): hits the second too');
  j = mk(j => { j.down('a', 7.5, 5, 0.65); j.move('a', 7.5, 5.03, 0.95); j.up('a', 5.1); });
  eq(g(j).lo + g(j).up, 'PERFECTPERFECT', 'sliding down across rows works the same');
  j = mk(j => { j.down('a', 7.5, 5, 0.95); j.move('a', 7.5, 5.03, 0.93); j.up('a', 5.1); });
  eq(g(j).up, 'MISS', 'small moves within one row: no new cell');
  j = mk(j => { j.down('a', 6.5, 5, 0.95); j.move('a', 7.5, 5.03, 0.95); j.up('a', 5.1); });
  eq(g(j).lo + g(j).up, 'PERFECTPERFECT', 'crossing a cell edge sideways (new column): hits the second too');
  j = mk(j => { j.down('a', 6.2, 5, 0.95); j.move('a', 6.8, 5.03, 0.95); j.up('a', 5.1); });
  eq(g(j).up, 'MISS', 'small sideways moves within one cell: no new cell');
  j = mk(j => { j.down('a', 7.5, 5); j.move('a', 7.5, 5.03); j.up('a', 5.1); });
  eq(g(j).up, 'MISS', 'no vertical information (1 row): sliding up or down does nothing');
  j = mk(j => { j.down('a', 7, 5, 0.9); j.down('b', 8, 5, 0.9); j.up('a', 5.03); j.up('b', 5.03); });
  eq(g(j).lo + g(j).up, 'PERFECTPERFECT', 'two fingers at once: one note each');

  const mk2 = fn => { const jj = new T.Judge(chart([lo, up])); jj.rowTop = 0.60; jj.rowBottom = 0.90; fn(jj); jj.finish(); return jj; };
  j = mk2(j => { j.down('a', 7.5, 5, 0.75); j.move('a', 7.5, 5.03, 0.70); j.up('a', 5.1); });
  eq(g(j).lo + g(j).up, 'PERFECTPERFECT', 'band 0.30 tall, rows 0.06: 0.75 to 0.70 crosses the 0.72 boundary, new cell');
  j = mk2(j => { j.down('a', 7.5, 5, 0.75); j.move('a', 7.5, 5.03, 0.73); j.up('a', 5.1); });
  eq(g(j).up, 'MISS', '0.75 → 0.73 stays in one row: no new cell');
  j = mk2(j => { j.down('a', 7.5, 5, 0.88); j.move('a', 7.5, 5.03, 0.97); j.up('a', 5.1); });
  eq(g(j).up, 'MISS', 'y below the band clamps to the last row, no extra cell');

  const run = [5, 5.2, 5.4, 5.6].map((time, i) => ({ id: 'r' + i, type: 'Tap', layer: 'lower', time, x: 6, width: 3 }));
  j = mk(j => { j.down('a', 7.5, 4.97, 0.9); j.up('a', 5.8); }, run);
  eq(j.results.filter(r => r.grade !== 'MISS').length, 1, 'holding still: of 4 passing notes only 1 is taken (no resting catch)');
  j = mk(j => { j.down('a', 7.5, 4.9, 0.9); j.up('a', 5.8); }, run);
  eq(j.results.filter(r => r.grade !== 'MISS').length, 0, 'pressed before the first window opened and held: none are taken');

  j = new T.Judge(chart([{ id: 'n', type: 'Tap', layer: 'lower', time: 9, x: 6, width: 3 }]));
  for (let i = 0; i < 12; i++) { j.down('m', 20, 8 + i * 0.05); j.up('m', 8.02 + i * 0.05); }
  j.down('m', 7, 9); j.up('m', 9.02);
  eq(j.finish().counts.PERFECT, 1, '12 empty presses in a row do not lock input: the next note is still PERFECT');
}

{
  const row = chart([0, 3, 6, 9, 12, 15, 18, 21].map((x, i) => ({ id: 't' + i, type: 'Tap', layer: 'lower', time: 5, x, width: 3 })));
  const j = new T.Judge(row);
  [1, 4, 7, 10, 13, 16, 19, 22].forEach((x, i) => j.down('f' + i, x, 5));
  eq(j.finish().counts.PERFECT, 8, '8 fingers on 8 notes at once: all PERFECT, no 4-touch cap');
}

{
  const c = chart([
    { id: 'h', type: 'ExHold', layer: 'lower', time: 2, end: 3.8, x: 5, width: 4 },
    { id: 'f', type: 'ExFlow', layer: 'upper', time: 2, end: 3.8, x: 19, width: 5, mode: 'scrub', tick: 0.2272727 },
  ]);
  const j = new T.Judge(c); j.rows = 5; j.rowTop = 0.6; j.rowBottom = 1;
  for (let k = 120; k <= 60 * 4; k++) {
    const t = k / 60, px = 21.5 + 1.8 * Math.sin((t - 2) * Math.PI * 2 * 2.3);
    if (k === 120) { j.down('a', 7, t, 0.8); j.down('b', px, t, 0.8); } else { j.move('a', 7, t, 0.8); j.move('b', px, t, 0.8); }
    j.advance(t);
  }
  const s = j.finish();
  eq(s.counts.MISS, 0, 'two fingers moving at the same timestamp: Hold in place, the other rubs a Flow, no ticks lost');
}

console.log(`PASS: ${checks} rule checks`);

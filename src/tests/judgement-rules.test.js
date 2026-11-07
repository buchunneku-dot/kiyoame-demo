'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../trackless-core.js');
const C = require('../judgement-config.js');

const chart = (notes, bpm = 120) => ({ version: 'trackless-v1', id: 'rules', bpm, duration: 20, cells: 24, notes });
const tap = (id, time, x, width = 3, layer = 'lower', extra = {}) => Object.assign({ id, type: 'Tap', layer, time, x, width }, extra);
const hold = (id, time, end, x, width = 3, type = 'Hold') => ({ id, type, layer: 'lower', time, end, x, width });
const slide = (id, time, end, x0, x1, width = 3) => ({ id, type: 'Slide', layer: 'upper', time, end, x: x0, width, path: [{ t: time, x: x0, width }, { t: end, x: x1, width }] });
const flow = (id, time, end, mode, x = 0, width = 6) => ({ id, type: 'Flow', layer: 'upper', time, end, x, width, mode, tick: 0.25 });
const drag = (id, time, x, width = 3) => ({ id, type: 'Drag', layer: 'upper', time, x, width });

function play(notes, steps, bpm) {
  const j = new T.Judge(chart(notes, bpm));
  const at = s => (s[0] === 'up' ? s[2] : s[3]);
  for (const s of steps.slice().sort((a, b) => at(a) - at(b))) j[s[0]](...s.slice(1));
  j.finish();
  const by = {};
  for (const r of j.results) by[r.noteId + '.' + r.part] = r.grade;
  return { by, j };
}
const press = (x, t, len = 0.02, id = 'p') => [['down', id, x, t], ['up', id, t + len]];

const cases = [];
function check(group, name, expected, actual) {
  cases.push({ group, name, expected: String(expected), actual: String(actual) });
}

const tapAt = dt => play([tap('a', 5, 0)], press(1, 5 + dt)).by['a.head'];
const ms = s => `${Math.round(s * 1000)} ms`;
const eps = 0.001;
for (const [dt, want] of [
  [-C.tap.perfect, 'PERFECT'], [-C.tap.perfect - eps, 'GREAT'], [-C.tap.great, 'GREAT'], [-C.tap.great - eps, 'MISS'],
  [0, 'PERFECT'], [C.tap.perfect, 'PERFECT'], [C.tap.perfect + eps, 'GREAT'], [C.tap.great, 'GREAT'],
  [C.tap.great + eps, 'GOOD'], [C.tap.good, 'GOOD'], [C.tap.good + eps, 'MISS'],
]) check('Tap window', `press ${dt >= 0 ? '+' : ''}${ms(dt)}`, want, tapAt(dt));
{
  const r = play([tap('a', 5, 0)], press(1, 5 - C.tap.great - eps));
  check('Tap window', 'press too early is ignored, not judged', 'miss at timeout', r.j.results[0].reason === 'miss' && r.j.results[0].time > 5 ? 'miss at timeout' : 'judged by the press');
}

const exAt = dt => play([tap('a', 5, 0, 3, 'lower', { type: 'ExTap' })], press(1, 5 + dt)).by['a.head'];
for (const [dt, want] of [[-C.ex.window, 'PERFECT'], [-C.ex.window - eps, 'MISS'], [C.ex.window, 'PERFECT'], [C.ex.window + eps, 'MISS'], [-0.07, 'PERFECT'], [0.08, 'PERFECT']])
  check('Ex window', `ExTap press ${dt >= 0 ? '+' : ''}${ms(dt)}`, want, exAt(dt));

const dragAt = dt => play([drag('d', 5, 0)], press(1, 5 + dt, 0)).by['d.head'];
for (const [dt, want] of [[-C.drag.window, 'PERFECT'], [-C.drag.window - eps, 'MISS'], [C.drag.window, 'PERFECT'], [C.drag.window + eps, 'MISS']])
  check('Drag window', `touch ${dt >= 0 ? '+' : ''}${ms(dt)}`, want, dragAt(dt));

const posAt = x => play([tap('a', 5, 6)], press(x, 5)).by['a.head'];
for (const [x, want] of [[6, 'PERFECT'], [8.99, 'PERFECT'], [5, 'PERFECT'], [9.5, 'PERFECT'], [4.99, 'MISS'], [10, 'MISS']])
  check('Position', `still finger at x = ${x} on a note covering 6–9`, want, posAt(x));
{
  const r = play([tap('a', 5, 6)], [['down', 'p', 2, 4.98], ['move', 'p', 5.5, 5], ['move', 'p', 2, 5.02], ['up', 'p', 5.03]]);
  check('Position', 'finger sweeping through one cell outside without stopping does not use the margin', 'MISS', r.by['a.head']);
}
{
  const r = play([tap('a', 5, 6), tap('b', 5.06, 9)], press(9.5, 5));
  check('Position', 'margin is off when the finger rests on an upcoming note', 'a MISS, b GREAT', `a ${r.by['a.head']}, b ${r.by['b.head']}`);
}

const iv = T.checkInterval(120);
const releaseGap = g => play([hold('h', 1, 2, 0)], [['down', 'p', 1, 1], ['up', 'p', 1 + iv - g]]).by['h.check0'];
for (const [g, want] of [[C.checkpoint.perfect, 'PERFECT'], [C.checkpoint.perfect + eps, 'GREAT'], [C.checkpoint.great, 'GREAT'], [C.checkpoint.great + eps, 'GOOD'], [C.checkpoint.good, 'GOOD'], [C.checkpoint.good + eps, 'MISS']])
  check('Hold checkpoints', `released ${ms(g)} before a checkpoint`, want, releaseGap(g));
{
  const r = play([hold('h', 1, 2, 0)], [['down', 'p', 1, 1], ['up', 'p', 1.8]]);
  const checks = Object.keys(r.by).filter(k => k.startsWith('h.check')).map(k => r.by[k]);
  check('Hold checkpoints', 'released 200 ms before the end, after the last checkpoint', 'all PERFECT, no release judgement', checks.every(g => g === 'PERFECT') && r.j.counts.MISS === 0 ? 'all PERFECT, no release judgement' : checks.join(' '));
}
{
  const r = play([hold('h', 1, 2, 0)], [['down', 'p', 1, 0.94], ['up', 'p', 2.01]]);
  check('Hold checkpoints', 'pressed 60 ms early and held', 'head GREAT, checks PERFECT', `head ${r.by['h.head']}, checks ${r.by['h.check0'] === 'PERFECT' && r.by['h.check2'] === 'PERFECT' ? 'PERFECT' : 'lost'}`);
}
{
  const r = play([hold('h', 1, 2, 0)], [['down', 'p', 1, 0.85], ['up', 'p', 2.01]]);
  check('Hold checkpoints', 'pressed 150 ms early and held', 'head MISS, checks PERFECT', `head ${r.by['h.head']}, checks ${r.by['h.check0'] === 'PERFECT' && r.by['h.check2'] === 'PERFECT' ? 'PERFECT' : 'lost'}`);
}
{
  const r = play([hold('h', 1, 2, 0)], []);
  check('Hold checkpoints', 'never touched', 'head and every check MISS', Object.values(r.by).every(g => g === 'MISS') ? 'head and every check MISS' : JSON.stringify(r.by));
}
{
  const steps = [['down', 'p', 0.5, 1]];
  for (let t = 1.02; t <= 3.0; t += 0.02) {
    const k = (t - 1) / 2, cx = 0 + 12 * k + 1.5;
    steps.push(['move', 'p', t > 1.55 && t < 1.95 ? cx + 8 : cx, t]);
  }
  steps.push(['up', 'p', 3.01]);
  const r = play([slide('s', 1, 3, 0, 12)], steps);
  const checks = Object.keys(r.by).filter(k => k.startsWith('s.check')).map(k => r.by[k]);
  check('Slide path', 'follows the path, leaves it for 400 ms across a checkpoint, returns', 'checks during the gap MISS, later checks PERFECT',
    checks.includes('MISS') && checks[checks.length - 1] === 'PERFECT' && checks[0] === 'PERFECT' ? 'checks during the gap MISS, later checks PERFECT' : checks.join(' '));
}
{
  const steps = [['down', 'p', 3, 1]];
  for (let t = 1.02; t <= 2.0; t += 0.02) steps.push(['move', 'p', 3 + Math.sin((t - 1) * 30) * 2.5, t]);
  steps.push(['up', 'p', 2.01]);
  const r = play([flow('f', 1, 2, 'scrub')], steps);
  check('Flow', 'scrub moving across half the width per tick', 'every tick PERFECT', Object.keys(r.by).filter(k => k.startsWith('f.tick')).every(k => r.by[k] === 'PERFECT') ? 'every tick PERFECT' : JSON.stringify(r.by));
  const still = play([flow('f', 1, 2, 'scrub')], [['down', 'p', 3, 1], ['up', 'p', 2.01]]);
  check('Flow', 'scrub held still', 'every tick MISS', Object.keys(still.by).filter(k => k.startsWith('f.tick')).every(k => still.by[k] === 'MISS') ? 'every tick MISS' : JSON.stringify(still.by));
}

{
  const r = play([tap('a', 1, 0), tap('b', 1.12, 0)], press(1, 1.055));
  check('Conflict: same-spot repeats', '120 ms apart, press 55 ms after the first', 'a GREAT, b MISS', `a ${r.by['a.head']}, b ${r.by['b.head']}`);
  const s = play([tap('a', 1, 0), tap('b', 1.12, 0)], press(1, 1.065));
  check('Conflict: same-spot repeats', '120 ms apart, press 65 ms after the first (past the midpoint)', 'a MISS, b GREAT', `a ${s.by['a.head']}, b ${s.by['b.head']}`);
  const both = play([tap('a', 1, 0), tap('b', 1.12, 0)], [...press(1, 1.0), ...press(1, 1.12, 0.02, 'q')]);
  check('Conflict: same-spot repeats', 'two presses on time', 'a PERFECT, b PERFECT', `a ${both.by['a.head']}, b ${both.by['b.head']}`);
}
{
  const r = play([tap('a', 1, 0), tap('b', 1, 2, 3, 'upper')], press(2.5, 1));
  const taken = [r.by['a.head'], r.by['b.head']].filter(g => g !== 'MISS').length;
  check('Conflict: one touch, several notes', 'one press on two overlapping same-moment notes', 'one note taken', taken === 1 ? 'one note taken' : `${taken} notes taken`);
}
{
  const notes = [tap('u', 1, 0, 3, 'upper', { link: 'l' }), tap('l', 1, 0, 3, 'lower', { link: 'u' })];
  const one = play(notes, press(1, 1));
  check('Conflict: linked upper/lower pair', 'one finger', 'one PERFECT, one MISS', [one.by['u.head'], one.by['l.head']].sort().join(', ') === 'MISS, PERFECT' ? 'one PERFECT, one MISS' : JSON.stringify(one.by));
  const two = play(notes, [...press(1, 1), ...press(1.5, 1, 0.02, 'q')]);
  check('Conflict: linked upper/lower pair', 'two fingers', 'both PERFECT', two.by['u.head'] === 'PERFECT' && two.by['l.head'] === 'PERFECT' ? 'both PERFECT' : JSON.stringify(two.by));
  check('Conflict: linked upper/lower pair', 'lint on a linked pair', 'no warning', T.lint(chart(notes)).warnings.length ? 'warning' : 'no warning');
  const unlinked = [tap('u', 1, 0, 3, 'upper'), tap('l', 1, 0, 3, 'lower')];
  check('Conflict: linked upper/lower pair', 'lint on the same notes unlinked', 'warning', T.lint(chart(unlinked)).warnings.some(w => /link them/.test(w)) ? 'warning' : 'no warning');
}
{
  const r = play([tap('a', 1, 0), tap('b', 1.03, 3)], press(3.5, 1));
  check('Conflict: priority', 'note under the finger beats a better-timed note one cell away', 'a MISS, b PERFECT', `a ${r.by['a.head']}, b ${r.by['b.head']}`);
  const g = play([tap('a', 1, 0), tap('b', 1.05, 4)], press(3.5, 1.045));
  check('Conflict: priority', 'both one cell away: higher grade wins', 'a MISS, b PERFECT', `a ${g.by['a.head']}, b ${g.by['b.head']}`);
  const e = play([tap('a', 1, 0), tap('b', 1.05, 4)], press(3.5, 1.04));
  check('Conflict: priority', 'both one cell away, same grade: earlier note wins', 'a PERFECT, b MISS', `a ${e.by['a.head']}, b ${e.by['b.head']}`);
}
{
  const r = play([hold('h', 1, 2, 0), tap('t', 1.5, 0)], [['down', 'p', 1, 1], ['up', 'p', 2.01]]);
  check('Conflict: long note and tap', 'the finger holding a Hold does not take a Tap inside it', 't MISS, Hold checks PERFECT', `t ${r.by['t.head']}, Hold checks ${['h.check0', 'h.check1', 'h.check2'].every(k => r.by[k] === 'PERFECT') ? 'PERFECT' : 'lost'}`);
  const s = play([hold('h', 1, 2, 0), tap('t', 1.5, 0)], [['down', 'p', 1, 1], ['up', 'p', 2.01], ...press(1.5, 1.5, 0.02, 'q')]);
  check('Conflict: long note and tap', 'a second finger takes the Tap', 't PERFECT', `t ${s.by['t.head']}`);
}
{
  const r = play([drag('d', 1, 0), tap('t', 1, 0, 3, 'lower')], press(1, 1));
  check('Conflict: special notes', 'Drag and Tap at the same spot and moment, one press', 'both PERFECT', r.by['d.head'] === 'PERFECT' && r.by['t.head'] === 'PERFECT' ? 'both PERFECT' : JSON.stringify(r.by));
  const x = play([tap('a', 1, 0), tap('b', 1.05, 4, 3, 'lower', { type: 'ExTap' })], press(3.5, 1.06));
  check('Conflict: special notes', 'Ex note ranks as PERFECT against a GREAT one cell away', 'Ex note wins', x.by['b.head'] === 'PERFECT' && x.by['a.head'] === 'MISS' ? 'Ex note wins' : JSON.stringify(x.by));
}
{
  const r = play([tap('a', 1, 0), tap('b', 1, 12)], [...press(1, 1), ...press(13, 1, 0.02, 'q')]);
  check('Multi-finger', 'two fingers on two notes at once', 'both PERFECT', r.by['a.head'] === 'PERFECT' && r.by['b.head'] === 'PERFECT' ? 'both PERFECT' : JSON.stringify(r.by));
  const h = play([hold('h', 1, 2, 0), tap('t', 1.5, 12)], [['down', 'p', 1, 1], ['up', 'p', 2.01], ...press(13, 1.5, 0.02, 'q')]);
  check('Multi-finger', 'one finger holds, another taps elsewhere', 'no MISS', h.j.counts.MISS === 0 ? 'no MISS' : `${h.j.counts.MISS} MISS`);
}
{
  const w = T.lint(chart([tap('a', 1, 0), tap('b', 1, 6), tap('c', 1, 12)])).warnings;
  check('Chart rules', 'three notes at once', 'over the contact limit', w.some(s => /over the limit/.test(s)) ? 'over the contact limit' : 'accepted');
  check('Chart rules', 'two notes at once', 'accepted', T.lint(chart([tap('a', 1, 0), tap('b', 1, 6)])).warnings.length ? 'warning' : 'accepted');
}
{
  const n = [hold('h', 1, 2, 0)];
  check('Scoring', 'a 1 s Hold at 120 BPM has 1 head + 3 checkpoint slots', 4, new T.Judge(chart(n)).slots);
  const r = play([tap('a', 1, 0), tap('b', 2, 0)], [...press(1, 1.05), ...press(1, 2.08, 0.02, 'q')]);
  check('Scoring', 'GREAT + GOOD on two taps', Math.round(1e6 * (C.weights.GREAT + C.weights.GOOD) / 2), r.j.summary().score);
}

let failed = 0;
for (const c of cases) if (c.expected !== c.actual) { failed++; console.log(`FAIL [${c.group}] ${c.name}: expected ${c.expected}, got ${c.actual}`); }

if (process.argv.includes('--report')) {
  const out = ['# Boundary Test Report', '', 'Generated by `node src/tests/judgement-rules.test.js --report` from the values in `src/judgement-config.js`.', '', `${cases.length} cases, ${cases.length - failed} pass, ${failed} fail.`, ''];
  let group = null;
  for (const c of cases) {
    if (c.group !== group) { group = c.group; out.push('', `## ${group}`, '', '| Case | Expected | Result | |', '|---|---|---|---|'); }
    out.push(`| ${c.name} | ${c.expected} | ${c.actual} | ${c.expected === c.actual ? 'pass' : 'FAIL'} |`);
  }
  fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'BoundaryTestReport.md'), out.join('\n') + '\n');
}

assert.equal(failed, 0, `${failed} rule cases failed`);
console.log(`PASS: ${cases.length} judgement rule cases`);

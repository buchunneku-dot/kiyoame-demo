'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const T = require('../trackless-core.js');
const A = require('../result-analysis.js');

let checks = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const ok = (c, msg) => { assert.ok(c, msg); checks++; };
const near = (a, b, tol, msg) => { assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`); checks++; };

const chart = notes => ({ version: 'trackless-v1', id: 't', bpm: 120, duration: 20, cells: 24, sections: [{ bar: 0, name: 'A' }, { bar: 4, name: 'B' }], notes });
const tap = (id, time, x = 0) => ({ id, type: 'Tap', layer: 'lower', time, x, width: 3 });
function run(c, events) {
  const j = new T.Judge(c);
  for (const e of events.slice().sort((a, b) => a.t - b.t)) { if (e.k === 'down') j.down(e.id, e.x, e.t); else j.up(e.id, e.t); }
  j.finish();
  return A.analyse(j.results, c);
}
const press = (id, x, t) => [{ k: 'down', id, x, t }, { k: 'up', id, t: t + 0.02 }];

{
  const notes = [], ev = [];
  for (let i = 0; i < 30; i++) { notes.push(tap('n' + i, 1 + i * 0.25, (i % 2) * 12)); ev.push(...press('p' + i, 1 + (i % 2) * 12, 1 + i * 0.25 + 0.035)); }
  const a = run(chart(notes), ev);
  eq(a.timing.count, 30, 'every hit head is in the timing data');
  near(a.timing.mean, 35, 0.5, 'mean offset is 35 ms late');
  near(a.timing.sd, 0, 0.5, 'no spread when every hit is the same');
  eq(a.timing.bins.reduce((s, b) => s + b.count, 0), 30, 'histogram holds every hit');
  eq(a.timing.bins.find(b => b.from === 30).count, 30, 'hits fall in the 30–40 ms bin');
  eq([a.timing.fast, a.timing.slow], [0, 0], 'within PERFECT counts as neither FAST nor SLOW');
  ok(a.insights.some(s => /35 ms late/.test(s)), 'a steady late bias is reported');
}
{
  const notes = [], ev = [];
  for (let i = 0; i < 32; i++) { notes.push(tap('n' + i, 1 + i * 0.25, (i % 2) * 12)); if (i % 4) ev.push(...press('p' + i, 1 + (i % 2) * 12, 1 + i * 0.25 - 0.06)); }
  const a = run(chart(notes), ev);
  eq(a.timing.fast, 24, 'early GREAT hits count as FAST');
  eq(a.misses.length, 8, 'unplayed notes are listed as misses');
  ok(a.insights.some(s => /early/.test(s)), 'mostly-early play is reported');
  ok(a.insights.some(s => /of misses are Tap notes/.test(s)), 'the most missed category is reported');
}
{
  const c = chart([tap('a', 1), { id: 'h', type: 'Hold', layer: 'upper', time: 2, end: 3, x: 10, width: 3 }, tap('b', 9)]);
  const a = run(c, [...press('p', 1, 1), { k: 'down', id: 'q', x: 11, t: 2 }, { k: 'up', id: 'q', t: 2.3 }]);
  const hold = a.byType.find(t => t.type === 'Hold');
  eq(hold.heads.PERFECT, 1, 'Hold head PERFECT');
  eq(hold.body.MISS, 2, 'Hold checkpoints after letting go are MISS');
  eq(a.sections.map(s => s.name), ['A', 'B'], 'sections come from the chart');
  eq(a.sections[0].slots, 5, 'section A holds the first tap and the Hold');
  eq(a.sections[1].counts.MISS, 1, 'section B holds the missed tap');
  ok(a.misses.some(m => m.kind === 'checkpoint' && Math.abs(m.at - 2.5) < 1e-6), 'a missed checkpoint is placed at its own time');
  eq(a.timeline.reduce((s, b) => s + b.slots, 0), 6, 'the timeline holds every slot');
  eq(A.partTime(c.notes[1], 'check2', 120), 2.75, 'checkpoint times follow the BPM');
}
{
  require(path.join(__dirname, '..', 'song', 'chart-ams-showcase.js'));
  const c = JSON.parse(JSON.stringify(globalThis.KiyoameChartAmsShowcase));
  const j = new T.Judge(c);
  const s = T.play(j, T.autoplayEvents(c));
  const a = A.analyse(j.results, c);
  eq(s.score, 1000000, 'auto play is perfect');
  eq(a.misses.length, 0, 'no misses in auto play');
  eq(a.byType.reduce((n, t) => n + t.count, 0), j.slots, 'type breakdown covers every slot');
  eq(a.sections.reduce((n, x) => n + x.slots, 0), j.slots, 'sections cover every slot');
  eq(a.insights, [], 'a perfect run has nothing to point out');
}

console.log(`PASS: ${checks} result analysis checks`);

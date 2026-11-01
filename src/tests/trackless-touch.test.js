'use strict';
const assert = require('node:assert/strict');
const { bounds } = require('../trackless-touch.js');
const T = require('../trackless-core.js');
for (const height of [390, 768, 820, 1024]) {
  const half = (Math.max(96, Math.min(140, height * 0.17)) + 0.10 * height) / 2;
  const judgeY = height - half, oldTop = judgeY - half, rowHeight = 2 * half / 5;
  const area = bounds('near', height, judgeY, half);
  assert.equal(area.rows, 6);
  assert.equal(area.bottom, height);
  assert.ok(Math.abs(area.top - (oldTop - rowHeight)) < 1e-8);
  for (let k = 0; k <= 5; k++) {
    const newBoundary = area.top + (k + 1) * (area.bottom - area.top) / 6;
    assert.ok(Math.abs(newBoundary - (oldTop + k * rowHeight)) < 1e-8, 'the original five row boundaries stay in place');
  }
  const chart = { version: 'trackless-v1', id: 'six-row-input', bpm: 120, duration: 10, cells: 24,
    notes: ['lower', 'upper'].map((layer, i) => ({ id: 'n' + i, type: 'Tap', layer, time: 5, x: 9, width: 3 })) };
  const judge = new T.Judge(chart);
  judge.rows = area.rows; judge.rowTop = area.top / height; judge.rowBottom = area.bottom / height;
  const extraRowY = area.top + rowHeight / 2;
  assert.ok(extraRowY < oldTop && extraRowY >= area.top, 'the added row takes presses above the old band');
  judge.down('p', 10, 5, extraRowY / height);
  assert.equal(judge.counts.PERFECT, 1);
  judge.move('p', 10, 5.01, (oldTop + rowHeight / 2) / height);
  assert.equal(judge.counts.PERFECT, 2, 'moving from the added row into the first row counts as a new touch');
  assert.deepEqual(bounds('half', height, judgeY, half), { top: height * 0.4, bottom: height, rows: 5 });
  assert.deepEqual(bounds('full', height, judgeY, half), { top: 0, bottom: height, rows: 5 });
}
console.log('PASS: 4 screen heights / sixth row added above / five rows unchanged / new-row input and cross-row touches');

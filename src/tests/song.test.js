'use strict';
const assert = require('assert');
const T = require('../trackless-core.js');

global.window = global;
for (const name of ['standard', 'showcase']) require(`../song/chart-${name}.js`);
require('../song/song.js');
const Song = global.KiyoameSong;

assert.deepStrictEqual(Song.charts, ['standard', 'showcase'], 'two charts');
for (const name of Song.charts) {
  const chart = Song.buildChart(name);
  T.validateChart(chart);
  assert.strictEqual(chart.title, 'Kiyoame Theme', `${name}: title`);
  assert.strictEqual(chart.bpm, 120, `${name}: bpm`);
  const lint = T.lint(chart);
  assert.deepStrictEqual(lint.warnings, [], `${name}: no chart warnings`);
  assert.ok(T.peakContacts(chart) <= 2, `${name}: at most two fingers at once`);
  const s = T.play(new T.Judge(chart), T.autoplayEvents(chart));
  assert.strictEqual(s.score, 1000000, `${name}: auto play scores 1,000,000`);
  assert.notStrictEqual(Song.buildChart(name), Song.buildChart(name), `${name}: each build is a fresh copy`);
  console.log(`${name}: ${chart.notes.length} notes`);
}
console.log('PASS: both charts validate, have no warnings and clear at 1,000,000 on auto play');

'use strict';
const assert = require('assert');
const T = require('../trackless-core.js');

global.window = global;
for (const name of ['standard', 'showcase', 'ams-standard', 'ams-showcase']) require(`../song/chart-${name}.js`);
require('../song/song.js');
const Song = global.KiyoameSong;

assert.deepStrictEqual(Song.songs, ['theme', 'ams'], 'two songs');
assert.deepStrictEqual(Song.charts, ['standard', 'showcase'], 'two charts per song');
const expect = { theme: { title: 'Kiyoame Theme', bpm: 120 }, ams: { title: 'Ams', bpm: 136 } };
for (const id of Song.songs) for (const name of Song.charts) {
  Song.select(id);
  assert.strictEqual(Song.selected, id, `${id}: selected`);
  const chart = Song.buildChart(name);
  T.validateChart(chart);
  assert.strictEqual(chart.title, expect[id].title, `${id} ${name}: title`);
  assert.strictEqual(chart.bpm, expect[id].bpm, `${id} ${name}: bpm`);
  assert.strictEqual(Song.info(id).counts[name], chart.notes.length, `${id} ${name}: note count in the song list`);
  const lint = T.lint(chart);
  assert.deepStrictEqual(lint.warnings, [], `${name}: no chart warnings`);
  assert.ok(T.peakContacts(chart) <= 2, `${name}: at most two fingers at once`);
  const s = T.play(new T.Judge(chart), T.autoplayEvents(chart));
  assert.strictEqual(s.score, 1000000, `${name}: auto play scores 1,000,000`);
  assert.notStrictEqual(Song.buildChart(name), Song.buildChart(name), `${name}: each build is a fresh copy`);
  console.log(`${id} ${name}: ${chart.notes.length} notes`);
}
console.log('PASS: all charts validate, have no warnings and clear at 1,000,000 on auto play');

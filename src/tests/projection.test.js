'use strict';
const assert = require('node:assert/strict');
const { dualLayerLayout, perspectiveProgress, perspectiveProgressAtScreen } = require('../projection.js');

let cases = 0;
for (const [width, height] of [[390, 640], [768, 900], [1920, 1080]]) {
  for (const span of [4.5, 6.5, 8.5]) {
    for (const angle of [12, 34, 50]) {
      const field = dualLayerLayout(width, height, span, angle);
      const [upper, lower] = field.layers;
      assert.equal(upper.judgeY, lower.judgeY, 'both planes share one judgement line');
      assert.ok(upper.topY < lower.topY && lower.topY < field.judgeY, 'planes are stacked and both fall from above the line');
      assert.ok(field.spanLeft >= 0 && field.spanLeft + field.fieldW <= width, 'the active field stays on screen');
      assert.equal(new Set(Array.from({length:8},(_,lane)=>field.x(lane))).size,8,'eight separate horizontal positions remain');
      for(let lane=0;lane<8;lane++)assert.deepEqual(upper.P(upper.U(lane)+.5,0),lower.P(lower.U(lane)+.5,0),'both planes share the same eight-position line');
      for (let lane = 0; lane < 8; lane++) {
        const u = field.U(lane) + 0.5;
        assert.equal(field.forLane(lane).hasLane(lane), true, 'each position belongs to exactly one layer');
        assert.notEqual(upper.hasLane(lane), lower.hasLane(lane), 'notes are not duplicated across layers');
        for (const plane of [field.forLane(lane)]) {
          let prevY = plane.yAt(1);
          for (const remainingTime of [0.8, 0.5, 0.2, 0]) {
            const point = plane.P(u, remainingTime);
            assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
            assert.ok(point.y > prevY, 'notes always move down to the line as time runs out');
            prevY = point.y;
          }
          const pixels = (plane.judgeY - plane.topY) * 0.4;
          assert.ok(Math.abs(plane.yAt(plane.dAbove(pixels)) - (plane.judgeY - pixels)) < 1e-8, 'hit effects sit on their own plane');
          assert.ok(plane.thick(16, 1) > 0, 'far notes keep a visible thickness');
        }
      }
      cases++;
    }
  }
}
console.log(`PASS: ${cases} two-layer projection cases (size / lanes / angle): shared line and fall direction`);

for (const farScale of [0.25,0.35,0.5,1]) {
  assert.equal(perspectiveProgress(0,farScale),0);
  assert.ok(Math.abs(perspectiveProgress(1,farScale)-1)<1e-12,'a note reaches the line exactly on the beat');
  let previous=-Infinity, previousStep=0;
  for(let i=0;i<=100;i++) {
    const progress=i/100,screen=perspectiveProgress(progress,farScale);
    assert(screen>previous,'screen position keeps falling');
    if(i>1)assert(screen-previous>=previousStep-1e-12,'equal time steps never shrink near the line');
    previousStep=screen-previous;previous=screen;
    assert.ok(Math.abs(perspectiveProgressAtScreen(screen,farScale)-progress)<1e-12,'the clip boundary inverts consistently');
  }
  assert(perspectiveProgress(1.01,farScale)>1,'missed notes keep moving past the line');
}
const farStep=perspectiveProgress(.2)-perspectiveProgress(.1);
const nearStep=perspectiveProgress(.95)-perspectiveProgress(.85);
assert(nearStep>farStep*3,'near notes move clearly faster than far ones');
console.log('PASS: perspective fall speeds up near the line, lands on the beat and continues past it');

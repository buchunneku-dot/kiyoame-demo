(function (root) {
  'use strict';
  const U = lane => lane + (lane >= 4 ? 0.5 : 0);

  function perspectiveProgress(progress, farScale = 0.35) {
    if (!Number.isFinite(progress) || !Number.isFinite(farScale) || farScale <= 0 || farScale > 1) throw new Error('Invalid perspective parameters');
    const denominator = 1 - (1 - farScale) * progress;
    if (denominator <= 0) throw new Error('Projected point is behind the camera plane');
    return farScale * progress / denominator;
  }

  function perspectiveProgressAtScreen(screen, farScale = 0.35) {
    if (!Number.isFinite(screen) || screen < 0 || !Number.isFinite(farScale) || farScale <= 0 || farScale > 1) throw new Error('Invalid projection distance');
    return screen / (farScale + (1 - farScale) * screen);
  }

  function dualLayerLayout(width, height, fitSpan, angle, options) {
    const opt = options || {};

    const slot = Math.min((width - 32) * 0.8 / fitSpan, 240, (width - 32) / 4.5);
    const fieldW = slot * fitSpan;
    const judgeY = opt.judgeBottom !== undefined ? height - opt.judgeBottom : height - Math.max(96, Math.min(140, height * 0.17));
    const topY = opt.topY !== undefined ? opt.topY : Math.max(64, height * 0.1);
    const fold = Math.max(12, Math.min(70, Number(angle) || 34));
    const cameraAngle = (opt.cameraDeg || 36) * Math.PI / 180, depth = 2.4;
    const upperAngle = cameraAngle + fold * Math.PI / 180;
    const focal = (judgeY - topY) * (1 + depth * Math.cos(upperAngle)) / (depth * Math.sin(upperAngle));

    const focalFor = (a, length) => length * (1 + depth * Math.cos(a)) / (depth * Math.sin(a));
    const lowerLength = (judgeY - topY) * (opt.lowerRatio || 0.86);

    function plane(id, a, laneStart, laneEnd, focal) {
      const origin = 0;
      const k = depth * Math.cos(a), slope = focal * depth * Math.sin(a);
      const scale = d => 1 / (1 + k * Math.max(d, -0.2));
      const yAt = d => judgeY - slope * d / (1 + k * Math.max(d, -0.2));
      const P = (u, d) => ({ x: width / 2 + (u - 4.25) * slot * scale(d), y: yAt(d) });
      const dAbove = px => Math.min(1, Math.max(0, px / Math.max(1, slope - k * px)));
      return {
        id, origin, persp: true, slot, fieldW, judgeY, topY: yAt(1),
        left0: width / 2 - fieldW / 2, spanLeft: width / 2 - fieldW / 2,
        U, P, scale, yAt, slope, dAbove, dMin: -Math.min(0.18, 28 / slope),
        thick: (n, d) => n / (slope * scale(d)),
        x: lane => width / 2 + (U(lane) - 4.25) * slot,
        hasLane: lane => lane >= laneStart && lane < laneEnd,
      };
    }

    const upper = plane('upper', upperAngle, 0, 4, focal);
    const lower = plane('lower', cameraAngle, 4, 8, focalFor(cameraAngle, lowerLength));
    return Object.assign({}, upper, {
      fold, layers: [upper, lower],
      forLane: lane => lane < 4 ? upper : lower,
      forLayer: layer => layer==='lower'?lower:upper,
      x: lane => (lane < 4 ? upper : lower).x(lane),
    });
  }

  const api = { dualLayerLayout, perspectiveProgress, perspectiveProgressAtScreen };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KiyoameProjection = api;
})(typeof window === 'object' ? window : globalThis);

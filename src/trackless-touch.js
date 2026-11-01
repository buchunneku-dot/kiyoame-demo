(function (root) {
  'use strict';
  function bounds(zone, height, judgeY, half) {
    const bottom = zone === 'near' ? Math.min(height, judgeY + half) : height;
    let top = zone === 'full' ? 0 : zone === 'half' ? height * 0.4 : Math.max(0, judgeY - half);
    let rows = 5;
    if (zone === 'near') {
      const rowHeight = (bottom - top) / rows;

      if (rowHeight > 0 && top >= rowHeight) { top -= rowHeight; rows++; }
    }
    return { top, bottom, rows };
  }
  const api = { bounds };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KiyoameTracklessTouch = api;
})(typeof window === 'object' ? window : globalThis);

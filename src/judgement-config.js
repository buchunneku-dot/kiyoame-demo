(function (root) {
  'use strict';

  const deepFreeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

  const JudgementConfig = deepFreeze({
    tap: {
      perfect: 0.040,
      great: 0.070,
      good: 0.100,
    },
    ex: {
      window: 0.100,
    },
    weights: { PERFECT: 1, GREAT: 0.7, GOOD: 0.4, MISS: 0 },
    checkpoint: {
      perfect: 0.050,
      great: 0.100,
      good: 0.150,
      sixteenthBelowBpm: 120,
      quarterFromBpm: 240,
      leadIn: 0.050,
    },
    position: {
      reach: 1,
    },
    drag: {
      window: 0.150,
    },
    flow: {
      tolerance: 0.040,
      exToleranceScale: 2,
      scrubFraction: 0.5,
      exScrubScale: 0.5,
      activeMargin: 0.100,
      minTick: 0.05,
      maxTick: 1,
    },
    chart: {
      maxContacts: 2,
      tapContact: 0.050,
    },
    input: {
      judgeLag: 0.050,
      maxOutputLatency: 0.300,
      edgePx: 18,
      palmPx: 70,
    },
  });

  if (typeof module === 'object' && module.exports) module.exports = JudgementConfig;
  else root.KiyoameJudgementConfig = JudgementConfig;
})(typeof window === 'object' ? window : globalThis);

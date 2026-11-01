(function () {
  'use strict';

  const MIST = [[0, '#c9d1e4'], [0.4, '#dfe4ef'], [0.75, '#eceef5'], [1, '#e3e6ef']];

  function create() {
    let key = '', base = null;

    function paint(W, H, DPR) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W * DPR)); c.height = Math.max(1, Math.round(H * DPR));
      const b = c.getContext('2d');
      b.setTransform(DPR, 0, 0, DPR, 0, 0);
      const gr = b.createLinearGradient(0, 0, 0, H);
      for (const [o, col] of MIST) gr.addColorStop(o, col);
      b.fillStyle = gr; b.fillRect(0, 0, W, H);

      b.save(); b.translate(W / 2, H * 0.08); b.scale(1, 0.45);
      const r = Math.max(W, H) * 0.6, fog = b.createRadialGradient(0, 0, 0, 0, 0, r);
      for (const [o, a] of [[0, 0.9], [0.3, 0.6], [0.65, 0.2], [1, 0]]) fog.addColorStop(o, `rgba(250,251,255,${a})`);
      b.fillStyle = fog; b.fillRect(-r, -r, r * 2, r * 2); b.restore();

      const vg = b.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.4, W / 2, H * 0.45, Math.max(W, H) * 0.85);
      vg.addColorStop(0, 'rgba(120,130,170,0)'); vg.addColorStop(1, 'rgba(120,130,170,0.18)');
      b.fillStyle = vg; b.fillRect(0, 0, W, H);
      return c;
    }

    function draw(g, W, H, DPR) {
      const k = `${W}x${H}@${DPR}`;
      if (k !== key) { key = k; base = paint(W, H, DPR); }
      g.drawImage(base, 0, 0, W, H);
    }

    return { draw };
  }

  window.KiyoameBackdrop = { create };
})();

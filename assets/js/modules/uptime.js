// === UPTIME ===
// Reads data-core-start from <body> and counts uptime in real time.

import { utils } from '../core/utils.js';

// === INIT ===

export function initUptime() {
  const startStr = document.body?.dataset?.coreStart;
  if (!startStr) return;

  const start = utils.safeParseDate(startStr);
  if (!start) return;

  const el = document.getElementById('system-uptime');
  if (!el) return;

  function update() {
    let diff = Math.floor((Date.now() - start) / 1000);
    if (diff < 0) diff = 0;

    const days = Math.floor(diff / 86400);
    diff %= 86400;
    const h = Math.floor(diff / 3600);
    diff %= 3600;
    const m = Math.floor(diff / 60);
    const s = diff % 60;

    el.textContent = `${days}d ${utils.pad(h)}:${utils.pad(m)}:${utils.pad(s)}`;
  }

  update();
  setInterval(() => { if (!document.hidden) update(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
}

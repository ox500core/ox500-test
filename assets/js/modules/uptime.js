// === UPTIME ===
// Reads data-core-start from <body> and counts uptime in real time.

import { utils } from '../core/utils.js';

const SECOND_MS = 1000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86400;

// === INIT ===

export function initUptime() {
  const startStr = document.body?.dataset?.coreStart;
  if (!startStr) return;

  const start = utils.safeParseDate(startStr);
  if (!start) return;

  const el = document.getElementById('system-uptime');
  if (!el) return;

  function update() {
    let diff = Math.floor((Date.now() - start) / SECOND_MS);
    if (diff < 0) diff = 0;

    const days = Math.floor(diff / DAY_SECONDS);
    diff %= DAY_SECONDS;
    const h = Math.floor(diff / HOUR_SECONDS);
    diff %= HOUR_SECONDS;
    const m = Math.floor(diff / MINUTE_SECONDS);
    const s = diff % MINUTE_SECONDS;

    el.textContent = `${days}d ${utils.pad(h)}:${utils.pad(m)}:${utils.pad(s)}`;
  }

  update();
  setInterval(() => { if (!document.hidden) update(); }, SECOND_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
}

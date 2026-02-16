// === TICK ===
// Drives the 1s clock and emits 'tick' on the bus.
// Pauses when tab is hidden to save resources.

import { bus } from '../core/event-bus.js';
import { utils } from '../core/utils.js';

const TICK_INTERVAL_MS = 1000;

// === INIT ===

export function initTick() {
  const clock = document.getElementById('clock');
  let tickTimer = null;

  function tick() {
    const d = new Date();
    if (clock) {
      clock.textContent = `${utils.pad(d.getHours())}:${utils.pad(d.getMinutes())}:${utils.pad(d.getSeconds())}`;
    }
    bus.emit('tick', { ts: Date.now() });
  }

  function startTick() {
    if (tickTimer) return;
    tick();
    tickTimer = setInterval(tick, TICK_INTERVAL_MS);
  }

  function stopTick() {
    if (!tickTimer) return;
    clearInterval(tickTimer);
    tickTimer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTick();
    else startTick();
  });

  startTick();
}

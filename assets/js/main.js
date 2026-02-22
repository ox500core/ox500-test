// === OX500 - MAIN ENTRY POINT ===
// esbuild bundles this file into dist/assets/js/bundle.js

import { initBoot } from './modules/boot.js';
import { initTick } from './modules/tick.js';
import { initUptime } from './modules/uptime.js';
import { initTopbarStatus } from './modules/topbar-status.js';
import { initSystemPhaseUi } from './modules/system-phase-ui.js';
import { initDiagnostics } from './modules/diagnostics.js';
import { initFeed } from './modules/feed.js';
import { initGlitch } from './modules/glitch.js';
import { initAnomalyEngine } from './modules/anomaly-engine.js';
import { initMobileLogs } from './modules/mobile-logs/index.js';
import { initNextLogLabel } from './modules/next-log-label.js';
import { initLayoutPlacement } from './modules/layout-placement.js';

const CRITICAL_INITIALIZERS = [
  initBoot,
  initTick,
  initUptime,
  initTopbarStatus,
  initSystemPhaseUi,
  initMobileLogs,
  initNextLogLabel,
  initLayoutPlacement,
];

const DEFERRED_INITIALIZERS = [
  initDiagnostics,
  initFeed,
  initGlitch,
  initAnomalyEngine,
];

const isMobile = window.matchMedia?.('(max-width: 980px), (hover:none) and (pointer:coarse)').matches ?? false;

CRITICAL_INITIALIZERS.forEach((initFn) => {
  initFn();
});

const deferredDelayMs = isMobile ? 2500 : 2800;

function runDeferredInitializers() {
  const tasks = [...DEFERRED_INITIALIZERS];
  if (!tasks.length) {
    return;
  }

  const runOne = (initFn) => {
    initFn();
  };

  if (typeof window.requestIdleCallback === 'function') {
    const runChunk = (deadline) => {
      while (tasks.length && deadline.timeRemaining() > 0) {
        runOne(tasks.shift());
      }
      if (tasks.length) {
        window.requestIdleCallback(runChunk, { timeout: 1000 });
      }
    };
    window.requestIdleCallback(runChunk, { timeout: 1000 });
    return;
  }

  const runFallbackChunk = () => {
    runOne(tasks.shift());
    if (tasks.length) {
      window.setTimeout(runFallbackChunk, 50);
    }
  };
  runFallbackChunk();
}

if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(runDeferredInitializers, { timeout: deferredDelayMs });
} else {
  window.setTimeout(runDeferredInitializers, deferredDelayMs);
}

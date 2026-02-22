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
  initNextLogLabel,
  initLayoutPlacement,
];

const POST_PAINT_INITIALIZERS = [
  initMobileLogs,
];

const DEFERRED_INITIALIZERS = [
  initDiagnostics,
  initFeed,
  initGlitch,
  initAnomalyEngine,
];

const isMobile = window.matchMedia?.('(max-width: 980px), (hover:none) and (pointer:coarse)').matches ?? false;
const deferredDelayMs = isMobile ? 2500 : 2800;
const postPaintDelayMs = isMobile ? 120 : 220;

function runInitializerQueue(tasks, options = {}) {
  const queue = [...tasks];
  if (!queue.length) {
    return;
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 1000;
  const fallbackDelayMs = Number.isFinite(options.fallbackDelayMs) ? options.fallbackDelayMs : 50;

  const runOne = () => {
    const initFn = queue.shift();
    if (typeof initFn === 'function') {
      initFn();
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    const runChunk = (deadline) => {
      while (queue.length && deadline.timeRemaining() > 0) {
        runOne();
      }
      if (queue.length) {
        window.requestIdleCallback(runChunk, { timeout: timeoutMs });
      }
    };
    window.requestIdleCallback(runChunk, { timeout: timeoutMs });
    return;
  }

  const runFallbackChunk = () => {
    runOne();
    if (queue.length) {
      window.setTimeout(runFallbackChunk, fallbackDelayMs);
    }
  };
  runFallbackChunk();
}

CRITICAL_INITIALIZERS.forEach((initFn) => {
  initFn();
});

function runDeferredInitializers() {
  runInitializerQueue(DEFERRED_INITIALIZERS, { timeoutMs: 1000, fallbackDelayMs: 50 });
}

function runPostPaintInitializers() {
  runInitializerQueue(POST_PAINT_INITIALIZERS, { timeoutMs: 900, fallbackDelayMs: 30 });
}

if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(runPostPaintInitializers, { timeout: postPaintDelayMs });
} else {
  window.setTimeout(runPostPaintInitializers, postPaintDelayMs);
}

if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(runDeferredInitializers, { timeout: deferredDelayMs });
} else {
  window.setTimeout(runDeferredInitializers, deferredDelayMs);
}

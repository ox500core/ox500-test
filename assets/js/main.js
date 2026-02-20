// === OX500 — MAIN ENTRY POINT ===
// esbuild bundles this file into dist/assets/js/bundle.js
// Import order matters: bus and utils must be ready before features use them.

// === CORE ===
// (no side effects — imported by feature modules as needed)
// import './core/event-bus.js';
// import './core/utils.js';
// import './core/logs-loader.js';

// === FEATURE MODULES ===
import { initBoot }        from './modules/boot.js';
import { initTick }        from './modules/tick.js';
import { initUptime }      from './modules/uptime.js';
import { initTopbarStatus } from './modules/topbar-status.js';
import { initSystemPhaseUi } from './modules/system-phase-ui.js';
import { initDiagnostics } from './modules/diagnostics.js';
import { initFeed }        from './modules/feed.js';
import { initGlitch }      from './modules/glitch.js';
import { initMobileLogs }  from './modules/mobile-logs/index.js';
import { initNextLogLabel } from './modules/next-log-label.js';

// === BOOT ===
// Run synchronously before DOMContentLoaded where possible,
// otherwise each init function guards itself.

const CRITICAL_INITIALIZERS = [
  initBoot,
  initTick,
  initUptime,
  initTopbarStatus,
  initSystemPhaseUi,
  initMobileLogs,
  initNextLogLabel,
];

const DEFERRED_INITIALIZERS = [
  initDiagnostics,
  initFeed,
  initGlitch,
];
const isMobile = window.matchMedia?.('(max-width: 980px), (hover:none) and (pointer:coarse)').matches ?? false;

CRITICAL_INITIALIZERS.forEach((initFn) => {
  initFn();
});

const deferredDelayMs = isMobile ? 2500 : 2800;

function runDeferredInitializers() {
  DEFERRED_INITIALIZERS.forEach((initFn) => {
    initFn();
  });
}

if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(runDeferredInitializers, { timeout: deferredDelayMs });
} else {
  window.setTimeout(runDeferredInitializers, deferredDelayMs);
}

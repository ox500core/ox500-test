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

const INITIALIZERS = [
  initBoot,
  initTick,
  initUptime,
  initTopbarStatus,
  initSystemPhaseUi,
  initDiagnostics,
  initFeed,
  initGlitch,
  initMobileLogs,
  initNextLogLabel,
];

INITIALIZERS.forEach((initFn) => {
  initFn();
});

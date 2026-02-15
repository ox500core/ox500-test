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
import { initDiagnostics } from './modules/diagnostics.js';
import { initFeed }        from './modules/feed.js';
import { initGlitch }      from './modules/glitch.js';
import { initMobileLogs }  from './modules/mobile-logs/index.js';
import "./modules/next-log-label.js";

// === BOOT ===
// Run synchronously before DOMContentLoaded where possible,
// otherwise each init function guards itself.

initBoot();
initTick();
initUptime();
initDiagnostics();
initFeed();
initGlitch();
initMobileLogs();

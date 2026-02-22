// === MOBILE LOGS - RENDERER FACADE ===
// Public API stays stable; implementation is split by responsibility.

export {
  toLogHtml,
  deriveMobileDisruptionTitle,
  deriveMobileLogEntryTitle,
  disruptionKey,
  disruptionSlugFromHref,
  logIdFromHref,
  getCurrentEntry,
  pickEntryForDisruptionSlug,
  setLogStamp,
  setNodePill,
  markCurrentRecentLog,
  markCurrentDisruptionNode,
  setViewMode,
} from './renderer-shared.js';

export {
  renderDisruptionList,
  renderEntry,
  resetScanUi,
} from './renderer-views.js';

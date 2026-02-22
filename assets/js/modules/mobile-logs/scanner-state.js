import { utils } from '../../core/utils.js';
import { getLogs } from './store.js';
import { SCAN_CONFIG } from './config.js';

const state = {
  deepTextSearchEnabled: SCAN_CONFIG.DEEP_SEARCH_ENABLED,
  scanResultsLimit: SCAN_CONFIG.MAX_RESULTS,
  scanLastNeedle: '',
  scanMatchesCache: [],
  scanInputDebounceTimer: null,
};

function toLowerText(value) {
  return String(value || '').toLowerCase();
}

function entryMatchesNeedle(entry, needle, deepActive) {
  const id = toLowerText(entry?.id);
  const title = toLowerText(entry?.title);
  const tag = toLowerText(entry?.tag);
  const disruptionTitle = toLowerText(entry?.disruption_title_clean);
  const disruptionSlug = toLowerText(entry?.disruption_slug_clean);
  const excerpt = toLowerText(entry?.excerpt);
  const textMatch = deepActive ? toLowerText(entry?.text).includes(needle) : false;

  return (
    id.includes(needle) ||
    title.includes(needle) ||
    tag.includes(needle) ||
    disruptionTitle.includes(needle) ||
    disruptionSlug.includes(needle) ||
    excerpt.includes(needle) ||
    textMatch
  );
}

export function getScannerState() {
  return {
    deepTextSearchEnabled: state.deepTextSearchEnabled,
    scanResultsLimit: state.scanResultsLimit,
    scanLastNeedle: state.scanLastNeedle,
    scanMatchesCache: state.scanMatchesCache,
  };
}

export function resetScannerState() {
  state.scanResultsLimit = SCAN_CONFIG.MAX_RESULTS;
  state.scanLastNeedle = '';
  state.scanMatchesCache = [];
}

export function toggleDeepSearch() {
  state.deepTextSearchEnabled = !state.deepTextSearchEnabled;
  return state.deepTextSearchEnabled;
}

export function increaseResultsLimit() {
  state.scanResultsLimit += SCAN_CONFIG.MAX_RESULTS;
  return state.scanResultsLimit;
}

export function clearScanDebounce() {
  if (!state.scanInputDebounceTimer) return;
  clearTimeout(state.scanInputDebounceTimer);
  state.scanInputDebounceTimer = null;
}

export function scheduleScanDebounce(callback) {
  clearScanDebounce();
  state.scanInputDebounceTimer = setTimeout(() => {
    state.scanInputDebounceTimer = null;
    callback();
  }, SCAN_CONFIG.DEBOUNCE_MS);
}

export function resolveScanMatches(query, options) {
  const opts = options || {};
  const needle = String(query || '').trim().toLowerCase();
  const deepActive = state.deepTextSearchEnabled && needle.length >= SCAN_CONFIG.DEEP_SEARCH_MIN_CHARS;

  if (!needle) {
    resetScannerState();
    return {
      needle,
      deepActive,
      matchesAll: [],
      shown: 0,
      results: [],
    };
  }

  if (!opts.keepLimit) state.scanResultsLimit = SCAN_CONFIG.MAX_RESULTS;

  let matchesAll;
  if (opts.useCached && needle === state.scanLastNeedle) {
    matchesAll = state.scanMatchesCache;
  } else {
    matchesAll = getLogs()
      .filter((entry) => entryMatchesNeedle(entry, needle, deepActive))
      .sort((a, b) => Number(utils.normalizeId(b.id)) - Number(utils.normalizeId(a.id)));
    state.scanLastNeedle = needle;
    state.scanMatchesCache = matchesAll;
  }

  const shown = Math.min(matchesAll.length, state.scanResultsLimit);
  const results = matchesAll.slice(0, shown);
  return { needle, deepActive, matchesAll, shown, results };
}

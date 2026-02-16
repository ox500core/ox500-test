// === MOBILE LOGS â€” SCANNER ===
// Full-text search engine. Manages scan state, debounces input,
// renders results, and handles deep-text-search toggle.

import { utils } from '../../core/utils.js';
import { getLogs, ensureAllLogsLoaded, isLoaded, setFromSearch, setFromDisruption } from './store.js';
import {
  deriveMobileLogEntryTitle,
  renderDisruptionList,
  setViewMode,
  resetScanUi,
  renderEntry,
} from './renderer.js';
import { SCAN_CONFIG } from './config.js';

// === SCAN STATE ===
// Isolated to this module â€” scanner owns its own mutable state.

let deepTextSearchEnabled = SCAN_CONFIG.DEEP_SEARCH_ENABLED;
let scanResultsLimit = SCAN_CONFIG.MAX_RESULTS;
let scanLastNeedle = '';
let scanMatchesCache = [];
let scanInputDebounceTimer = null;

// === RENDER ===

export function renderScanResults(els, q, options) {
  const { scanResults, scanInput } = els;
  if (!scanResults) return;

  const opts = options || {};
  const needle = String(q || '').trim().toLowerCase();
  const deepActive = deepTextSearchEnabled && needle.length >= SCAN_CONFIG.DEEP_SEARCH_MIN_CHARS;

  if (!needle) {
    scanLastNeedle = '';
    scanMatchesCache = [];
    scanResultsLimit = SCAN_CONFIG.MAX_RESULTS;
    scanResults.innerHTML = '<span class="scan-hint">TYPE TO SCAN...</span>';
    return;
  }

  if (!opts.keepLimit) scanResultsLimit = SCAN_CONFIG.MAX_RESULTS;

  let matchesAll;
  if (opts.useCached && needle === scanLastNeedle) {
    matchesAll = scanMatchesCache;
  } else {
    matchesAll = getLogs().filter((entry) => {
      const id = String(entry?.id || '').toLowerCase();
      const title = String(entry?.title || '').toLowerCase();
      const tag = String(entry?.tag || '').toLowerCase();
      const disruptionTitle = String(entry?.disruption_title_clean || '').toLowerCase();
      const disruptionSlug = String(entry?.disruption_slug_clean || '').toLowerCase();
      const excerpt = String(entry?.excerpt || '').toLowerCase();
      const textMatch = deepActive
        ? String(entry?.text || '').toLowerCase().includes(needle)
        : false;

      return (
        id.includes(needle) ||
        title.includes(needle) ||
        tag.includes(needle) ||
        disruptionTitle.includes(needle) ||
        disruptionSlug.includes(needle) ||
        excerpt.includes(needle) ||
        textMatch
      );
    }).sort((a, b) => Number(utils.normalizeId(b.id)) - Number(utils.normalizeId(a.id)));

    scanLastNeedle = needle;
    scanMatchesCache = matchesAll;
  }

  const shown = Math.min(matchesAll.length, scanResultsLimit);
  const results = matchesAll.slice(0, shown);

  const deepSwitchClass = deepTextSearchEnabled ? 'is-deep-on' : 'is-deep-off';
  const deepHint =
    deepTextSearchEnabled && !deepActive
      ? ` (min ${SCAN_CONFIG.DEEP_SEARCH_MIN_CHARS} chars for TEXT)`
      : '';

  const statusHtml =
    `<span class="log-line scan-deep-toggle" data-scan-deep-toggle="1">` +
    `SCAN_MODE // DEEP: <span class="scan-deep-switch ${deepSwitchClass}" data-scan-deep-toggle="1">` +
    `<span class="scan-deep-opt scan-deep-opt-on">ON</span>` +
    `<span class="scan-deep-sep" aria-hidden="true">/</span>` +
    `<span class="scan-deep-opt scan-deep-opt-off">OFF</span>` +
    `</span>${deepHint} | MATCHES: ${matchesAll.length} | SHOWING: ${shown}` +
    `</span>`;

  if (!results.length) {
    scanResults.innerHTML = statusHtml + '<span class="scan-hint">NO MATCHES</span>';
    return;
  }

  const resultsHtml = results
    .map((entry) => {
      const id = utils.normalizeId(entry.id);
      const title = deriveMobileLogEntryTitle(entry);
      const href = String(entry.url || '#');
      return (
        `<a class="log-line naked mobile-disruption-item" data-scan-id="${utils.escapeHtml(id)}" href="${utils.escapeHtml(href)}">` +
        `<span class="log-id">LOG ${utils.escapeHtml(id)}</span>` +
        `<span class="log-tag">${utils.escapeHtml(title)}</span>` +
        `</a>`
      );
    })
    .join('');

  const moreHtml = matchesAll.length > shown
    ? '<span class="log-line" data-scan-more="1">LOAD MORE...</span>'
    : '';

  scanResults.innerHTML = statusHtml + resultsHtml + moreHtml;
}

// === OPEN / CLOSE ===

export async function openScan(els, mobileQuery) {
  await ensureAllLogsLoaded();
  if (!isLoaded()) return;
  setFromSearch(true);
  setFromDisruption(false);
  setViewMode(els, 'scan');
  if (els.backFromSearchBtn) els.backFromSearchBtn.hidden = true;
  const { scanInput } = els;
  if (scanInput) {
    renderScanResults(els, scanInput.value);
    scanInput.focus();
  } else {
    renderScanResults(els, '');
  }
}

export function closeScan(els, mobileQuery, stampEl, recentLogsRoot, updateControls, lastNonScanMode, getCurrentEntry) {
  const { textEl } = els;
  if (!textEl || textEl.dataset.viewMode !== 'scan') return;
  setFromSearch(false);
  setFromDisruption(false);

  const entry = getCurrentEntry();
  if (lastNonScanMode === 'disruption-list' && entry) {
    renderDisruptionList(els, mobileQuery, entry, stampEl);
    resetScanUi(els);
    return;
  }
  if (entry) {
    renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls);
    resetScanUi(els);
  } else {
    setViewMode(els, 'entry');
    resetScanUi(els);
  }
}

// === EVENT WIRING ===

export function initScannerListeners(els, mobileQuery, stampEl, recentLogsRoot, updateControls, getLastNonScanMode, getCurrentEntry) {
  const { scanBtn, scanInput, scanResults, textEl } = els;

  if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
      if (textEl?.dataset?.viewMode === 'scan') {
        closeScan(els, mobileQuery, stampEl, recentLogsRoot, updateControls, getLastNonScanMode(), getCurrentEntry);
        return;
      }
      await openScan(els, mobileQuery);
    }, { passive: true });
  }

  if (scanInput) {
    scanInput.addEventListener('input', () => {
      if (scanInputDebounceTimer) clearTimeout(scanInputDebounceTimer);
      scanInputDebounceTimer = setTimeout(() => {
        renderScanResults(els, scanInput.value);
        scanInputDebounceTimer = null;
      }, SCAN_CONFIG.DEBOUNCE_MS);
    });
  }

  if (scanResults) {
    scanResults.addEventListener('click', (e) => {
      const deepToggle = e.target?.closest?.('[data-scan-deep-toggle="1"]');
      if (deepToggle) {
        e.preventDefault();
        deepTextSearchEnabled = !deepTextSearchEnabled;
        renderScanResults(els, scanInput?.value || '');
        return;
      }

      const more = e.target?.closest?.('[data-scan-more="1"]');
      if (more) {
        e.preventDefault();
        scanResultsLimit += SCAN_CONFIG.MAX_RESULTS;
        renderScanResults(els, scanInput?.value || '', { keepLimit: true, useCached: true });
        return;
      }

      const item = e.target?.closest?.('[data-scan-id]');
      if (!item) return;
      e.preventDefault();
      const logId = utils.normalizeId(item.getAttribute('data-scan-id'));
      if (!logId) return;
      const entry = els.logsById.get(logId);
      if (!entry) return;
      els.setCurrentEntryId(logId);
      setFromSearch(true);
      setFromDisruption(false);
      renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls);
    });
  }

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName?.toUpperCase() || '';
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (isTyping && document.activeElement !== scanInput) return;
      e.preventDefault();
      openScan(els, mobileQuery);
      return;
    }

    if (e.key === 'Escape' && textEl?.dataset?.viewMode === 'scan') {
      e.preventDefault();
      closeScan(els, mobileQuery, stampEl, recentLogsRoot, updateControls, getLastNonScanMode(), getCurrentEntry);
    }
  });
}

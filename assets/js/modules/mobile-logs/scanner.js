// === MOBILE LOGS - SCANNER ===
// Full-text search engine. Manages scan state, debounces input,
// renders results, and handles deep-text-search toggle.

import { utils } from '../../core/utils.js';
import { ensureAllLogsLoaded, isLoaded, setFromSearch, setFromDisruption } from './store.js';
import {
  renderDisruptionList,
  setViewMode,
  resetScanUi,
  renderEntry,
} from './renderer.js';
import {
  getScannerState,
  toggleDeepSearch,
  increaseResultsLimit,
  clearScanDebounce,
  scheduleScanDebounce,
  resolveScanMatches,
} from './scanner-state.js';
import {
  renderEmptyScanResults,
  renderScanResultsHtml,
} from './scanner-render.js';

// === RENDER ===

export function renderScanResults(els, q, options) {
  const { scanResults } = els;
  if (!scanResults) return;

  const resolved = resolveScanMatches(q, options);
  if (!resolved.needle) {
    renderEmptyScanResults(scanResults);
    return;
  }

  renderScanResultsHtml(scanResults, {
    deepTextSearchEnabled: getScannerState().deepTextSearchEnabled,
    deepActive: resolved.deepActive,
    matchesAll: resolved.matchesAll,
    shown: resolved.shown,
    results: resolved.results,
  });
}

// === OPEN / CLOSE ===

export async function openScan(els, _mobileQuery) {
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
      scheduleScanDebounce(() => {
        renderScanResults(els, scanInput.value);
      });
    });
  }

  if (scanResults) {
    scanResults.addEventListener('click', (e) => {
      const deepToggle = e.target?.closest?.('[data-scan-deep-toggle="1"]');
      if (deepToggle) {
        e.preventDefault();
        toggleDeepSearch();
        renderScanResults(els, scanInput?.value || '');
        return;
      }

      const more = e.target?.closest?.('[data-scan-more="1"]');
      if (more) {
        e.preventDefault();
        increaseResultsLimit();
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
      clearScanDebounce();
      closeScan(els, mobileQuery, stampEl, recentLogsRoot, updateControls, getLastNonScanMode(), getCurrentEntry);
    }
  });
}

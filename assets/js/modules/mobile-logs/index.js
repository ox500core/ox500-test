// === MOBILE LOGS — ORCHESTRATOR ===
// Entry point for the mobile logs feature.
// Queries the DOM, wires all sub-modules together,
// and starts the initial load sequence.

import { utils } from '../../core/utils.js';
import {
  ensureLoaded,
  isLoaded,
  resolveCurrentIndex,
  getOrderedIds,
  getLogs,
  getLogsById,
  setCurrentEntryId,
  isFromSearch,
  setFromSearch,
} from './store.js';
import {
  renderEntry,
  renderDisruptionList,
  disruptionKey,
  disruptionSlugFromHref,
  logIdFromHref,
  pickEntryForDisruptionSlug,
  getCurrentEntry,
} from './renderer.js';
import { initGestureListeners } from './gestures.js';
import { initScannerListeners, openScan } from './scanner.js';
import { MOBILE_BREAKPOINT } from './config.js';

// === INIT ===

export function initMobileLogs() {
  const staticHomeHero = document.body?.dataset?.layout === 'home';
  // Intencjonalnie tylko layout 'home' - inne templatki nie maja wymaganych elementow DOM.
  if (!staticHomeHero || !window.matchMedia) return;

  const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);

  // === DOM CACHE ===
  const panel = document.getElementById('activeViewPanel');
  const textEl = panel?.querySelector('.bd.log-text');
  const stampEl = document.getElementById('topbarLogStamp');
  const recentLogsRoot = document.getElementById('leftBlock2');
  const disruptionNodesRoot = document.getElementById('leftBlock3');
  const prevBtn = document.getElementById('mobilePrevLogBtn');
  const nextBtn = document.getElementById('mobileNextLogBtn');
  const backFromSearchBtn = document.getElementById('backFromSearchBtn');
  const mobileNav = panel?.querySelector('.mobile-log-nav');
  const scanWrap = document.getElementById('avScan');
  const scanInput = document.getElementById('scanInput');
  const scanResults = document.getElementById('scanResults');
  const scanBtn = document.getElementById('scanModeBtn');

  if (!panel || !textEl || !stampEl) return;

  // === ELS BUNDLE ===
  // A single object passed to sub-modules instead of many parameters.
  // Sub-modules that need logsById read it from the store directly —
  // this bundle is for DOM elements only.
  const els = {
    panel, textEl, stampEl, mobileNav,
    scanWrap, scanInput, scanResults, scanBtn,
    prevBtn, nextBtn, backFromSearchBtn,
    // Convenience: scanner needs to set currentEntryId via the bundle
    get logsById() { return getLogsById(); },
    setCurrentEntryId,
  };

  // === VIEW MODE TRACKING ===
  let lastNonScanMode = 'entry';
  const getLastNonScanMode = () => lastNonScanMode;

  const modeObserver = new MutationObserver(() => {
    const mode = textEl.dataset.viewMode;
    if (mode && mode !== 'scan') lastNonScanMode = mode;
  });
  modeObserver.observe(textEl, {
    attributes: true,
    attributeFilter: ['data-view-mode'],
  });

  // === CONTROLS ===

  function updateControls() {
    if (!prevBtn || !nextBtn) return;
    if (backFromSearchBtn) {
      const showBack = Boolean(isFromSearch() && textEl?.dataset?.viewMode === 'entry');
      backFromSearchBtn.hidden = !showBack;
    }
    if (!isLoaded() || !getOrderedIds().length) {
      prevBtn.disabled = false;
      nextBtn.disabled = false;
      prevBtn.classList.remove('disabled');
      nextBtn.classList.remove('disabled');
      return;
    }

    if (textEl?.dataset?.viewMode === 'disruption-list') {
      const currentEntry = getCurrentEntry(stampEl);
      const currentKey = disruptionKey(currentEntry);
      if (!currentKey) {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        prevBtn.classList.add('disabled');
        nextBtn.classList.add('disabled');
        return;
      }

      const newestByKey = new Map();
      getLogs().forEach((entry) => {
        const key = disruptionKey(entry);
        if (!key) return;
        const idNum = Number(String(entry?.id || '').replace(/\D/g, ''));
        const prev = newestByKey.get(key);
        if (!prev || idNum > prev.idNum) newestByKey.set(key, { idNum, entry });
      });

      const disruptionOrder = Array.from(newestByKey.entries())
        .sort((a, b) => a[1].idNum - b[1].idNum)
        .map(([key]) => key);
      const idx = disruptionOrder.indexOf(currentKey);
      const canPrev = idx > 0;
      const canNext = idx >= 0 && idx < disruptionOrder.length - 1;

      prevBtn.disabled = !canPrev;
      nextBtn.disabled = !canNext;
      prevBtn.classList.toggle('disabled', !canPrev);
      nextBtn.classList.toggle('disabled', !canNext);
      return;
    }

    const idx = resolveCurrentIndex(stampEl);
    const canPrev = idx > 0;
    const canNext = idx >= 0 && idx < getOrderedIds().length - 1;

    prevBtn.disabled = !canPrev;
    nextBtn.disabled = !canNext;
    prevBtn.classList.toggle('disabled', !canPrev);
    nextBtn.classList.toggle('disabled', !canNext);
  }

  // === CURRENT ENTRY GETTER ===

  function _getCurrentEntry() {
    return getCurrentEntry(stampEl);
  }

  // === CLICK HANDLERS ===

  textEl.addEventListener('click', (e) => {
    const titleTarget = e.target?.closest?.('.mobile-active-log-title');
    if (titleTarget) {
      if (mobileQuery.matches) {
        e.preventDefault();
        renderDisruptionList(els, mobileQuery, _getCurrentEntry(), stampEl);
        updateControls();
        return;
      }
      const linkTarget = e.target?.closest?.(".mobile-active-log-link[data-open-disruption-list='1']");
      if (linkTarget) {
        e.preventDefault();
        renderDisruptionList(els, mobileQuery, _getCurrentEntry(), stampEl);
        updateControls();
        return;
      }
    }

    const item = e.target?.closest?.('.mobile-disruption-item[data-log-id]');
    if (!item) return;
    e.preventDefault();
    const logId = utils.normalizeId(item.getAttribute('data-log-id'));
    if (!logId) return;
    const entry = getLogsById().get(logId);
    if (entry) {
      setFromSearch(false);
      renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls);
    }
  });

  textEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!mobileQuery.matches) return;
    const target = e.target?.closest?.(".mobile-active-log-title[data-open-disruption-list='1']");
    if (!target) return;
    e.preventDefault();
    renderDisruptionList(els, mobileQuery, _getCurrentEntry(), stampEl);
    updateControls();
  });

  // === DISRUPTION NODE CLICKS ===

  if (disruptionNodesRoot) {
    disruptionNodesRoot.addEventListener('click', async (e) => {
      const link = e.target?.closest?.('a.log-line[href]');
      if (!link) return;
      const slug = disruptionSlugFromHref(link.getAttribute('href'));
      if (!slug) return;

      e.preventDefault();
      await ensureLoaded();
      if (!isLoaded()) return;

      const entry = pickEntryForDisruptionSlug(slug);
      if (!entry) return;
      setCurrentEntryId(utils.normalizeId(entry.id));
      setFromSearch(false);
      renderDisruptionList(els, mobileQuery, entry, stampEl);
      updateControls();
    });
  }

  // === RECENT LOG CLICKS ===

  if (recentLogsRoot) {
    recentLogsRoot.addEventListener('click', async (e) => {
      const link = e.target?.closest?.('a.log-line[href]');
      if (!link) return;
      const logId = logIdFromHref(link.getAttribute('href'));
      if (!logId) return;

      e.preventDefault();
      await ensureLoaded();
      if (!isLoaded()) return;

      const entry = getLogsById().get(logId);
      if (!entry) return;
      setCurrentEntryId(logId);
      setFromSearch(false);
      renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls);
    });
  }

  if (backFromSearchBtn) {
    backFromSearchBtn.addEventListener('click', async () => {
      if (!isFromSearch()) return;
      await openScan(els, mobileQuery);
      updateControls();
    }, { passive: true });
  }
  if (mobileNav) {
    mobileNav.addEventListener('dblclick', (e) => {
      const btn = e.target?.closest?.('.mobile-log-nav-btn');
      if (!btn) return;
      e.preventDefault();
    }, { passive: false });
  }
  // === SUB-MODULE INIT ===

  initGestureListeners(els, mobileQuery, stampEl, recentLogsRoot, updateControls, _getCurrentEntry);
  initScannerListeners(els, mobileQuery, stampEl, recentLogsRoot, updateControls, getLastNonScanMode, _getCurrentEntry);

  // === MEDIA QUERY HANDLER ===

  const onMediaChange = () => {
    if (mobileQuery.matches) ensureLoaded();
    updateControls();
  };

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', onMediaChange);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(onMediaChange); // Safari < 14 fallback
  }

  // === INITIAL LOAD ===

  ensureLoaded().then(() => {
    if (!isLoaded()) return;
    const currentId = getOrderedIds()[resolveCurrentIndex(stampEl)];
    if (currentId) {
      renderEntry(els, mobileQuery, getLogsById().get(currentId), stampEl, recentLogsRoot, updateControls);
    }
    updateControls();
  });

  updateControls();
}

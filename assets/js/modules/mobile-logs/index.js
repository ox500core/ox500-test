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
  isFromDisruption,
  setFromDisruption,
  maybePrefetchAroundListIndex,
} from './store.js';
import {
  renderEntry,
  renderDisruptionList,
  setViewMode,
  setLogStamp,
  markCurrentRecentLog,
  markCurrentDisruptionNode,
  disruptionKey,
  disruptionSlugFromHref,
  logIdFromHref,
  pickEntryForDisruptionSlug,
  getCurrentEntry,
} from './renderer.js';
import { initGestureListeners } from './gestures.js';
import { initScannerListeners, openScan } from './scanner.js';
import { MOBILE_BREAKPOINT } from './config.js';

function normalizedId(value) {
  return String(value || '').replace(/\D/g, '');
}

function numericId(value) {
  return Number(normalizedId(value));
}

function applyNavButtonState(button, enabled) {
  if (!button) return;
  button.disabled = !enabled;
  button.classList.toggle('disabled', !enabled);
}

function buildDisruptionOrderMap(logs) {
  const newestByKey = new Map();
  logs.forEach((entry) => {
    const key = disruptionKey(entry);
    if (!key) return;
    const idNum = numericId(entry?.id);
    const previous = newestByKey.get(key);
    if (!previous || idNum > previous.idNum) newestByKey.set(key, { idNum, entry });
  });
  const disruptionOrder = Array.from(newestByKey.entries())
    .sort((a, b) => a[1].idNum - b[1].idNum)
    .map(([key]) => key);
  return { newestByKey, disruptionOrder };
}

function createDisruptionCache() {
  return {
    key: '',
    disruptionOrder: [],
    newestByKey: new Map(),
    entriesByKey: new Map(),
  };
}

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
  const mobileIndexNav = document.querySelector('.mobile-index-nav');
  const desktopIndexNav = document.getElementById('rightBlock2');

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
  const disruptionCache = createDisruptionCache();

  function getLogsVersionKey() {
    const logs = getLogs();
    if (!logs.length) return '0';
    return `${logs.length}:${logs[0]?.id || ''}:${logs[logs.length - 1]?.id || ''}`;
  }

  function getDisruptionData() {
    const key = getLogsVersionKey();
    if (disruptionCache.key === key) return disruptionCache;

    const logs = getLogs();
    const { newestByKey, disruptionOrder } = buildDisruptionOrderMap(logs);
    const entriesByKey = new Map();
    logs.forEach((entry) => {
      const dKey = disruptionKey(entry);
      if (!dKey) return;
      if (!entriesByKey.has(dKey)) entriesByKey.set(dKey, []);
      entriesByKey.get(dKey).push(entry);
    });

    disruptionCache.key = key;
    disruptionCache.disruptionOrder = disruptionOrder;
    disruptionCache.newestByKey = newestByKey;
    disruptionCache.entriesByKey = entriesByKey;
    return disruptionCache;
  }

  // === CONTROLS ===

  function updateControls() {
    if (!prevBtn || !nextBtn) return;
    if (backFromSearchBtn) {
      const inEntryMode = textEl?.dataset?.viewMode === 'entry';
      const backToSearch = Boolean(isFromSearch() && inEntryMode);
      const backToDisruption = Boolean(isFromDisruption() && inEntryMode);
      const showBack = backToSearch || backToDisruption;
      backFromSearchBtn.hidden = !showBack;
      if (showBack) {
        backFromSearchBtn.textContent = '↩ BACK';
        backFromSearchBtn.setAttribute('aria-label', backToSearch ? 'Back to search results' : 'Back to disruption list');
      }
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

      const { disruptionOrder } = getDisruptionData();
      const idx = disruptionOrder.indexOf(currentKey);
      const canPrev = idx > 0;
      const canNext = idx >= 0 && idx < disruptionOrder.length - 1;

      if (idx >= 0) {
        void maybePrefetchAroundListIndex(idx, disruptionOrder.length, 10);
      }

      applyNavButtonState(prevBtn, canPrev);
      applyNavButtonState(nextBtn, canNext);
      return;
    }

    if (textEl?.dataset?.viewMode === 'entry' && isFromDisruption()) {
      const currentEntry = getCurrentEntry(stampEl);
      const currentKey = disruptionKey(currentEntry);
      if (currentEntry && currentKey) {
        const { entriesByKey } = getDisruptionData();
        const list = entriesByKey.get(currentKey) || [];

        const currentId = normalizedId(currentEntry?.id);
        const idx = list.findIndex((entry) => normalizedId(entry?.id) === currentId);

        if (idx >= 0) {
          void maybePrefetchAroundListIndex(idx, list.length, 10);
          const canPrev = idx > 0;
          const canNext = idx < list.length - 1;
          applyNavButtonState(prevBtn, canPrev);
          applyNavButtonState(nextBtn, canNext);
          return;
        }
      }
    }

    const idx = resolveCurrentIndex(stampEl);
    const canPrev = idx > 0;
    const canNext = idx >= 0 && idx < getOrderedIds().length - 1;

    applyNavButtonState(prevBtn, canPrev);
    applyNavButtonState(nextBtn, canNext);
  }

  // === CURRENT ENTRY GETTER ===

  function _getCurrentEntry() {
    return getCurrentEntry(stampEl);
  }

  function getLatestDisruptionEntry() {
    const { disruptionOrder, newestByKey } = getDisruptionData();
    if (!disruptionOrder.length) return null;
    const latestKey = disruptionOrder[disruptionOrder.length - 1];
    return newestByKey.get(latestKey)?.entry || null;
  }

  function hydrateInitialEntryState(entry) {
    if (!entry || !textEl || !stampEl) return false;
    const entryId = utils.normalizeId(entry?.id || '');
    const initialId = utils.normalizeId(textEl.dataset.initialLogId || '');
    if (!entryId || !initialId || entryId !== initialId) return false;

    setViewMode(els, 'entry');
    setLogStamp(stampEl, entry?.id || '----', entry?.date || '----');
    setCurrentEntryId(entryId);
    markCurrentRecentLog(recentLogsRoot, entryId);
    markCurrentDisruptionNode(entry);
    if (document.body) document.body.dataset.logLevel = entryId;
    return true;
  }

  function renderOutputView() {
    const youtubeHref = document.querySelector('#rightBlock2 a[href][data-tab="youtube"], #rightBlock2 a[href*="youtube"]')?.getAttribute('href')
      || document.querySelector('#rightBlock2 a[href*="youtu"]')?.getAttribute('href')
      || '#';
    const bandcampHref = document.querySelector('#rightBlock2 a[href*="bandcamp"]')?.getAttribute('href') || '#';
    const githubHref = document.querySelector('#rightBlock2 a[href*="github"]')?.getAttribute('href') || '#';

    setViewMode(els, 'output');
    textEl.innerHTML =
      `<div class="mobile-output-node">` +
      `EXTERNAL_NODES<br>` +
      `TRANSMISSIONS : <a href="${utils.escapeHtml(youtubeHref)}">YOUTUBE</a><br>` +
      `AUDIO_ARCHIVE : <a href="${utils.escapeHtml(bandcampHref)}">BANDCAMP</a><br>` +
      `SOURCE_REPO   : <a href="${utils.escapeHtml(githubHref)}">GITHUB</a>` +
      `</div>`;
    if (typeof textEl.scrollTo === 'function') textEl.scrollTo(0, 0);
    updateControls();
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
      setFromDisruption(true);
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
      setFromDisruption(false);
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
      setFromDisruption(false);
      renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls);
    });
  }

  if (backFromSearchBtn) {
    backFromSearchBtn.addEventListener('click', async () => {
      if (isFromSearch()) {
        await openScan(els, mobileQuery);
        updateControls();
        return;
      }
      if (!isFromDisruption()) return;
      setFromSearch(false);
      setFromDisruption(false);
      renderDisruptionList(els, mobileQuery, _getCurrentEntry(), stampEl);
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

  async function handleIndexTabClick(e) {
    const link = e.target?.closest?.('a[data-tab]');
    if (!link) return;

    const tab = String(link.getAttribute('data-tab') || '').trim().toLowerCase();
    if (!tab || (tab !== 'core' && tab !== 'disruption' && tab !== 'output')) return;
    e.preventDefault();

    if (tab === 'core') {
      const coreUrl = String(link.getAttribute('href') || window.location.pathname).split('#')[0];
      window.location.assign(`${coreUrl}#activeViewPanel`);
      return;
    }

    await ensureLoaded();
    if (!isLoaded()) return;

    if (tab === 'disruption') {
      const latestDisruption = getLatestDisruptionEntry();
      if (!latestDisruption) return;
      setFromSearch(false);
      setFromDisruption(false);
      renderDisruptionList(els, mobileQuery, latestDisruption, stampEl);
      updateControls();
      return;
    }

    setFromSearch(false);
    setFromDisruption(false);
    renderOutputView();
  }

  if (mobileIndexNav) {
    mobileIndexNav.addEventListener('click', handleIndexTabClick);
  }
  if (desktopIndexNav) {
    desktopIndexNav.addEventListener('click', handleIndexTabClick);
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
      const entry = getLogsById().get(currentId);
      if (!entry) return;
      setFromSearch(false);
      setFromDisruption(false);
      if (!hydrateInitialEntryState(entry)) {
        renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls);
      }
    }
    updateControls();
  });

  updateControls();
}

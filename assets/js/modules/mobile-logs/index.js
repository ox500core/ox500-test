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
import { createMobileNavController } from './nav.js';

// === INIT ===

export function initMobileLogs() {
  const shellLayout = document.body?.dataset?.layout === 'shell';
  if (!shellLayout || !window.matchMedia) return;

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
  const navController = createMobileNavController({
    textEl,
    stampEl,
    prevBtn,
    nextBtn,
    backFromSearchBtn,
    isFromSearch,
    isFromDisruption,
    isLoaded,
    getOrderedIds,
    resolveCurrentIndex,
    getLogs,
    maybePrefetchAroundListIndex,
    getCurrentEntry,
    disruptionKey,
  });
  const { updateControls } = navController;
  // === CURRENT ENTRY GETTER ===

  function _getCurrentEntry() {
    return getCurrentEntry(stampEl);
  }

  function setNavigationOrigin(fromSearch, fromDisruption) {
    setFromSearch(Boolean(fromSearch));
    setFromDisruption(Boolean(fromDisruption));
  }

  function showEntry(entry, fromSearch, fromDisruption) {
    if (!entry) return;
    setNavigationOrigin(fromSearch, fromDisruption);
    renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls);
  }

  function showDisruptionList(entry, fromSearch, fromDisruption) {
    if (!entry) return;
    setNavigationOrigin(fromSearch, fromDisruption);
    renderDisruptionList(els, mobileQuery, entry, stampEl);
    updateControls();
  }

  function showCurrentDisruptionList() {
    renderDisruptionList(els, mobileQuery, _getCurrentEntry(), stampEl);
    updateControls();
  }

  async function ensureBaseLogsReady() {
    await ensureLoaded();
    return isLoaded();
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

    if (!(await ensureBaseLogsReady())) return;

    if (tab === 'disruption') {
      const latestDisruption = navController.getLatestDisruptionEntry();
      if (!latestDisruption) return;
      showDisruptionList(latestDisruption, false, false);
      return;
    }

    setNavigationOrigin(false, false);
    renderOutputView();
  }

  function bindTextHandlers() {
    textEl.addEventListener('click', (e) => {
      const titleTarget = e.target?.closest?.('.mobile-active-log-title');
      if (titleTarget) {
        if (mobileQuery.matches) {
          e.preventDefault();
          showCurrentDisruptionList();
          return;
        }
        const linkTarget = e.target?.closest?.(".mobile-active-log-link[data-open-disruption-list='1']");
        if (linkTarget) {
          e.preventDefault();
          showCurrentDisruptionList();
          return;
        }
      }

      const item = e.target?.closest?.('.mobile-disruption-item[data-log-id]');
      if (!item) return;
      e.preventDefault();
      const logId = utils.normalizeId(item.getAttribute('data-log-id'));
      if (!logId) return;
      const entry = getLogsById().get(logId);
      showEntry(entry, false, true);
    });

    textEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!mobileQuery.matches) return;
      const target = e.target?.closest?.(".mobile-active-log-title[data-open-disruption-list='1']");
      if (!target) return;
      e.preventDefault();
      showCurrentDisruptionList();
    });
  }

  function bindRootLinkHandlers() {
    if (disruptionNodesRoot) {
      disruptionNodesRoot.addEventListener('click', async (e) => {
        const link = e.target?.closest?.('a.log-line[href]');
        if (!link) return;
        const slug = disruptionSlugFromHref(link.getAttribute('href'));
        if (!slug) return;

        e.preventDefault();
        if (!(await ensureBaseLogsReady())) return;

        const entry = pickEntryForDisruptionSlug(slug);
        if (!entry) return;
        setCurrentEntryId(utils.normalizeId(entry.id));
        showDisruptionList(entry, false, false);
      });
    }

    if (recentLogsRoot) {
      recentLogsRoot.addEventListener('click', async (e) => {
        const link = e.target?.closest?.('a.log-line[href]');
        if (!link) return;
        const logId = logIdFromHref(link.getAttribute('href'));
        if (!logId) return;

        e.preventDefault();
        if (!(await ensureBaseLogsReady())) return;

        const entry = getLogsById().get(logId);
        if (!entry) return;
        setCurrentEntryId(logId);
        showEntry(entry, false, false);
      });
    }
  }

  function bindBackAndNavGuards() {
    if (backFromSearchBtn) {
      backFromSearchBtn.addEventListener('click', async () => {
        if (isFromSearch()) {
          await openScan(els, mobileQuery);
          updateControls();
          return;
        }
        if (!isFromDisruption()) return;
        showDisruptionList(_getCurrentEntry(), false, false);
      }, { passive: true });
    }

    if (mobileNav) {
      mobileNav.addEventListener('dblclick', (e) => {
        const btn = e.target?.closest?.('.mobile-log-nav-btn');
        if (!btn) return;
        e.preventDefault();
      }, { passive: false });
    }
  }

  function bindIndexTabs() {
    if (mobileIndexNav) {
      mobileIndexNav.addEventListener('click', handleIndexTabClick);
    }
    if (desktopIndexNav) {
      desktopIndexNav.addEventListener('click', handleIndexTabClick);
    }
  }

  bindTextHandlers();
  bindRootLinkHandlers();
  bindBackAndNavGuards();
  bindIndexTabs();

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
      setNavigationOrigin(false, false);
      if (!hydrateInitialEntryState(entry)) {
        renderEntry(els, mobileQuery, entry, stampEl, recentLogsRoot, updateControls);
      }
    }
    updateControls();
  });

  updateControls();
}

